## ADDED Requirements

### Requirement: Automatic settlement when a lot's end time passes

The system SHALL run a scheduled job (every 10 seconds) that finds all live lots whose `ends_at` is in the past and settles each exactly once in a serializable transaction. The claim-and-settle operation SHALL be idempotent so overlapping ticks cannot settle the same lot twice.

#### Scenario: A live lot with a leader is settled

- **GIVEN** a lot with current leader L, winning bid `W` cents, auctioneer A
- **WHEN** `ends_at` passes and the scheduler runs
- **THEN** the system atomically: sets `status = "ended"`, sets `settled_at = now()`, writes a `settlement` row `{ lot_id, winner_user_id: L, amount_cents: W, auctioneer_user_id: A }`, issues a receipt row with a share token, debits L's wallet (`total -= W`, `committed -= W`), credits A (`total += W`), and appends ledger entries `debit` and `credit`

#### Scenario: A live lot with no bids is settled with no winner

- **GIVEN** a lot has `ends_at` in the past and zero bids
- **WHEN** the scheduler runs
- **THEN** the system sets `status = "ended"`, sets `settled_at = now()`, writes a `settlement` row with `winner_user_id = null` and `amount_cents = 0`, and does not create a receipt

#### Scenario: Idempotency under overlapping ticks

- **WHEN** two scheduler ticks overlap and attempt to settle the same lot
- **THEN** only one transaction succeeds in claiming the lot (using an atomic `UPDATE … WHERE status='live' RETURNING id`) and the other is a no-op; the lot's balances and ledger reflect exactly one settlement

### Requirement: Receipt is shareable via a public token

The system SHALL expose `GET /api/audit/receipts/:token` (public, no auth) that returns the receipt payload for a settled winning lot: `{ lot: { id, title, image_url, source }, winner_handle, amount_cents, settled_at, auctioneer_handle, integrity_head_hash }`. The share token SHALL be a UUID with enough entropy to prevent guessing, and SHALL be the only way to look up the receipt publicly.

#### Scenario: Winner receives share token

- **WHEN** a settlement is created for a winning lot
- **THEN** the receipt row stores a UUID share token and the token is included in the WebSocket `lot.ended` payload emitted to the winner and in the `GET /api/me/wins` response

#### Scenario: Public access to receipt by token

- **WHEN** anyone sends `GET /api/audit/receipts/:token`
- **THEN** the system responds with `200` and the receipt payload if the token exists, else `404`

#### Scenario: Receipt uses anonymized handle

- **WHEN** the receipt payload is returned
- **THEN** it exposes only the winner's and auctioneer's handles, not names or emails

### Requirement: Winner's own view

The system SHALL expose `GET /api/me/wins` to authenticated bidders, returning the list of lots they have won with each `{ lot, amount_cents, settled_at, receipt_token }`.

#### Scenario: Bidder lists wins

- **WHEN** an authenticated bidder sends `GET /api/me/wins`
- **THEN** the system responds with `200` and the list of their winning settlements, each including the receipt token for direct sharing
