## ADDED Requirements

### Requirement: Per-lot hash chain over all accepted bids

The system SHALL compute a cryptographic hash chain over every accepted bid for a given lot. Each bid row SHALL store `seq`, `prev_hash` (hex), and `curr_hash = SHA-256(prev_hash || canonical_bid_json)` where `canonical_bid_json` is a deterministic JSON serialization of `{ lot_id, seq, bidder_handle, amount_cents, placed_at_iso }`. The genesis `prev_hash` for a lot SHALL be `SHA-256("lot:" || lot_id || ":genesis")`.

#### Scenario: First bid of a lot is chained to the genesis

- **WHEN** the first bid of a lot is accepted
- **THEN** its `prev_hash` equals the lot's genesis hash and its `curr_hash` is the SHA-256 of `genesis_hash || canonical_bid_json`

#### Scenario: Subsequent bid is chained to the previous bid

- **WHEN** a subsequent bid is accepted
- **THEN** its `prev_hash` equals the previous accepted bid's `curr_hash` and its `curr_hash` is computed from that

### Requirement: Periodic signed seals and a settlement seal

The system SHALL append an `audit_seal` row every 10 accepted bids on a lot and always at settlement, storing `{ lot_id, seq, chain_head_hash, created_at, key_id, hmac }` where `hmac = HMAC-SHA256(AUDIT_SIGNING_KEY, lot_id || ":" || seq || ":" || chain_head_hash || ":" || created_at)`. Seals SHALL be append-only.

#### Scenario: Seal at every 10 bids

- **WHEN** the 10th, 20th, 30th … accepted bid on a lot completes
- **THEN** the system appends an `audit_seal` row with the current chain head and a valid HMAC

#### Scenario: Final seal at settlement

- **WHEN** a lot is settled (with or without a winner)
- **THEN** the system appends a final `audit_seal` row carrying the chain head at settlement, so the full history is sealed from that moment onward

### Requirement: Public audit endpoint reports verification result

The system SHALL expose `GET /api/audit/lots/:id` (public, no auth) that returns the full ordered bid list (anonymized handles only), the list of seals, and an `integrity` block `{ ok: boolean, verified_at, head_hash, first_failure?: { seq, reason } }` reflecting an on-the-fly recomputation.

#### Scenario: Chain intact

- **GIVEN** no bid has been altered, removed, or inserted since being written
- **WHEN** `GET /api/audit/lots/:id` is called
- **THEN** the system responds with `200` and `integrity.ok = true`, `head_hash` = the latest `curr_hash`, and every seal's HMAC verifies against the configured key

#### Scenario: A bid row was tampered after the fact

- **GIVEN** a bid's `amount_cents` was changed directly in the database after it was recorded
- **WHEN** `GET /api/audit/lots/:id` is called
- **THEN** the system responds with `200` and `integrity.ok = false`, `first_failure = { seq: <N>, reason: "curr_hash_mismatch" }`

#### Scenario: A bid was deleted after the fact

- **GIVEN** a bid row was deleted directly in the database
- **WHEN** `GET /api/audit/lots/:id` is called
- **THEN** the system responds with `integrity.ok = false` and `first_failure.reason` is `"seq_gap"` or `"prev_hash_mismatch"`

#### Scenario: A bid was inserted after the fact

- **GIVEN** a bid was inserted after settlement
- **WHEN** `GET /api/audit/lots/:id` is called
- **THEN** `integrity.ok = false` and the final seal's `chain_head_hash` no longer matches the current chain head, surfaced as `first_failure.reason = "seal_mismatch"`

#### Scenario: A seal's HMAC does not verify

- **GIVEN** a seal row was altered or forged by someone who did not have `AUDIT_SIGNING_KEY`
- **WHEN** the audit endpoint runs verification
- **THEN** `integrity.ok = false` and `first_failure.reason = "seal_hmac_invalid"`

### Requirement: Audit endpoint exposes only anonymized identifiers

The system SHALL expose only per-lot anonymized handles for bidders and auctioneer on the audit and receipt endpoints. Personal data (email, name, user id) SHALL NEVER appear in any public audit or receipt payload.

#### Scenario: Audit response contains no personal data

- **WHEN** a public caller fetches `GET /api/audit/lots/:id`
- **THEN** the response contains for each bid only `{ seq, amount_cents, handle, placed_at, prev_hash, curr_hash }`, with no email, user id, or name
