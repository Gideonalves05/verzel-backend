## Why

The Verzel Elite Dev technical test asks for a working online auction house (Casa de Leilões) within 7 days, with mandatory deploy and tamper-proof public auditing. The backend repository currently only contains the NestJS starter and has no domain capabilities, no persistence, no auth, no realtime, and no integration with the external items API. This proposal introduces, in one coherent change, every backend capability the test requires so the frontend and the evaluator can exercise the full flow — browse → create lot → bid live → settle → audit — against a deployed API.

## What Changes

- Introduce persistence (PostgreSQL + Prisma) and bootstrap the domain data model: users, wallets, external-item snapshots, lots, bids, settlements, receipts, audit seals.
- Add JWT-based authentication with two roles — `auctioneer` and `bidder` — and keep showcase + audit endpoints fully public.
- Integrate a public items API (Metropolitan Museum of Art) and cache every item snapshot locally so the showcase, live rooms, audit page, and receipts stay functional if the external API is unavailable.
- Add lot lifecycle: create (from a cached item), schedule, go live, cancel-without-bids, auto-end, settle, receipt.
- Add bidding engine enforcing live-only, starting bid, minimum increment, no self-outbid, anti-sniping (+2 min when bid lands in the last 2 min), and structured rejection reasons.
- Add wallet with committed balance (`available = total − committed`), simulated deposits, atomic commit/release on bid take/lose, debit on settlement.
- Add settlement job: on lot end, debit winner, credit auctioneer, issue a shareable receipt; close with no winner when there are no bids.
- Add tamper-evident bid history: per-lot hash chain over bids, periodic seals signed with a server key, published on the audit endpoint so any later alteration/removal/insertion is detectable from the public endpoint alone.
- Add privacy layer: audit and receipt expose only a stable per-lot anonymized bidder handle, never personal data.
- Add realtime: WebSocket gateway broadcasting bid events, countdown-relevant end extensions, and per-user "you are winning / you were outbid" messages for each live lot room.
- Add seed data: one auctioneer, two bidders with starting balance, one or more lots including at least one live lot with open bids.
- Non-functional foundations: environment-driven configuration, request validation, structured error responses, pagination for listings, and a Swagger/OpenAPI documentation endpoint.

Stretch (marked optional in tasks): lot search/filter, cancel-with-automatic-refund for the committed balance release path, Docker Compose for local run, and automated test coverage.

## Capabilities

### New Capabilities

- `auth`: user registration, login (JWT), role-based access for `auctioneer` and `bidder`, and public endpoint policy.
- `external-items`: integration with the Metropolitan Museum of Art public API, local snapshot cache, and read-only item lookup for lot creation.
- `lots`: lot CRUD-lite (create, list by status, get, cancel-when-no-bids), showcase visibility rules, and auctioneer dashboard aggregates.
- `bidding`: bid validation and acceptance, no-self-outbid, anti-sniping extension, structured rejection messages.
- `wallet`: deposits (simulated), committed vs. available balance, atomic hold on lead and release on outbid.
- `settlement`: end-of-lot settlement, winner debit, auctioneer credit, receipt generation, no-winner close.
- `audit-integrity`: per-lot hash chain, periodic seals, public verification endpoint, tamper detection.
- `realtime`: WebSocket gateway for live lot rooms (current bid, history, position, extension, win/lose notices).
- `seed-data`: deterministic seed that provisions one auctioneer, two bidders, and at least one live lot with open bids.
- `api-docs`: OpenAPI/Swagger documentation served from the running backend.

### Modified Capabilities

None — this is the first change in the repository and introduces the initial specs.

## Impact

- **Code**: all backend domain, controllers, services, gateways, guards, Prisma schema, migrations, seeds, and e2e scaffolding.
- **APIs**: new REST surface under `/api/*` (auth, items, lots, bids, wallet, me, audit) plus `/api/docs` (Swagger) and a `/ws` WebSocket namespace per live lot.
- **Dependencies** (added at implementation): `@nestjs/jwt`, `@nestjs/passport`, `passport-jwt`, `@nestjs/swagger`, `@nestjs/websockets`, `@nestjs/platform-socket.io`, `socket.io`, `prisma`, `@prisma/client`, `class-validator`, `class-transformer`, `bcrypt`, `zod` (or `nestjs-zod`), `cache-manager`.
- **Infra**: PostgreSQL (local via Docker Compose, remote in deploy), environment variables for DB URL, JWT secret, audit signing key, external API base URL and timeouts, and the showcase cache TTL.
- **Deploy**: public URL required by the test; health endpoint added so the hosting platform can probe liveness.
