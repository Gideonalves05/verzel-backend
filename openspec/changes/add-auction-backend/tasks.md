## 1. Project setup & tooling

- [x] 1.1 Add dependencies: `@nestjs/jwt`, `@nestjs/passport`, `passport`, `passport-jwt`, `@nestjs/swagger`, `swagger-ui-express`, `@nestjs/websockets`, `@nestjs/platform-socket.io`, `socket.io`, `@nestjs/schedule`, `@nestjs/config`, `@nestjs/axios`, `axios`, `prisma`, `@prisma/client`, `class-validator`, `class-transformer`, `bcrypt`, `cache-manager`, `uuid`, `zod`
- [x] 1.2 Add dev dependencies: `@types/bcrypt`, `@types/passport-jwt`, `@types/uuid`, `ts-node` (if not present)
- [x] 1.3 Configure global `ValidationPipe({ whitelist: true, transform: true })` in `src/main.ts`
- [x] 1.4 Add global `HttpExceptionFilter` that emits `{ error: { code, message, details? } }`
- [x] 1.5 Set up `@nestjs/config` + `zod` schema for required env vars (`DATABASE_URL`, `JWT_SECRET`, `AUDIT_SIGNING_KEY`, `MET_API_BASE_URL`, `MET_API_TIMEOUT_MS`, `PORT`, `CORS_ORIGIN`)
- [x] 1.6 Enable CORS from `CORS_ORIGIN` and compression middleware

## 2. Database & Prisma

- [x] 2.1 Add `prisma/schema.prisma` with models: `User`, `Wallet`, `WalletLedgerEntry`, `ExternalItem`, `Lot`, `Bid`, `AuditSeal`, `Settlement`, `Receipt`
- [x] 2.2 Add enums `UserRole`, `LotStatus`, `WalletLedgerKind`
- [ ] 2.3 Create initial migration `init` *(requires a running Postgres — run `npx prisma migrate dev --name init` locally)*
- [x] 2.4 Create a `PrismaModule` + `PrismaService` with graceful shutdown
- [x] 2.5 Add index on `Bid(lot_id, seq)` unique and `Lot(status, ends_at)` for scheduler

## 3. Capability: auth

- [x] 3.1 Implement `AuthModule` with `/api/auth/register` (bcrypt hash, assigns global handle, creates wallet when role=bidder)
- [x] 3.2 Implement `/api/auth/login` returning JWT (24h, id + role in claims)
- [x] 3.3 Implement `JwtAuthGuard` + optional-auth strategy for public endpoints
- [x] 3.4 Implement `RolesGuard` + `@Roles(...)` decorator
- [x] 3.5 Implement `GET /api/me` returning `{ id, email, role, handle }`
- [ ] 3.6 Unit test role guard: auctioneer blocked from bidding, bidder blocked from creating lots

## 4. Capability: external-items

- [x] 4.1 Implement `MetClient` service wrapping `GET /search` and `GET /objects/:id` with configurable timeout and 503 mapping
- [x] 4.2 Wrap search results in a memory cache (TTL from config, default 10 min, keyed by normalized query)
- [x] 4.3 Implement `ExternalItemsService.snapshot(provider, externalId)` that fetches once, persists `ExternalItem`, returns cached rows afterward
- [x] 4.4 Implement `GET /api/external-items/search` (auctioneer only) returning the paginated DTO
- [ ] 4.5 Add e2e test: showcase still works with the external API mocked to return 500

## 5. Capability: lots

- [x] 5.1 Implement `LotsModule`, `LotsService`, `LotsController`
- [x] 5.2 `POST /api/lots` (auctioneer): validate dates, positive amounts, snapshot external item, persist lot
- [x] 5.3 `GET /api/lots` (public): paginated, status filter, excludes cancelled, computes effective status
- [x] 5.4 `GET /api/lots/:id` (public): includes `current_bid_amount_cents`, `current_leader_handle`, `ends_at`
- [x] 5.5 `POST /api/lots/:id/cancel` (owner auctioneer, zero bids only)
- [x] 5.6 `GET /api/me/lots` (auctioneer): own lots with results on ended
- [x] 5.7 `GET /api/me/revenue` (auctioneer): aggregates `total_received_cents`, `settled_lot_count`

## 6. Capability: bidding

- [x] 6.1 Implement `BiddingService.placeBid()` inside `prisma.$transaction` with `SELECT … FOR UPDATE` on the lot row (serializable)
- [x] 6.2 Enforce rules: `lot_not_started`, `lot_ended`, `lot_cancelled`, `below_starting_bid`, `below_min_increment`, `already_leading`, `insufficient_available_balance`
- [x] 6.3 Atomically release previous leader's commit and commit new leader's amount
- [x] 6.4 Append to hash chain inside the same transaction (compute `prev_hash`/`curr_hash`)
- [x] 6.5 Append `AuditSeal` every 10 accepted bids on a lot
- [x] 6.6 Apply anti-sniping: if `now > ends_at - 2m`, `ends_at = ends_at + 2m`, capped at original `ends_at + 60m`
- [x] 6.7 After commit, emit `bid.placed`, optional `lot.extended`, targeted `you.winning` / `you.outbid` (via `LiveEventsService` + gateway)
- [x] 6.8 `POST /api/lots/:id/bids` (bidder only)
- [x] 6.9 `GET /api/lots/:id/bids` (public, paginated, anonymized handles)
- [ ] 6.10 Unit test every rejection path with its exact error code

