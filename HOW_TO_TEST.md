# Como testar o sistema — guia para o avaliador

Este guia é o roteiro mais rápido para você, avaliador, validar a entrega.
Tempo total: **~10 minutos** se usar o deploy público, **~15 minutos** se rodar localmente.

> Se qualquer passo falhar, o problema está documentado — veja a seção
> [Problemas conhecidos](#problemas-conhecidos) no final.

---

## Antes de começar — escolha um caminho

### Caminho A — Usar o deploy público (recomendado, 0 setup)

1. Abra **`<URL do frontend>`** (está no formulário de entrega / `PROJECT_OVERVIEW.md`)
2. Pule para [Fluxo de avaliação](#fluxo-de-avaliação-10-min)

### Caminho B — Rodar localmente

Pré-requisitos: **Node 22+** e **Docker**.

**Opção B1 — Um comando (Docker Compose)**

```bash
# Dentro da pasta verzel-backend
cp .env.example .env
docker compose up -d          # sobe Postgres + backend em http://localhost:3001
docker compose exec backend npm run db:seed   # cria usuários e lotes

# Em outra aba, dentro da pasta verzel-app
cp .env.example .env.local    # já aponta para http://localhost:3001/api
npm install
npm run dev                   # http://localhost:3000
```

**Opção B2 — Manual (sem Docker Compose)**

```bash
# Backend
cp .env.example .env
docker run --name verzel-pg -e POSTGRES_USER=verzel -e POSTGRES_PASSWORD=verzel \
  -e POSTGRES_DB=verzel -p 5432:5432 -d postgres:16
npm install
npm run build
npx prisma migrate deploy
npm run db:seed
npm run start:dev             # http://localhost:3001  |  Swagger em /api/docs

# Frontend (outra aba)
cp .env.example .env.local
npm install
npm run dev                   # http://localhost:3000
```

Abra **http://localhost:3000**.

---

## Credenciais do seed

Senha para todos: **`verzel123`**

| Papel        | E-mail                      | O que usar para testar                       |
|--------------|-----------------------------|----------------------------------------------|
| Leiloeiro    | `auctioneer@verzel.test`    | Criar/cancelar lotes, ver resultados         |
| Licitante 1  | `alice@verzel.test`         | Dar lances (saldo inicial R$ 10.000,00)      |
| Licitante 2  | `bob@verzel.test`           | Dar lances (saldo inicial R$ 10.000,00)      |

O seed também cria **3 lotes** prontos:
- 1 **agendado** (`scheduled`) — começa no futuro
- 1 **ao vivo** (`live`) — já tem lances e aceita novos
- 1 **encerrado** (`ended`) — tem vencedor, recibo e página de auditoria populada

---

## Fluxo de avaliação (10 min)

Siga na ordem — cada passo valida um requisito do PDF.

### 1. Vitrine pública (não precisa logar) — 1 min
- Abra `/`
- Veja os cards de lote. Troque as abas **Ao vivo / Agendados / Encerrados**.
- Clique em qualquer lote para abrir a sala.
- **Checa**: vitrine lista por status, cards mostram imagem/título/lance atual/countdown, lotes cancelados não aparecem.

### 2. Sala do lote ao vivo (sem logar) — 1 min
- Abra o lote `live` seedado.
- Veja o lance atual, o histórico (com handles anônimos como `a1b2c3d4`), o countdown.
- Tente dar um lance → aparece **CTA para logar**, não o formulário.
- **Checa**: sala pública read-only, privacidade (ninguém vê nome real de licitante).

### 3. Login como licitante — 1 min
- Vá em **Entrar** → `alice@verzel.test` / `verzel123`.
- Volte à sala do lote `live`.
- Dê um lance ≥ (lance atual + incremento). O form já vem **pré-preenchido** com o mínimo válido.
- **Checa**: badge muda para **"Você está ganhando"**, saldo comprometido na carteira sobe pelo valor do lance.

### 4. Concorrência — 2 min
- Abra **outra aba anônima** → logue como `bob@verzel.test`.
- Entre no mesmo lote. Dê um lance maior.
- **Volte para a aba da Alice** sem recarregar.
- **Checa (acontece em tempo real, via WebSocket)**:
  - Toast **"Você foi superado"** aparece para Alice.
  - O lance do Bob aparece no histórico das duas abas sem recarregar.
  - Saldo **comprometido** da Alice volta para **disponível** imediatamente.
  - Badge da Alice vira **"Você foi superado"**; a do Bob, **"Você está ganhando"**.

### 5. Antissniping — 1 min
- Como leiloeiro, crie um lote curto (fim daqui a 3 min) ou use o lote `live` seedado se já estiver nos últimos 2 min.
- Dê um lance nos últimos 2 min do leilão.
- **Checa**: toast **"Lote estendido"**, countdown pula +2 min, campo `ends_at` novo aparece no histórico.

### 6. Painel do leiloeiro — 1 min
- Deslogue, logue como `auctioneer@verzel.test`.
- Vá em **Painel**: veja KPIs (lotes ao vivo, encerrados, receita total).
- Clique em **Novo lote**. Busque algo no campo (ex: `vase`, `mask`, `portrait`) → autocompleta da **API do Metropolitan Museum**.
- Escolha um item, defina início/fim/lance inicial/incremento, publique.
- **Checa**: integração com API pública funciona, lote novo aparece na vitrine.

### 7. Carteira — 1 min
- Logue como `alice@verzel.test`, vá em **Carteira**.
- Veja **Total / Comprometido / Disponível** e o extrato.
- Faça um depósito simulado (R$ 500,00).
- **Checa**: depósito aparece no extrato, Total sobe, Disponível sobe.

### 8. Meus arremates + recibo — 1 min
- Como `alice@verzel.test`, vá em **Meus arremates**.
- Deve haver pelo menos 1 (do lote `ended` seedado se foi a Alice que ganhou — senão logue como `bob@verzel.test`).
- Clique em **Abrir recibo** → página pública com dados do lote, vencedor (handle anônimo), valor, data, link para auditoria.
- Clique em **Copiar link do recibo** → URL compartilhável.
- **Checa**: recibo público, sem expor dados pessoais.

### 9. Auditoria pública — 1 min
- Na página do recibo, clique em **Ver auditoria completa**.
- Ou abra direto `/audit/lots/<id>` do lote encerrado.
- Veja a lista ordenada de lances, cada um com `seq`, handle, valor, hora, **short hash**.
- **Badge no topo**: 🟢 **"Histórico íntegro"**.
- **Checa**: página pública (não precisa logar), nenhum dado pessoal visível.

### 10. Prova de adulteração (o diferencial) — 2 min

Este é o teste que **comprova** a integridade do histórico.

```bash
# Pegue o id de um lance do lote encerrado:
docker exec -it verzel-pg psql -U verzel -d verzel -c \
  "select id, \"amountCents\" from \"Bid\" where \"lotId\" = '<id-do-lote>' order by seq desc limit 1;"

# Altere o valor em 1 centavo:
docker exec -it verzel-pg psql -U verzel -d verzel -c \
  "update \"Bid\" set \"amountCents\" = \"amountCents\" + 1 where id = '<id-do-bid>';"
```

Recarregue `/audit/lots/<id>` no navegador.

- **Checa**: badge fica 🔴 **"Histórico adulterado na seq N — motivo: `curr_hash_mismatch`"**.
- A alteração foi feita **direto no banco**, sem passar pela API, e mesmo assim o sistema detectou.

> Para desfazer (opcional): `update "Bid" set "amountCents" = "amountCents" - 1 where id = '<id>';`
> A badge volta a ficar verde.

---

## O que foi coberto do PDF

| Requisito do brief                                    | Validado no passo |
|-------------------------------------------------------|-------------------|
| Vitrine pública com filtro por status                 | 1                 |
| Sala ao vivo com lance atual, histórico, countdown    | 2, 3              |
| Painel do leiloeiro + integração com API pública      | 6                 |
| Regras de lance (≥ mínimo, não auto-cobrir, janela live) | 3, tentativas inválidas em 3/4 |
| Antissniping (+2 min)                                 | 5                 |
| Saldo comprometido com commit/release atômicos        | 3, 4, 7           |
| Depósito simulado                                     | 7                 |
| Liquidação + recibo compartilhável                    | 8                 |
| Página pública de auditoria                           | 9                 |
| Histórico à prova de adulteração                      | **10**            |
| Privacidade (handles anônimos)                        | 2, 8, 9           |
| Realtime sem recarregar                               | 4, 5              |
| Seed com 1 leiloeiro + 2 licitantes + lote live       | credenciais acima |
| Deploy público                                        | caminho A         |

---

## Documentação de apoio

- [`PROJECT_OVERVIEW.md`](./PROJECT_OVERVIEW.md) — visão geral da aplicação, decisões de design, onde usei IA.
- [`README.md`](./README.md) — operação do backend (rotas, códigos de erro, envs).
- **Swagger UI**: `<URL do backend>/api/docs` (ou `http://localhost:3001/api/docs` localmente).
- [`openspec/changes/add-auction-backend/`](./openspec/changes/add-auction-backend/) — specs completas (proposta, design, 10 capabilities).
- README do frontend está no outro repo.

---

## Problemas conhecidos

Nenhum bloqueador para a avaliação. Pontos que fiz questão de documentar porque
alguém pode notar e perguntar:

- **Primeiro build do backend demora** (~1-2 min) porque gera o Prisma Client. Depois fica instantâneo.
- **Reconexão de WebSocket** não mostra um indicador visual explícito — ao reconectar, o estado do lote é refetched e a UI continua correta, mas sem badge "reconectando". Está no `tasks.md` como ponto futuro.
- **`/me/bids`** (listar lances ativos do licitante) não foi exposto; a página **Meus arremates** só mostra arremates já ganhos. Documentado em `verzel-app/openspec/changes/add-auction-frontend/tasks.md` seção 10.2.
- **Deploy do frontend é opcional pelo brief** (só o backend é obrigatório). Se só o backend estiver no ar, rode o frontend localmente apontando para a URL pública do backend via `NEXT_PUBLIC_API_BASE_URL`.

Fora disso, o fluxo acima roda ponta a ponta.
