# Verzel Auction — Backend

API da **Casa de Leilões online** do teste técnico Elite Dev / Verzel.
Expõe uma API REST + um gateway WebSocket que atende:

- Vitrine pública de lotes (ao vivo, agendados, encerrados)
- Painel do leiloeiro (busca de itens em API pública, criação e cancelamento de lotes)
- Sala do lote ao vivo (lances, histórico, countdown, prorrogação anti-sniping, "você está ganhando / foi superado")
- Carteira do licitante com saldo total / comprometido / disponível + depósito simulado
- Liquidação automática no fim do lote + recibo público compartilhável
- Página de auditoria **pública** com detecção de adulteração do histórico (hash chain + selos HMAC)

> O design completo (decisões, trade-offs, migrações, perguntas em aberto) está em
> [`openspec/changes/add-auction-backend/design.md`](openspec/changes/add-auction-backend/design.md).
> Cada capability tem a sua spec em [`openspec/changes/add-auction-backend/specs/`](openspec/changes/add-auction-backend/specs/)
> — leia-as se quiser as regras no detalhe (cenários WHEN/THEN).

---

## Stack

- **Node.js 22** + **NestJS 12** + **TypeScript**
- **PostgreSQL 16** + **Prisma** (migrações, cliente tipado)
- **Socket.IO** (WebSocket, namespace `/live-lots`)
- **@nestjs/swagger** — documentação OpenAPI em `/api/docs`
- **JWT** (`passport-jwt`) para autenticação, **bcrypt** para hash de senhas
- **class-validator** + **zod** para validação
- Hash chain **SHA-256** + selos **HMAC-SHA256** para a auditoria à prova de adulteração

---

## Como rodar localmente

### Pré-requisitos

- Node.js 22 (o repo usa `.nvmrc` quando presente)
- Docker (para subir o Postgres com um comando) ou um Postgres 16 local

### 1. Clonar e instalar

```bash
git clone <este-repo> verzel-backend
cd verzel-backend
npm install
```

### 2. Configurar o `.env`

Copie o exemplo e ajuste os valores:

```bash
cp .env.example .env
```

Variáveis obrigatórias:

| Variável                 | Exemplo                                                                 | Descrição                                                                 |
|--------------------------|-------------------------------------------------------------------------|---------------------------------------------------------------------------|
| `DATABASE_URL`           | `postgresql://verzel:verzel@localhost:5432/verzel?schema=public`        | String de conexão do Postgres                                              |
| `JWT_SECRET`             | string aleatória ≥ 32 chars                                             | Assina os JWTs                                                            |
| `AUDIT_SIGNING_KEY`      | string aleatória ≥ 32 chars                                             | HMAC dos selos de auditoria — **não** armazenado no DB                    |
| `MET_API_BASE_URL`       | `https://collectionapi.metmuseum.org/public/collection/v1`              | API pública de onde o leiloeiro busca itens                               |
| `MET_API_TIMEOUT_MS`     | `5000`                                                                  | Timeout por request na API externa                                        |
| `PORT`                   | `3001`                                                                  | Porta HTTP                                                                |
| `CORS_ORIGIN`            | `http://localhost:3000`                                                 | Origem do front — vírgula separa várias                                   |
| `SEED_ON_BOOT`           | `false`                                                                 | Se `true`, roda o seed em cima de um DB vazio no boot (ver §4)            |

### 3. Subir o Postgres (opcional, via Docker)

```bash
docker run --name verzel-pg -e POSTGRES_USER=verzel -e POSTGRES_PASSWORD=verzel \
  -e POSTGRES_DB=verzel -p 5432:5432 -d postgres:16
```

Ou use o `docker-compose.yml` da raiz do projeto (sobe backend + banco juntos).

### 4. Migrar e semear o banco

```bash
npx prisma migrate deploy       # aplica as migrações
npm run db:seed                 # cria dados de teste (ver §Dados semeados)
```

### 5. Rodar

```bash
npm run start:dev
# API em  http://localhost:3001
# Docs em http://localhost:3001/api/docs
# WS em   ws://localhost:3001/live-lots
```

---

## Documentação da API (Swagger / OpenAPI)

Com o backend rodando, acesse:

- **Swagger UI** → <http://localhost:3001/api/docs>
- **OpenAPI JSON** → <http://localhost:3001/api/docs-json>
- **Health check** → <http://localhost:3001/api/health>

Todos os endpoints estão agrupados por capability (auth, external-items, lots, bidding, wallet, settlement, audit).
Rotas autenticadas pedem um bearer JWT (clique em **Authorize** na UI).

### Resumo das rotas principais