## 7. Capability: wallet

- [x] 7.1 `GET /api/me/wallet` returning `{ total_cents, committed_cents, available_cents }`
- [x] 7.2 `POST /api/me/wallet/deposits` with validated `amount_cents > 0`, writes ledger `deposit` entry
- [x] 7.3 Wire wallet mutations from `BiddingService` (commit/release) and `SettlementService` (debit/credit) through the Prisma transaction, ledger entries written in-line
- [ ] 7.4 Unit test the invariant `total >= committed >= 0` after a long sequence of bids

## 8. Capability: settlement

- [x] 8.1 Add `@nestjs/schedule` cron (every 10s) `SettlementService.tick()`
- [x] 8.2 Implement idempotent claim: `UPDATE Lot SET status='ended' WHERE id=? AND status IN ('live','scheduled') AND endsAt <= now() RETURNING id`
- [x] 8.3 On winner path: debit winner, credit auctioneer, create `Settlement`, create `Receipt` with UUID share token, append final `AuditSeal`
- [x] 8.4 On no-winner path: create `Settlement` with `winner_user_id = null`, no receipt
- [x] 8.5 `GET /api/audit/receipts/:token` (public)
- [x] 8.6 `GET /api/me/wins` (bidder): list winning settlements with receipt token
- [x] 8.7 Emit `lot.ended` on the room (with `receipt_token` to the winner's socket only)

## 9. Capability: audit-integrity

- [x] 9.1 Implement `HashChainService` (hash-chain.ts) with deterministic canonical JSON serializer for bids
- [x] 9.2 Implement seal HMAC = `HMAC-SHA256(AUDIT_SIGNING_KEY, lot_id || seq || head_hash || created_at)` with `key_id`
- [x] 9.3 Implement `AuditService.verify()` that replays the chain for a lot and verifies every seal, returning `{ ok, head_hash, first_failure? }`
- [x] 9.4 `GET /api/audit/lots/:id` (public): returns `{ lot, bids, seals, integrity }`
- [ ] 9.5 Integration test: tamper with a bid row directly in the DB and assert `integrity.ok = false` with the right `first_failure.reason`
- [ ] 9.6 Integration test: delete a bid row and assert the right failure
- [ ] 9.7 Integration test: forge a seal with a wrong key and assert `seal_hmac_invalid`

## 10. Capability: realtime

- [x] 10.1 Implement `LiveLotsGateway` under namespace `/live-lots` using `@nestjs/platform-socket.io`
- [x] 10.2 JWT handshake: parse `token` from `handshake.auth` and attach `user` to the socket; allow anonymous read-only connections
- [x] 10.3 Handle `join`/`leave` with `{ lot_id }` and track membership per socket
- [x] 10.4 Emit `bid.placed`, `lot.extended`, `lot.ended` after the respective transactions commit
- [x] 10.5 Emit targeted `you.winning` / `you.outbid` to the specific sockets (via `user:<id>` room)
- [ ] 10.6 On `reconnect`, emit a one-off state event if the client has a bid on the lot

## 11. Capability: seed-data

- [x] 11.1 Add `prisma/seed.ts` and `"db:seed"` script
- [x] 11.2 Seed users: `auctioneer@verzel.test`, `alice@verzel.test`, `bob@verzel.test` (each bidder 10,000.00 BRL = 1,000,000 cents)
- [x] 11.3 Seed one `scheduled`, one `live`, one `ended` lot — all referencing real Met object ids snapshotted locally
- [x] 11.4 Insert the seeded live-lot bids by calling `BiddingService.placeBid()` so the chain, seals, and wallet state are consistent
- [x] 11.5 Make the script idempotent (upsert by stable identifiers)

## 12. Capability: api-docs

- [x] 12.1 Wire `@nestjs/swagger` with `DocumentBuilder` and bearer auth scheme
- [x] 12.2 Decorate every DTO with `@ApiProperty` and controllers with `@ApiTags`, `@ApiResponse`
- [x] 12.3 Serve Swagger UI at `/api/docs` and JSON at `/api/docs-json`
- [x] 12.4 Implement `GET /api/health` returning `{ status, uptime_seconds, version }`

## 13. Deployment

- [x] 13.1 Add a production-ready `Dockerfile` (multi-stage, non-root user, `node dist/main`)
- [x] 13.2 Document deployment on Fly.io / Render / Railway in `README.md`
- [x] 13.3 Add `prisma migrate deploy` to the start script (via Dockerfile CMD)
- [x] 13.4 Add health check path for the hosting platform

## 14. Stretch / optional (brief marks these as non-mandatory)

- [x] 14.1 Lot search/filter: `GET /api/lots?q=<title>` free-text with ILIKE
- [ ] 14.2 Cancel-with-automatic-refund: allow cancelling a `scheduled` lot that already has bids with a `?force=true` flag that releases all commits and marks the lot cancelled
- [x] 14.3 Add `docker-compose.yml` with `app` + `postgres` for one-command local setup
- [ ] 14.4 Add e2e tests covering: register → deposit → bid → win → audit verify → cancel path
- [ ] 14.5 Add unit tests for the hash chain and seal verifier
