## ADDED Requirements

### Requirement: Place a bid on a lot

The system SHALL expose `POST /api/lots/:id/bids` to authenticated bidders, accepting `{ amount_cents: integer > 0 }` and returning `201` with the accepted bid `{ id, seq, lot_id, amount_cents, handle, placed_at }` on success. All validations (lot state, amount, leader, balance) SHALL run inside a single database transaction that serializes bids on the same lot so that no two bids can both be accepted as the new lead at the same seq.

#### Scenario: Successful first bid

- **GIVEN** a lot is `live`, has no bids, and the bidder has sufficient available balance
- **WHEN** the bidder posts an `amount_cents` ≥ `starting_bid_cents`
- **THEN** the system accepts the bid, assigns `seq = 1`, makes the bidder the current leader, and returns `201`

#### Scenario: Successful subsequent bid

- **GIVEN** a lot is `live` with a current bid of `X` and minimum increment `I`
- **WHEN** a different bidder posts `amount_cents ≥ X + I` and has that much available
- **THEN** the system accepts the bid, assigns the next seq, makes the new bidder the leader, and returns `201`

### Requirement: Reject bids outside the live window

The system SHALL reject any bid placed before `starts_at` or at/after the current `ends_at` of the lot.

#### Scenario: Lot not started

- **GIVEN** a lot's `starts_at` is in the future
- **WHEN** a bidder posts a bid
- **THEN** the system responds with HTTP `409` and body `{ error: { code: "lot_not_started", message: "Lot is not open for bids yet" } }`

#### Scenario: Lot ended

- **GIVEN** a lot's `ends_at` has passed
- **WHEN** a bidder posts a bid
- **THEN** the system responds with HTTP `409` and body `{ error: { code: "lot_ended", message: "Lot has ended" } }`

#### Scenario: Lot cancelled

- **GIVEN** a lot's status is `cancelled`
- **WHEN** a bidder posts a bid
- **THEN** the system responds with HTTP `409` and body `{ error: { code: "lot_cancelled", message: "Lot has been cancelled" } }`

### Requirement: Reject bids below the required amount

The system SHALL reject a first bid below `starting_bid_cents` and any subsequent bid below `current_bid_amount_cents + min_increment_cents`.

#### Scenario: First bid below starting bid

- **WHEN** a bidder posts the first bid with `amount_cents < starting_bid_cents`
- **THEN** the system responds with HTTP `409` and body `{ error: { code: "below_starting_bid", message: "Bid must be at least the starting bid", details: { required_cents } } }`

#### Scenario: Subsequent bid below current + increment

- **WHEN** a bidder posts a subsequent bid with `amount_cents < current_bid_amount_cents + min_increment_cents`
- **THEN** the system responds with HTTP `409` and body `{ error: { code: "below_min_increment", message: "Bid must be at least current + minimum increment", details: { required_cents } } }`

### Requirement: Current leader cannot outbid themselves

The system SHALL reject a bid from the user who currently holds the leading bid on that lot.

#### Scenario: Leader bids again

- **GIVEN** bidder A is currently leading lot L
- **WHEN** bidder A posts another bid on L
- **THEN** the system responds with HTTP `409` and body `{ error: { code: "already_leading", message: "You are already the leading bidder" } }`

### Requirement: Reject bids that exceed the bidder's available balance

The system SHALL reject a bid whose `amount_cents` is greater than the bidder's `available = total − committed` balance at the moment the bid is processed.

#### Scenario: Insufficient available balance

- **WHEN** a bidder posts a bid with `amount_cents` > their available balance
- **THEN** the system responds with HTTP `409` and body `{ error: { code: "insufficient_available_balance", message: "Not enough available balance for this bid", details: { available_cents } } }`

### Requirement: Anti-sniping end-time extension

The system SHALL extend the lot's `ends_at` by 2 minutes whenever a bid is accepted while the current time is within 2 minutes of `ends_at`. The extension SHALL be capped so the total extension does not exceed 60 minutes beyond the original `ends_at`.

#### Scenario: Bid within last 2 minutes extends the lot

- **GIVEN** `ends_at - now ≤ 2 minutes` and the extension cap has not been reached
- **WHEN** a bid is accepted
- **THEN** the system updates `ends_at = ends_at + 2 minutes` atomically with the bid insert and returns the new `ends_at` in the response

#### Scenario: Extension cap reached

- **GIVEN** the lot has already been extended by 60 minutes beyond its original `ends_at`
- **WHEN** another bid is accepted in the last 2 minutes
- **THEN** the bid is still accepted but `ends_at` is not extended further

### Requirement: Bid list for a lot

The system SHALL expose `GET /api/lots/:id/bids` (public) that returns the ordered bid history of the lot using anonymized per-lot handles, with `?page` and `?pageSize` pagination. Personal data (email, name) SHALL NEVER appear in the response.

#### Scenario: Public bid list

- **WHEN** `GET /api/lots/:id/bids` is called with no `Authorization` header
- **THEN** the system responds with `200` and `{ data: [{ seq, amount_cents, handle, placed_at }], page, pageSize, total }`
