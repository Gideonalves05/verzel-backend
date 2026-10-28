## ADDED Requirements

### Requirement: WebSocket gateway exposes per-lot live rooms

The system SHALL expose a WebSocket endpoint under the namespace `/live-lots` (Socket.IO). Clients SHALL join a lot's room by emitting `join` with `{ lot_id }`, and leave by emitting `leave` with `{ lot_id }`. Unauthenticated clients MAY join rooms as read-only; authenticated clients SHALL additionally receive targeted personal events.

#### Scenario: Client joins a lot room

- **WHEN** a client connects to `/live-lots` and emits `join` with `{ lot_id: "L" }`
- **THEN** the client is subscribed to the `lot:L` room and will receive subsequent broadcast events for that lot

#### Scenario: Unauthenticated client is read-only

- **WHEN** a client connects without a valid token and joins a room
- **THEN** the client receives broadcast events but no targeted `you.winning` / `you.outbid` events

### Requirement: Broadcast `bid.placed` on every accepted bid

The system SHALL emit a `bid.placed` event to the lot's room immediately after a bid is committed, with payload `{ lot_id, seq, amount_cents, handle, placed_at, new_ends_at }`. The emit SHALL happen after the database transaction commits so no client observes an event for a non-persisted bid.

#### Scenario: Room members see the new bid

- **WHEN** a bid is accepted on lot L
- **THEN** every client subscribed to `lot:L` receives `bid.placed` with the new bid's data and the possibly-extended `new_ends_at`

### Requirement: Broadcast `lot.extended` when anti-sniping triggers

The system SHALL include the extended `new_ends_at` in `bid.placed`, and SHALL additionally emit a dedicated `lot.extended` event with `{ lot_id, new_ends_at, reason: "anti-sniping" }` whenever the anti-sniping extension actually fires, so a client that only cares about countdown can subscribe to just this event.

#### Scenario: Extension fires

- **WHEN** a bid is accepted in the last 2 minutes before `ends_at` and the extension cap has not been reached
- **THEN** the system emits both `bid.placed` and `lot.extended` to `lot:L`

#### Scenario: Extension does not fire

- **WHEN** a bid is accepted comfortably before the end
- **THEN** the system emits only `bid.placed`

### Requirement: Broadcast `lot.ended` after settlement

The system SHALL emit `lot.ended` to the lot's room after settlement commits, with payload `{ lot_id, winner_handle: string | null, final_amount_cents: number | null, settled_at }`. For the winner specifically (if authenticated and in the room), the payload SHALL also include `receipt_token` so the frontend can show a "download receipt" affordance without a round trip.

#### Scenario: Lot ends with a winner

- **WHEN** a lot is settled with winner W
- **THEN** every client in `lot:L` receives `lot.ended` with the winning handle and amount, and the specific authenticated socket owned by W additionally receives `receipt_token`

#### Scenario: Lot ends with no winner

- **WHEN** a lot is settled with no bids
- **THEN** every client in `lot:L` receives `lot.ended` with `winner_handle: null` and `final_amount_cents: null`, and no receipt is created

### Requirement: Targeted `you.winning` / `you.outbid` events

The system SHALL emit `you.winning` to the authenticated socket of the current leader after a bid is accepted, and `you.outbid` to the authenticated socket of the previous leader (if any). These events SHALL carry `{ lot_id, current_amount_cents, current_leader: boolean }`.

#### Scenario: Bidder becomes the new leader

- **WHEN** bidder B's bid is accepted on lot L (B was authenticated and joined the room)
- **THEN** B's socket receives `you.winning` with the amount; the previous leader (if present and connected) receives `you.outbid`

#### Scenario: Bidder reconnects

- **WHEN** a bidder reconnects to a live room they were already in
- **THEN** the system emits a one-off `you.winning` or `you.outbid` reflecting the current state of the lot for that bidder, if they have a bid on it; otherwise no targeted event is sent
