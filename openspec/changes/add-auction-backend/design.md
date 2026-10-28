## Context

The backend must power an online auction house end-to-end: public showcase of lots, auctioneer dashboard, bidder wallet, live bidding rooms with realtime updates, settlement with shareable receipts, and a public, tamper-evident audit of every bid. The brief requires a 7-day delivery with mandatory deploy, so every decision favors "boring" tooling that NestJS + a managed Postgres can host on Fly.io / Render / Railway without ceremony. The repo currently has only the NestJS 12 starter.

Key external-world constraints:
- The source of items is a public API that may be slow or down. The showcase, live room, audit, and receipt must keep working regardless.
- The audit history must be verifiable from a public endpoint by any evaluator, including after the lot is over.
- Bidding is strongly concurrent; the leader-and-committed-balance logic must be race-free.

## Goals / Non-Goals

**Goals:**
- A deployable NestJS 12 backend that fully implements the challenge's functional and non-functional requirements.
- Resilience to external-API outages for everything the user already sees.
- Tamper-evident bid history that an evaluator can verify from a single public URL.
- Realtime live-room updates with no polling.
- Reproducible local setup through `docker compose up` + `npm run seed`.
- Clean domain boundaries so the frontend can be built against a stable REST + WebSocket contract.

**Non-Goals:**
- Real payments, invoices, tax, or resale between bidders (explicitly excluded by the brief).
- Native mobile app, password recovery flow (brief says we don't need them).
- Horizontal scale beyond one process; a single Node process with Postgres covers the test.
- Internationalization of API responses (English error codes, Portuguese localization happens on the frontend).
- Full admin console; the auctioneer dashboard is scoped to the brief's "painel do leiloeiro".

## Decisions

### D1. Framework and runtime: NestJS 12 + TypeScript, Node 22

- The repo is already a NestJS 12 project. Keeping it avoids churn and gives us DI, guards, pipes, OpenAPI, and WebSocket modules out of the box.
- Alternatives considered: Fastify-only, Express plain, FastAPI. All rejected to preserve the starter and the brief's "use any Node framework" posture.

### D2. Database: PostgreSQL via Prisma

- Postgres gives us strong transactional semantics for the wallet/commit path and `SELECT … FOR UPDATE` to serialize bids on the same lot — essential for the "no two leaders at once" invariant.
- Prisma is picked over TypeORM because its migrations, typing, and `interactiveTransactions` are more ergonomic for a 7-day deadline. TypeORM's decorator model also fights NestJS 12's stricter TS options.
- Alternatives considered: MongoDB (rejected — multi-document transactions are second-class and the audit chain benefits from relational joins), MySQL (works but Postgres has slightly better `JSONB` for cached item snapshots).

### D3. External items API: The Metropolitan Museum of Art Collection API

- Base URL: `https://collectionapi.metmuseum.org/public/collection/v1`.
- Chosen because it is public, requires no API key, has a search endpoint (`/search?q=`) plus an object endpoint (`/objects/{id}`) that returns a rich JSON with image URL, title, culture, date, medium — perfect "item attributes" for a lot.
- Resilience strategy:
  - Every item the auctioneer picks is **snapshotted** into our `external_item` table (id, title, image URL, raw JSON, fetched_at). From then on the lot references the snapshot, never the live API.
  - Search is proxied through the backend with a `cache-manager` memory cache (TTL 10 minutes keyed by `q`) so repeated typeahead calls don't hammer the Met and the dashboard stays responsive on brief outages.
  - If the Met is down and the cache is cold, the search endpoint returns `503 external_source_unavailable` with a clear message, but the showcase, live rooms, audit, and receipts never depend on it — they read from local tables only.
  - Images are referenced by URL (we don't re-host) but we also persist the URL in the snapshot, so a later Met outage still shows a working `<img>` as long as the Met CDN is up (independent of the API). For maximum safety we may add an opt-in image-mirror job post-MVP.

### D4. Authentication: JWT (access-only), bcrypt-hashed passwords

- Stateless JWT with 24-hour expiry, signed with `JWT_SECRET` from env.
- Two roles: `auctioneer`, `bidder`, assigned at registration (user picks role from a short form; the brief doesn't need invite-only).
- Showcase (`GET /lots`, `GET /lots/:id`), audit (`GET /audit/lots/:id`, `GET /audit/receipts/:id`), and auth endpoints are public; everything else is role-guarded with Nest guards.
- Refresh tokens and password reset are out of scope (brief excludes them).

### D5. Bidding concurrency: single Postgres transaction with row lock on the lot

- A bid runs inside `prisma.$transaction(async tx => …, { isolationLevel: Serializable })` plus `SELECT … FOR UPDATE` on the lot row to serialize all bids on that lot.
- Inside the transaction we validate: lot is live, amount ≥ current_bid + min_increment (or ≥ starting_bid if no bids), bidder is not the current leader, bidder's `available = total − committed` ≥ amount.
- On accept we: insert `bid`, update `lot.current_bid_amount` + `current_leader_user_id`, release the previous leader's commit (`committed -= previous_amount`), create a new commit for this bidder (`committed += amount`), apply anti-sniping if `now > lot.ends_at - 2m` (`ends_at += 2m` capped at a sensible absolute max per lot of +60m to prevent an unbounded extension loop), append to the hash chain, and emit a WebSocket event after the commit.
- Rejections map to a stable error code: `below_starting_bid`, `below_min_increment`, `insufficient_available_balance`, `already_leading`, `lot_not_started`, `lot_ended`, `lot_cancelled`.

### D6. Wallet: integer cents, two columns, event log

- Store money as `BigInt` cents (`balance_total_cents`, `balance_committed_cents`) to avoid float drift.
- Deposits, commits, releases, debits, credits are all written to a `wallet_ledger` table (append-only) for traceability. The two balance columns are the running totals the API reads; the ledger is the source of truth if we ever need to rebuild them.
- `available = total − committed` is a derived value exposed in `/me/wallet`.

### D7. Settlement: scheduled timer per lot, idempotent

- A `@nestjs/schedule` cron tick (every 10s) looks for lots whose `ends_at` ≤ now and `status = 'live'` with no in-flight extension in the next 2 min.
- Settlement runs in a serializable transaction: mark `status = 'ended'`, if there is a `current_leader`, debit their wallet (`total -= amount`, `committed -= amount`), credit the auctioneer (`total += amount`), issue a `settlement` row and a `receipt` row with a UUID share token. If there is no leader, close with `winner = null` and no receipt.
- Idempotency: the job uses `UPDATE … WHERE status='live' RETURNING id` to claim lots atomically, so two overlapping ticks can't settle the same lot twice.

### D8. Tamper-evident bid history: per-lot hash chain + periodic signed seals

- Each `bid` row stores `prev_hash` (hex) and `curr_hash = SHA-256(prev_hash || canonical_bid_json)`. `canonical_bid_json` is deterministic JSON over `{lot_id, seq, bidder_handle, amount_cents, placed_at_iso}`. The first bid of a lot uses `prev_hash = SHA-256("lot:" || lot_id || ":genesis")`.
- Every N bids (default 10) and always at `settlement`, the backend creates an `audit_seal`: `{lot_id, seq, chain_head_hash, created_at}` signed with HMAC-SHA256 using `AUDIT_SIGNING_KEY` from env. Seals are append-only and public.
- The public audit endpoint returns the full ordered bid history (anonymized handles only) + all seals. The response includes `integrity: { ok, verified_at, head_hash }` where `ok` is true iff: every bid's `curr_hash` reproduces from `prev_hash + canonical_bid_json`, every `prev_hash` matches the previous bid's `curr_hash`, and every seal's HMAC verifies against the server's public key material (we expose the HMAC key id, not the secret). Any later tamper — row deleted, row edited, row inserted — will cause the chain to desync or the HMAC to fail, and the endpoint reports `ok: false` with the first failing seq.
- Why not Merkle: a linear hash chain is sufficient for one audit stream per lot (sequential history), simpler to implement in 7 days, and still fully detects alteration, deletion, and insertion.
- Why not an external anchor (OpenTimestamps, blockchain): extra ops burden for a 7-day test; HMAC-signed seals satisfy "a bad DBA cannot rewrite history and get away with it" because they cannot forge seals without the signing key, which lives in env (not DB).

### D9. Privacy handles

- At registration a bidder gets a `global_handle` like `bidder-7fa3` (random 4-hex suffix). Audit never exposes name/email.
- Per lot we derive a stable `lot_handle = base58(HMAC-SHA256(AUDIT_SIGNING_KEY, user_id || ":" || lot_id))[0:8]` so the same bidder is recognizable within one lot (needed for "position in the bidding") but not linkable across lots to the public.
- The winning receipt uses `lot_handle` publicly, and the winner's own `GET /me/wins` endpoint discloses the mapping only to the winner themselves.

### D10. Realtime: WebSocket gateway with Socket.IO rooms per lot

- `@nestjs/websockets` + `@nestjs/platform-socket.io`. Namespace `/live-lots`, one room per `lot_id` (`lot:{id}`).
- Events emitted:
  - `bid.placed` — `{seq, amount_cents, handle, placed_at, new_ends_at}`.
  - `lot.extended` — `{new_ends_at, reason: 'anti-sniping'}` (also folded into `bid.placed` to save a round trip; emitted separately on no-bid extensions, which don't exist here but kept for future).
  - `lot.ended` — `{winner_handle | null, final_amount_cents | null}`.
  - `you.winning` / `you.outbid` — targeted at the specific user's socket inside the room.
- Clients authenticate on connect by passing the JWT as a `token` auth payload; unauthenticated connections may still join rooms as read-only for the showcase/countdown use case.
- Horizontal scale is out of scope; a single process keeps the Socket.IO in-memory adapter sufficient.

### D11. API documentation: `@nestjs/swagger` at `/api/docs`

- All DTOs are decorated with `@ApiProperty` and `class-validator` so Swagger UI, generated OpenAPI JSON (`/api/docs-json`), and request validation share one source of truth. The brief evaluator can hit `/api/docs` directly on the deploy URL.

### D12. Config & env

- `@nestjs/config` loads `.env`. Required keys: `DATABASE_URL`, `JWT_SECRET`, `AUDIT_SIGNING_KEY`, `MET_API_BASE_URL` (default `https://collectionapi.metmuseum.org/public/collection/v1`), `MET_API_TIMEOUT_MS`, `PORT`, `CORS_ORIGIN`. A `config.schema.ts` using `zod` fails fast at boot if a required var is missing.

### D13. Validation and errors

- All inbound DTOs validated with `class-validator`; a global `ValidationPipe({ whitelist: true, transform: true })` is enabled in `main.ts`.
- A global `HttpExceptionFilter` emits a standardized body: `{ error: { code: string, message: string, details?: object } }`. Business rule rejections map to HTTP 409 with a stable `code` (see D5) so the frontend can show the brief's required messages verbatim.

### D14. Seed data

- `npm run db:seed` (ts-node script using Prisma) inserts: one auctioneer (`auctioneer@verzel.test`), two bidders (`alice@verzel.test`, `bob@verzel.test`) each with a 10,000.00 BRL starting balance, and three lots — one scheduled, one live (with 2–3 open bids), one ended with a winner — so the evaluator can walk the full flow immediately. Default password for seeded users is in the README.

### D15. Pagination and filtering

- All list endpoints accept `?page=1&pageSize=20` (max 50) and return `{ data, page, pageSize, total }`. Lots list accepts `?status=live|scheduled|ended` and optionally `?q=` for the stretch search filter.

## Risks / Trade-offs

- **[Prisma + Postgres `FOR UPDATE` lock contention on a hot lot]** → in practice the test has a handful of concurrent bidders. A single lot's bid rate is low; the serializable transaction stays short (<10 ms). If this ever becomes a hot path, we can shard by `lot_id` into a worker queue. Documented as future work.
- **[Anti-sniping could extend a lot indefinitely with determined bidders]** → cap the total extension at +60 min per lot (`max_ends_at = original_ends_at + 60m`) to bound the server loop.
- **[Audit chain breaks if we ever edit a bid "legitimately"]** → by policy, bids are append-only. The spec forbids editing or deleting any bid. If a mistake must be corrected, we insert a compensating `withdrawn` row (future work; not in MVP) so the chain stays intact.
- **[HMAC key leak would let an attacker forge seals]** → the key lives only in the deploy env and is never persisted in the DB. We rotate the key via config; old seals keep verifying because the key id is embedded in each seal record.
- **[Clock drift between app and DB would skew lot "live" checks]** → we always use the DB clock (`now()`) in the transaction's `WHERE` for state transitions, and only use app clock for cron timing (10 s resolution is fine).
- **[External API outages during a demo]** → mitigated by snapshotting at creation time. Documented in README.

## Migration Plan

- This is the first change; there is nothing to migrate from.
- Rollout: run `prisma migrate deploy` on the hosted Postgres, start the Nest process, run the seed on first boot (behind a `SEED_ON_BOOT=true` flag so we don't reseed on every restart).
- Rollback: `prisma migrate reset` on a fresh DB (the test deploy is throwaway).

## Open Questions

- Q1: Should the "ended" state transition emit a receipt download URL inside the WebSocket `lot.ended` event, or only via REST? **Default:** include a shareable receipt URL in the event payload for winners, so the frontend can toast "You won — download receipt" without a round trip.
- Q2: Minimum bid increment — the brief says "incremento mínimo" per lot, which we expose as `min_increment_cents` on lot creation. Should we default it to 5% of starting bid if the auctioneer leaves it blank? **Default:** no default; the field is required at creation so the auctioneer makes the choice.
- Q3: Should the Met API `objectID` be surfaced in the public lot payload? **Default:** yes, under `source: { provider: "met", object_id: 123 }`, so anyone can cross-verify the item on the Met site.
