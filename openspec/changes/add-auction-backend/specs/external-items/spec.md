## ADDED Requirements

### Requirement: Proxy search over the external items API

The system SHALL expose `GET /api/external-items/search?q=<term>&page=<n>` to authenticated auctioneers that proxies a text search to the configured external items provider (The Metropolitan Museum of Art Collection API) and returns a paginated list of matching objects with at least `{ external_id, title, primary_image_url, thumbnail_url, culture, date }`.

#### Scenario: Successful search

- **WHEN** an authenticated auctioneer sends `GET /api/external-items/search?q=van%20gogh`
- **THEN** the system returns `200` with `{ data: [...], page, pageSize, total }` of matching items, each carrying the external id and preview fields

#### Scenario: Empty query

- **WHEN** `GET /api/external-items/search` is called with no `q` parameter or an empty one
- **THEN** the system responds with HTTP `400` and a validation error requiring `q`

#### Scenario: Non-auctioneer caller

- **WHEN** a bidder or unauthenticated caller requests `GET /api/external-items/search`
- **THEN** the system responds with HTTP `401` (unauthenticated) or `403` (wrong role)

### Requirement: Short-lived in-memory cache for search results

The system SHALL cache external search responses in memory keyed by the normalized query and page, with a configurable TTL (default 10 minutes), so repeated typeahead calls do not hit the external API.

#### Scenario: Cache hit within TTL

- **WHEN** the same `GET /api/external-items/search?q=picasso&page=1` is called twice within 10 minutes
- **THEN** the second call is served from the cache and does not call the external API

#### Scenario: Cache miss after TTL expires

- **WHEN** the same search is called after the TTL has expired
- **THEN** the system calls the external API again and refreshes the cache

### Requirement: Snapshot an external item on lot creation

The system SHALL persist a local snapshot of every external item referenced by a lot, in a table that stores `{ provider, external_id, title, primary_image_url, raw_json, fetched_at }`. Once snapshotted, the lot and all downstream reads (showcase, live room, audit, receipt) SHALL read from the snapshot and SHALL NOT depend on the external API being available.

#### Scenario: First time an item is used

- **WHEN** an auctioneer creates a lot referencing a `provider=met`, `external_id=1234` item that has never been snapshotted
- **THEN** the system fetches `/objects/1234` from the external API, stores the response as a snapshot, and attaches the snapshot id to the lot

#### Scenario: Item already snapshotted

- **WHEN** an auctioneer creates a lot referencing an external item already present in the snapshot table
- **THEN** the system reuses the existing snapshot without calling the external API

#### Scenario: Showcase works while external API is down

- **GIVEN** at least one lot exists whose item has been snapshotted
- **WHEN** `GET /api/lots` and `GET /api/lots/:id` are called while the external API returns 5xx or times out
- **THEN** the system responds with `200` using data from the local snapshot without contacting the external API

### Requirement: Clear error when the external API is unavailable for lookup

The system SHALL return a structured error when the external API is required (search or first-time item lookup) and is unreachable, so the frontend can show the brief's required feedback messages.

#### Scenario: External API timeout during search

- **WHEN** `GET /api/external-items/search?q=…` is called and the external API does not respond within `MET_API_TIMEOUT_MS`
- **THEN** the system responds with HTTP `503` and body `{ error: { code: "external_source_unavailable", message: "External items source is unavailable, please try again" } }`

#### Scenario: External API error on first-time item lookup during lot creation

- **WHEN** an auctioneer tries to create a lot referencing an external id that has never been snapshotted and the external API returns an error
- **THEN** the system responds with HTTP `503` and body `{ error: { code: "external_source_unavailable", message: "Could not fetch item details from external source" } }` and does not create the lot
