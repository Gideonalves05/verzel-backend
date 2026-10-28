## ADDED Requirements

### Requirement: Auctioneer creates a lot from a cached external item

The system SHALL allow an authenticated auctioneer to create a lot by referencing an external item (by `provider` + `external_id`), providing `title` (optional override), `starts_at`, `ends_at`, `starting_bid_cents` (integer > 0), and `min_increment_cents` (integer > 0). The lot's image, item attributes, and source metadata SHALL be derived from the snapshot of the referenced external item.

#### Scenario: Successful creation

- **WHEN** an auctioneer sends `POST /api/lots` with a valid body
- **THEN** the system snapshots the external item (if not yet cached), stores the lot with `status = "scheduled"` or `"live"` depending on `starts_at`, and returns `201` with the full lot payload including `source: { provider, external_id }` and derived `image_url`, `item_attributes`

#### Scenario: `ends_at` not after `starts_at`

- **WHEN** `ends_at` is less than or equal to `starts_at`
- **THEN** the system responds with HTTP `400` and a validation error on `ends_at`

#### Scenario: `starts_at` in the past

- **WHEN** `starts_at` is in the past at the moment the request is processed
- **THEN** the system responds with HTTP `400` and a validation error indicating `starts_at` must be now or in the future

#### Scenario: `starting_bid_cents` or `min_increment_cents` not positive

- **WHEN** either field is `0`, negative, or non-integer
- **THEN** the system responds with HTTP `400` with a validation error naming the field

#### Scenario: Non-auctioneer caller

- **WHEN** a bidder or unauthenticated caller sends `POST /api/lots`
- **THEN** the system responds with HTTP `401` or `403` as defined in `auth`

### Requirement: Lot lifecycle and derived status

The system SHALL compute the lot's effective status as one of `scheduled`, `live`, `ended`, `cancelled` based on persistent fields and the current time. Transitions SHALL be:

- `scheduled` → `live` automatically when `starts_at` ≤ now and the lot is not cancelled.
- `live` → `ended` by the settlement job when `ends_at` ≤ now.
- `scheduled` → `cancelled` only via explicit cancel while the lot has zero bids.
- `cancelled` and `ended` are terminal; no further transitions.

#### Scenario: Status returned by `GET /api/lots/:id`

- **WHEN** the client fetches a lot whose `starts_at` is in the future, is not cancelled, and has no `ended_at`
- **THEN** the system returns `status: "scheduled"`

#### Scenario: Live status

- **WHEN** the client fetches a lot where `starts_at` ≤ now < `ends_at`, status is not cancelled, and no settlement has happened
- **THEN** the system returns `status: "live"` and includes `ends_at`, `current_bid_amount_cents` (nullable), and `current_leader_handle` (nullable)

### Requirement: Showcase lists lots filtered by status, excluding cancelled

The system SHALL expose `GET /api/lots` (public) that lists lots with optional `?status=live|scheduled|ended`, `?page`, `?pageSize`, and (stretch) `?q=` free-text filter over the lot title. Lots in `cancelled` status SHALL NEVER appear in the showcase.

#### Scenario: Default listing excludes cancelled

- **WHEN** `GET /api/lots` is called with no filter
- **THEN** the system returns live, scheduled, and ended lots paginated, and no lot with `status = "cancelled"`

#### Scenario: Status filter

- **WHEN** `GET /api/lots?status=live` is called
- **THEN** the system returns only lots whose current effective status is `live`

#### Scenario: Public access

- **WHEN** `GET /api/lots` and `GET /api/lots/:id` are called without an `Authorization` header
- **THEN** the system responds with `200` and the public payload

### Requirement: Auctioneer cancels a lot that has no bids

The system SHALL allow the owning auctioneer to cancel a lot whose status is `scheduled` or `live` and whose bid count is zero. Cancellation of a lot with at least one bid SHALL be refused.

#### Scenario: Successful cancel

- **WHEN** the owning auctioneer sends `POST /api/lots/:id/cancel` on a lot with zero bids
- **THEN** the system sets `status = "cancelled"`, records `cancelled_at`, hides the lot from the showcase, and returns `200` with the updated lot

#### Scenario: Lot has bids

- **WHEN** the owning auctioneer sends `POST /api/lots/:id/cancel` on a lot that already has at least one bid
- **THEN** the system responds with HTTP `409` and body `{ error: { code: "lot_has_bids_cannot_cancel", message: "Lot has bids and cannot be cancelled" } }`

#### Scenario: Non-owner tries to cancel

- **WHEN** an auctioneer other than the lot's creator sends the cancel request
- **THEN** the system responds with HTTP `403` and body `{ error: { code: "not_lot_owner", message: "Only the lot's auctioneer can cancel it" } }`

### Requirement: Auctioneer dashboard aggregates

The system SHALL expose `GET /api/me/lots` to the authenticated auctioneer that lists their own lots with each lot's final result (`winner_handle`, `final_amount_cents`, `settled_at`) when ended, and an aggregate `GET /api/me/revenue` that returns the sum of settled winning amounts credited to the auctioneer.

#### Scenario: Dashboard lists own lots with results

- **WHEN** an auctioneer sends `GET /api/me/lots`
- **THEN** the system returns their own lots across all statuses, with the ended ones including winner and final amount

#### Scenario: Revenue aggregate

- **WHEN** an auctioneer sends `GET /api/me/revenue`
- **THEN** the system returns `{ total_received_cents, settled_lot_count }` summing their credited settlements
