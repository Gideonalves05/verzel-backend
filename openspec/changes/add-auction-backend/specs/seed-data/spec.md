## ADDED Requirements

### Requirement: Deterministic seed script

The system SHALL provide a `npm run db:seed` script that is idempotent (safe to re-run) and populates the database with the following minimum data:

- One auctioneer user `auctioneer@verzel.test` with a known password documented in the README.
- Two bidder users `alice@verzel.test` and `bob@verzel.test`, each with a known password and an initial wallet balance of 10,000.00 BRL.
- At least three lots: one `scheduled` (starts in the near future), one `live` with at least two accepted bids from the two bidders, and one `ended` with a settled winner and receipt.

#### Scenario: Seed on an empty database

- **WHEN** `npm run db:seed` is run against an empty database
- **THEN** the system creates the users, wallets, external-item snapshots, lots, bids, settlements, and receipts above, and prints a summary of what was created

#### Scenario: Seed re-run

- **WHEN** `npm run db:seed` is run on a database that already has the seeded users
- **THEN** the script detects existing records by their stable identifiers and either skips or upserts without creating duplicates

### Requirement: Seed references real external items

The system SHALL seed lots that reference real Metropolitan Museum of Art object ids. The seed script SHALL snapshot those items locally (as any lot creation would) so the seeded lots work offline against the external API.

#### Scenario: Seeded lot has image and attributes

- **WHEN** the seeded live lot is fetched via `GET /api/lots/:id`
- **THEN** it includes an `image_url`, `item_attributes`, and `source: { provider: "met", external_id: <number> }`

### Requirement: Seeded live lot has a valid chain and seals

The system SHALL ensure the seeded `live` lot's bids are inserted through the same bid-acceptance pipeline (not raw SQL) so the hash chain, wallet commits, and audit seals are all consistent and verifiable from the public audit endpoint immediately after seeding.

#### Scenario: Seeded audit page verifies

- **WHEN** `GET /api/audit/lots/:id` is called on the seeded live lot right after seeding
- **THEN** the response has `integrity.ok = true` and lists the seeded bids in order with their chain hashes
