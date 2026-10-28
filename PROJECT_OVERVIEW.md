# Verzel Auction — Casa de Leilões online

Submissão do teste técnico **Elite Dev — Verzel**.

Uma casa de leilões online onde o **leiloeiro** cria lotes a partir de itens de uma API pública,
e **licitantes** disputam cada lote com lances ao vivo. Qualquer pessoa — mesmo sem login —
pode auditar o histórico de um lote e verificar que ele não foi adulterado.

| Camada    | Stack                                       | Repositório                        | Deploy                            |
|-----------|---------------------------------------------|------------------------------------|-----------------------------------|
| Backend   | NestJS 12 + TypeScript + PostgreSQL/Prisma + Socket.IO | **este repositório**     | **`<URL do backend>`**            |
| Frontend  | Next.js 16 (App Router) + React 19 + Tailwind v4       | **repositório separado** | **`<URL do frontend>`**           |

> Este documento é uma visão geral da aplicação inteira (back + front). O repositório do frontend está no link apontado no formulário de entrega.
> Substitua as duas URLs acima pelas URLs públicas depois do deploy. O deploy do backend é obrigatório pelo brief e precisa estar acessível para o avaliador.
>
> **Avaliador: comece por [`HOW_TO_TEST.md`](./HOW_TO_TEST.md)** — é o roteiro de 10 minutos para validar cada requisito do PDF.

---

## Rodar tudo localmente em 3 passos

Pré-requisitos: Node 22, Docker (para o Postgres).

```bash
# 1. Backend (este repo)
cp .env.example .env         # ajuste JWT_SECRET e AUDIT_SIGNING_KEY
docker run --name verzel-pg -e POSTGRES_USER=verzel -e POSTGRES_PASSWORD=verzel \
  -e POSTGRES_DB=verzel -p 5432:5432 -d postgres:16
npm install
npx prisma migrate deploy
npm run db:seed              # cria 1 leiloeiro + 2 licitantes + 3 lotes
npm run start:dev            # http://localhost:3001 (API) e /api/docs (Swagger)
```

```bash
# 2. Frontend (clonar o repo separado, outra aba)
git clone <url-do-repo-frontend> verzel-app && cd verzel-app
cp .env.example .env.local   # NEXT_PUBLIC_API_BASE_URL=http://localhost:3001/api
npm install
npm run dev                  # http://localhost:3000
```

```bash
# 3. Abrir http://localhost:3000 e usar as credenciais de teste
```

Opcional: tem `docker-compose.yml` neste repo que sobe backend + Postgres com um comando (`docker compose up`).

---

## Credenciais de teste

Vêm do seed (`npm run db:seed` no backend). Senha para todos: `verzel123`.

| Papel        | E-mail                       | Para o quê serve                           |
|--------------|------------------------------|--------------------------------------------|
| Leiloeiro    | `auctioneer@verzel.test`     | Painel do leiloeiro, criar/cancelar lotes  |
| Licitante 1  | `alice@verzel.test`          | R$ 10.000,00 em saldo, dá lances           |
| Licitante 2  | `bob@verzel.test`            | R$ 10.000,00 em saldo, dá lances           |

Além dos usuários, o seed cria **3 lotes**: um `scheduled`, um `live` (com lances abertos),
um `ended` com vencedor e recibo. Dá para percorrer o fluxo inteiro sem configurar nada.

---

## Fluxo recomendado para avaliação (10 min)

> O passo a passo completo (com comandos SQL para o teste de adulteração e checklist por requisito do PDF) está em [`HOW_TO_TEST.md`](./HOW_TO_TEST.md). O resumo abaixo é um atalho.


1. **Vitrine pública** — abra `/` e navegue nas abas (ao vivo, agendados, encerrados). Note que lotes cancelados não aparecem.
2. **Sala do lote ao vivo** — entre no lote `live` seedado. Veja o lance atual, histórico anônimo, countdown.
3. **Logue como `alice@verzel.test`** e dê um lance ≥ atual + incremento. A badge muda para "Você está ganhando".
4. **Em outra aba, logue como `bob@verzel.test`** e dê um lance maior. Observe:
   - A primeira aba (Alice) recebe o toast "Você foi superado" e o saldo comprometido volta ao disponível.
   - Nas duas abas, o lance novo entra sem recarregar a página (WebSocket).
5. **Antissniping** — se você der um lance nos últimos 2 minutos, o `ends_at` do lote aumenta +2 min e um toast "Lote estendido" aparece.
6. **Painel do leiloeiro** — logue como `auctioneer@verzel.test`, busque um item na Met, crie um lote novo.
7. **Carteira** — como licitante, abra `/wallet` e faça um depósito simulado.
8. **Meus arremates** — abra `/my-wins` e copie o link do recibo do lote já encerrado.
9. **Página pública de auditoria** — abra o link `/audit/lots/<id>` do lote encerrado. Badge verde "Histórico íntegro".
10. **Teste de adulteração** (opcional, mostra o diferencial) — edite o `amount_cents` de um lance direto no Postgres:
    ```sql
    update bid set amount_cents = amount_cents + 1 where id = '<algum bid>';
    ```
    Recarregue `/audit/lots/<id>`: a badge fica vermelha, "Histórico adulterado na seq N — motivo: curr_hash_mismatch".

