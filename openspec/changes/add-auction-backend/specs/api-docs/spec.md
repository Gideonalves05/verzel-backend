## ADDED Requirements

### Requirement: Interactive OpenAPI documentation served at `/api/docs`

The system SHALL expose a Swagger UI at `GET /api/docs` and the raw OpenAPI document at `GET /api/docs-json`, covering every public and authenticated REST endpoint of the backend with request/response schemas, auth scheme (`bearer` JWT), and example payloads.

#### Scenario: Open Swagger UI

- **WHEN** anyone opens `/api/docs` in a browser against the deployed backend
- **THEN** the system responds with an interactive Swagger UI listing every endpoint grouped by capability (auth, external-items, lots, bidding, wallet, settlement, audit)

#### Scenario: Fetch raw OpenAPI document

- **WHEN** anyone fetches `/api/docs-json`
- **THEN** the system responds with `200` and a valid OpenAPI 3.x JSON document that passes a standard OpenAPI validator

#### Scenario: Protected endpoints documented with bearer auth

- **WHEN** a user explores `/api/docs` and selects any endpoint that requires authentication
- **THEN** the documentation indicates that a bearer JWT is required and provides an "Authorize" button to try it from the UI

### Requirement: Health endpoint for deploy probes

The system SHALL expose `GET /api/health` returning `{ status: "ok", uptime_seconds, version }` without authentication, so hosting platforms (Fly.io, Render, Railway) can probe liveness.

#### Scenario: Health check

- **WHEN** anyone sends `GET /api/health`
- **THEN** the system responds with `200` and the health payload