| Método | Rota                              | Papel         | O que faz                                                      |
|--------|-----------------------------------|---------------|----------------------------------------------------------------|
| POST   | `/api/auth/register`              | público       | Cadastra `auctioneer` ou `bidder`                              |
| POST   | `/api/auth/login`                 | público       | Retorna JWT (24 h)                                             |
| GET    | `/api/me`                         | autenticado   | Perfil do usuário logado                                       |
| GET    | `/api/external-items/search?q=`   | auctioneer    | Busca itens na API do Met (cache 10 min)                       |
| GET    | `/api/lots`                       | público       | Vitrine paginada (`?status=live|scheduled|ended`), sem cancelados |
| GET    | `/api/lots/:id`                   | público       | Detalhes do lote (lance atual, countdown, líder anônimo)       |
| POST   | `/api/lots`                       | auctioneer    | Cria lote a partir de item externo (snapshot local)            |
| POST   | `/api/lots/:id/cancel`            | auctioneer    | Cancela lote **sem lances**                                    |
| GET    | `/api/lots/:id/bids`              | público       | Histórico de lances (handles anônimos)                         |
| POST   | `/api/lots/:id/bids`              | bidder        | Dá um lance (ver regras abaixo)                                |
| GET    | `/api/me/wallet`                  | bidder        | `{ total, committed, available }` em centavos                  |
| POST   | `/api/me/wallet/deposits`         | bidder        | Depósito simulado                                              |
| GET    | `/api/me/wins`                    | bidder        | Lotes arrematados com link do recibo                           |
| GET    | `/api/me/lots`                    | auctioneer    | Lotes próprios com resultado                                   |
| GET    | `/api/me/revenue`                 | auctioneer    | Soma recebida em liquidações                                   |
| GET    | `/api/audit/lots/:id`             | **público**   | Histórico + bloco `integrity` (ok/first_failure)               |
| GET    | `/api/audit/receipts/:token`      | **público**   | Recibo compartilhável do vencedor                              |

### Códigos de erro (contrato estável)

Rejeições de regra de negócio retornam `HTTP 409` com corpo:

```json
{ "error": { "code": "below_min_increment", "message": "...", "details": { "required_cents": 500 } } }
```

Códigos usados (lista completa na spec de `bidding`, `wallet`, `auth`):

`below_starting_bid`, `below_min_increment`, `already_leading`,
`insufficient_available_balance`, `lot_not_started`, `lot_ended`,
`lot_cancelled`, `lot_has_bids_cannot_cancel`, `not_lot_owner`,
`role_forbidden`, `invalid_credentials`, `email_taken`, `unauthorized`,
`external_source_unavailable`.

---

## Realtime — namespace `/live-lots`

Socket.IO, uma sala por lote (`lot:{id}`).

- Cliente conecta em `/live-lots` passando `auth: { token }` (JWT opcional — conexão anônima é permitida como somente-leitura).
- `emit('join', { lot_id })` entra na sala; `emit('leave', { lot_id })` sai.
- Eventos recebidos:
  - `bid.placed` — `{ seq, amount_cents, handle, placed_at, new_ends_at }`
  - `lot.extended` — `{ new_ends_at, reason: "anti-sniping" }`
  - `lot.ended` — `{ winner_handle | null, final_amount_cents | null, settled_at, receipt_token? }`
  - `you.winning` / `you.outbid` — somente para o socket autenticado do próprio bidder

---

## Dados semeados

`npm run db:seed` cria (idempotente — pode rodar várias vezes):

| Papel        | E-mail                       | Senha        | Observação                              |
|--------------|------------------------------|--------------|------------------------------------------|
| Leiloeiro    | `auctioneer@verzel.test`     | `verzel123`  | Dono dos lotes semeados                  |
| Licitante 1  | `alice@verzel.test`          | `verzel123`  | Saldo inicial R$ 10.000,00               |
| Licitante 2  | `bob@verzel.test`            | `verzel123`  | Saldo inicial R$ 10.000,00               |

E ao menos **três lotes**: um `scheduled` (começa em breve), um `live` com 2–3 lances já dados por Alice/Bob, e um `ended` com vencedor e recibo. Todos referenciam objetos reais do Met, com snapshot local — rodam offline da API externa.

> As senhas acima são apenas para o ambiente de teste da avaliação; **não** reutilize em produção.

---

## Resiliência à API externa

A integração com o Met está isolada em `ExternalItemsService`:

- **Snapshot local** — na criação do lote, o JSON do item é persistido em `external_item`. A partir daí **vitrine, sala, auditoria e recibo não dependem mais do Met.**
- **Cache de busca** — resultados do `/search` ficam em memória (TTL 10 min). Se o Met estiver fora e o cache estiver quente, continua respondendo.
- **Falha explícita** — se o Met cair *e* o auctioneer precisar criar um lote de item nunca visto, a API responde `503 external_source_unavailable` com mensagem clara.