---

## Documentação da API

- **Swagger UI**: `<URL do backend>/api/docs`
- **OpenAPI JSON**: `<URL do backend>/api/docs-json`
- Lista de rotas, códigos de erro e exemplos: [`README.md`](./README.md)

---

## O que o PDF pede, onde está feito

| Requisito do brief                                         | Onde                                                              |
|-------------------------------------------------------------|-------------------------------------------------------------------|
| Vitrine (ao vivo / agendados / encerrados; cancelados escondidos) | front `/`                                                 |
| Painel do leiloeiro (buscar na API, criar, cancelar, resultados)  | front `/dashboard` e `/dashboard/new-lot`                 |
| Sala do lote ao vivo (lance atual, histórico, countdown, posição) | front `/lots/:id` + WebSocket `/live-lots` do back        |
| Carteira do licitante (total / comprometido / disponível + depósito) | front `/wallet`                                        |
| Meus arremates com comprovante compartilhável              | front `/my-wins` + `/receipt/:token`                              |
| Página de auditoria pública (sem login)                    | front `/audit/lots/:id` + back `/api/audit/*`                     |
| Mensagens de feedback para cada rejeição                   | front `lib/i18n/errors.ts` (mapeamento central pt-BR)             |
| Regras de lance (ao vivo, ≥ atual+incremento, não auto-cobrir) | back capability `bidding`                                     |
| Saldo comprometido com commit/release atômicos             | back capability `wallet`                                          |
| Antissniping (+2 min nos últimos 2 min)                    | back capability `bidding`                                         |
| Liquidação + recibo                                        | back capability `settlement`                                      |
| Histórico à prova de adulteração                           | back capability `audit-integrity` (hash chain + HMAC seals)       |
| Privacidade (handles anônimos no público)                  | back, em `audit-integrity` e `settlement`                         |
| Resiliência à API externa                                  | back capability `external-items` (snapshot local)                 |
| Dados semeados (1 leiloeiro + 2 licitantes + lote live)    | back capability `seed-data` (`npm run db:seed`)                   |
| README detalhado                                           | Este arquivo + README por repo                                    |
| Deploy público                                             | URLs no topo deste documento                                      |

Opcionais do brief que foram adotados:
- **Dark mode** (frontend)
- **Docker Compose** (raiz)
- **Testes automatizados** (unitários + e2e no backend, Playwright smoke no frontend)
- **Busca/filtro de lotes** por título

---

## Onde o processo é "spec-driven"

Antes de escrever código, especificamos cada capability com [OpenSpec](https://github.com/Fission-AI/OpenSpec).
Isso garante que o front e o back conversem a mesma linguagem (códigos de erro, formato de payload, regras),
e que o avaliador consiga ler os requisitos **antes** do código.

- Backend (este repo): [`openspec/changes/add-auction-backend/`](./openspec/changes/add-auction-backend/)
  — proposal, design, 10 capability specs (auth, external-items, lots, bidding, wallet, settlement, audit-integrity, realtime, seed-data, api-docs), tasks.
- Frontend (repo separado): `openspec/changes/add-auction-frontend/` — proposal, design,
  11 capability specs (app-shell, api-client, auth-ui, showcase, auctioneer-dashboard, live-lot-room, bidder-wallet, my-wins, audit-page, receipt-page, feedback-messages), tasks.

Ambas as changes passam em `openspec validate <change> --strict`.

---

## Onde e como usei IA (resposta ao campo do formulário)

Usei o **Claude Code** (Opus 4.7) da Anthropic como par de trabalho ao longo do desafio.
O uso foi dividido em três fases:

1. **Entendimento do brief** — li o PDF com o Claude, extraí requisitos funcionais e não-funcionais,
   e cruzei com padrões do mercado (Catawiki, LiveAuctioneers, Superbid citados no brief) para calibrar escopo.
2. **Especificação (fase atual deste repo)** — usei o skill [`openspec-propose`](https://github.com/Fission-AI/OpenSpec)
   para redigir, em par com o Claude, as proposals, designs e specs completas de backend e frontend.
   Cada decisão (Prisma vs TypeORM, hash chain vs Merkle, Socket.IO vs SSE, Next SSR vs CSR) foi
   discutida e justificada no `design.md` do respectivo repo. **Revisei todas as specs antes de validar.**
3. **Implementação** — a implementação segue os `tasks.md` gerados; o Claude me ajuda com boilerplate,
   mas eu reviso cada diff, rodo os testes e valido a UX manualmente. Nenhum código entra sem passar
   por mim.

Pontos onde **não** usei IA cegamente: regra criptográfica da auditoria (verifiquei a lógica à mão),
cenário de concorrência da aceitação de lance (desenhei o lock no papel antes de aceitar o design),
e as mensagens em português para o licitante — reescritas com as palavras exatas do brief.

---

## Repositórios

- **Backend** (este repo): `<URL deste repo no GitHub>`
- **Frontend**: `<URL do repo do frontend no GitHub>`

Ambos os links vão no formulário de entrega.

---

## Licença

Projeto feito como teste técnico; sem licença definida.
