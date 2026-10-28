## ADDED Requirements

### Requirement: Bidder wallet with total, committed, and derived available balance

The system SHALL provision one wallet per bidder, storing `balance_total_cents` and `balance_committed_cents` as non-negative integers. The system SHALL expose `GET /api/me/wallet` returning `{ total_cents, committed_cents, available_cents }` where `available_cents = total_cents − committed_cents`.

#### Scenario: Fetch wallet

- **WHEN** an authenticated bidder sends `GET /api/me/wallet`
- **THEN** the system responds with `200` and the three amounts in cents

#### Scenario: Non-bidder caller

- **WHEN** an auctioneer sends `GET /api/me/wallet`
- **THEN** the system responds with HTTP `403` and body `{ error: { code: "role_forbidden", message: "Only bidders have wallets" } }`

### Requirement: Simulated deposit increases total balance

The system SHALL expose `POST /api/me/wallet/deposits` accepting `{ amount_cents: integer > 0 }`. On success, `balance_total_cents` SHALL increase by `amount_cents`, and the operation SHALL be recorded in a wallet ledger with reason `"deposit"`.

#### Scenario: Successful deposit

- **WHEN** a bidder posts `{ amount_cents: 500000 }`
- **THEN** the system increases `total_cents` by `500000`, writes a ledger entry, and returns `201` with the updated wallet snapshot

#### Scenario: Non-positive deposit amount

- **WHEN** a bidder posts a deposit with `amount_cents <= 0` or non-integer
- **THEN** the system responds with HTTP `400` with a validation error on `amount_cents`

### Requirement: Commit balance when taking the lead, release when outbid

The system SHALL, atomically with accepting a bid, increase the new leader's `balance_committed_cents` by the new bid amount and decrease the previous leader's `balance_committed_cents` by their previous bid amount, writing ledger entries for both legs (`"commit"` and `"release"`). The sum of committed amounts across all live lots SHALL always equal the sum of each lot's current leading bid amount.

#### Scenario: First bid commits leader's balance

- **GIVEN** a lot with no current bids and bidder A has `total=1000, committed=0`
- **WHEN** bidder A's first bid of `300` is accepted
- **THEN** bidder A's wallet becomes `total=1000, committed=300, available=700`

#### Scenario: Outbid releases previous leader

- **GIVEN** bidder A leads with `300` (so A has `committed=300`)
- **WHEN** bidder B's bid of `350` is accepted
- **THEN** A's `committed` decreases by `300` and B's `committed` increases by `350`, both in the same transaction

### Requirement: A bid must fit in available balance

The system SHALL block a bid whose amount exceeds the bidder's current available balance. The check SHALL happen inside the same transaction that would otherwise commit the funds, so no race can let a bidder bid twice beyond their balance.

#### Scenario: Available balance barely covers bid

- **GIVEN** bidder A has `total=500, committed=100, available=400`
- **WHEN** bidder A posts a bid of `400`
- **THEN** the system accepts the bid and A's wallet becomes `total=500, committed=500, available=0`

#### Scenario: Available balance insufficient

- **GIVEN** bidder A has `available=100`
- **WHEN** bidder A posts a bid of `200`
- **THEN** the system responds with HTTP `409` and `{ error: { code: "insufficient_available_balance", … } }`

### Requirement: Wallet ledger is append-only

The system SHALL record every wallet mutation (`deposit`, `commit`, `release`, `debit`, `credit`) in a `wallet_ledger` table with `{ id, user_id, kind, amount_cents, lot_id?, bid_id?, created_at }`. Entries SHALL never be updated or deleted.

#### Scenario: Ledger entries exist for a bid acceptance

- **GIVEN** bidder B outbids bidder A
- **WHEN** the acceptance transaction completes
- **THEN** the ledger contains, for the same acceptance, one `release` entry for A and one `commit` entry for B, both referencing the new `bid_id`