---

## Auditoria à prova de adulteração

- Cada lance guarda `prev_hash` e `curr_hash` (`SHA-256(prev_hash || canonical_bid_json)`).
- A cada 10 lances e sempre na liquidação, criamos um `audit_seal` com HMAC-SHA256 (`AUDIT_SIGNING_KEY` só vive no `.env`).
- `GET /api/audit/lots/:id` recomputa toda a cadeia + verifica todos os selos e devolve:
  ```json
  { "integrity": { "ok": true, "verified_at": "...", "head_hash": "..." } }
  ```
  Se alguém alterar/apagar/inserir um lance direto no banco, `ok` vira `false` e `first_failure` aponta a `seq` + motivo (`curr_hash_mismatch`, `seq_gap`, `prev_hash_mismatch`, `seal_hmac_invalid`, `seal_mismatch`).
- A auditoria **não expõe dados pessoais**: só mostra `handle` anônimo derivado via HMAC do par `(user_id, lot_id)`.

---

## Deploy

O backend é um processo Node único. Recomendado: **Fly.io**, **Render** ou **Railway** com um Postgres gerenciado.

```bash
npm run build
node dist/main
```

O `Dockerfile` da raiz do backend empacota multi-stage, roda como usuário não-root e dispara `prisma migrate deploy` antes de subir.

Health probe: `GET /api/health` → `{ status: "ok", uptime_seconds, version }`.

---

## Testes

```bash
npm test            # unitários
npm run test:e2e    # end-to-end (sobe Nest, usa supertest)
npm run test:cov    # cobertura
```

Alvos cobertos (quando a implementação terminar):
- Hash chain (bids válidos, tampering detectado)
- Regras de lance (todos os códigos de rejeição)
- Fluxo wallet (commit/release/debit/credit)
- Liquidação idempotente

---

## Comportamentos esperados que merecem atenção

> O brief pede que funcionalidades com comportamento inesperado sejam documentadas.
> Essas são escolhas de design, não bugs — e estão todas detalhadas em `design.md`.

- **Anti-sniping** — um lance nos últimos 2 min *do* `ends_at` corrente estende em +2 min. Isso significa que o `ends_at` que a vitrine mostra pode mudar sem o lote ter encerrado. Cap de +60 min no total para evitar loop infinito.
- **Lotes cancelados somem** da vitrine e de qualquer listagem pública. Ainda existem no banco (para auditoria do leiloeiro), mas a API nunca os lista.
- **O líder não pode cobrir o próprio lance** — mesmo que queira aumentar o lance, só pode fazê-lo depois de ser superado.
- **Saldo comprometido não é sacável** — enquanto o licitante lidera um lote, o valor correspondente fica comprometido e não aparece em `available`. Ao ser superado, volta imediatamente.
- **Recibo é por token UUID** — qualquer pessoa com o link vê o recibo (é o requisito do brief), mas o link é longo e aleatório.
- **Chave do HMAC não é rotacionável sem perder a verificação dos selos antigos** — cada selo embute o `key_id`, então em produção é possível rotacionar mantendo o par de chaves. Para o teste, mantemos uma chave única.
- **O recibo e a auditoria usam apenas o `handle` anônimo**. O vencedor vê o próprio recibo em `GET /me/wins` com os mesmos dados — não há vazamento de identidade mesmo para o próprio licitante.

---

## Estrutura do repositório (quando a implementação terminar)

```
verzel-backend/
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   └── seed.ts
├── src/
│   ├── auth/
│   ├── external-items/
│   ├── lots/
│   ├── bidding/
│   ├── wallet/
│   ├── settlement/
│   ├── audit/
│   ├── realtime/           # Socket.IO gateway
│   ├── common/             # pipes, filters, guards, decorators
│   ├── prisma/
│   ├── app.module.ts
│   └── main.ts
├── test/                   # e2e
├── openspec/               # specs do projeto (contrato)
└── README.md
```

---

## OpenSpec

Este backend é especificado antes de ser implementado, usando [OpenSpec](https://github.com/Fission-AI/OpenSpec).
A change ativa é [`add-auction-backend`](openspec/changes/add-auction-backend/):

- [`proposal.md`](openspec/changes/add-auction-backend/proposal.md) — o quê e por quê
- [`design.md`](openspec/changes/add-auction-backend/design.md) — decisões técnicas, trade-offs, migração
- [`specs/<capability>/spec.md`](openspec/changes/add-auction-backend/specs/) — requisitos com cenários WHEN/THEN (10 capabilities)
- [`tasks.md`](openspec/changes/add-auction-backend/tasks.md) — checklist de implementação

Comandos úteis:

```bash
openspec status --change add-auction-backend
openspec validate add-auction-backend --strict
openspec show add-auction-backend
```
