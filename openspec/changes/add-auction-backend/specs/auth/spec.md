## ADDED Requirements

### Requirement: User registration with role selection

The system SHALL allow a new user to register with an email, password, and one of two roles: `auctioneer` or `bidder`. Passwords SHALL be stored only as a bcrypt hash with a work factor of at least 10. Email addresses SHALL be unique and case-insensitive.

#### Scenario: Successful bidder registration

- **WHEN** a `POST /api/auth/register` request is made with a valid email, a password of at least 8 characters, and role `bidder`
- **THEN** the system creates the user, provisions a wallet with zero balance, assigns a global anonymized handle (e.g. `bidder-7fa3`), and returns `201` with `{ user: { id, email, role, handle } }`

#### Scenario: Successful auctioneer registration

- **WHEN** a `POST /api/auth/register` request is made with role `auctioneer`
- **THEN** the system creates the user without a wallet and returns `201` with `{ user: { id, email, role, handle } }`

#### Scenario: Duplicate email

- **WHEN** a registration request is made with an email that is already taken (case-insensitive match)
- **THEN** the system responds with HTTP `409` and body `{ error: { code: "email_taken", message: "Email is already registered" } }`

#### Scenario: Invalid role

- **WHEN** a registration request is made with a `role` other than `auctioneer` or `bidder`
- **THEN** the system responds with HTTP `400` and a validation error listing the allowed roles

### Requirement: Login issues a JWT access token

The system SHALL authenticate a user by email and password and return a signed JWT access token that carries the user's `id` and `role` as claims. Tokens SHALL expire after 24 hours.

#### Scenario: Successful login

- **WHEN** a `POST /api/auth/login` request is made with correct credentials
- **THEN** the system returns `200` with `{ access_token, token_type: "Bearer", expires_in: 86400, user: { id, email, role, handle } }`

#### Scenario: Wrong password

- **WHEN** a login request is made with a known email and the wrong password
- **THEN** the system responds with HTTP `401` and body `{ error: { code: "invalid_credentials", message: "Invalid email or password" } }` without disclosing which field is wrong

#### Scenario: Unknown email

- **WHEN** a login request is made with an unknown email
- **THEN** the system responds with HTTP `401` and body `{ error: { code: "invalid_credentials", message: "Invalid email or password" } }`

### Requirement: Role-based access control for API endpoints

The system SHALL enforce role-based access on protected endpoints using the role claim in the JWT. Endpoints that create or cancel lots SHALL require role `auctioneer`. Endpoints that place bids, deposit funds, or view personal wallet/wins SHALL require role `bidder`. Showcase and audit endpoints SHALL remain accessible without a token.

#### Scenario: Auctioneer attempts to bid

- **WHEN** a user with role `auctioneer` sends `POST /api/lots/:id/bids`
- **THEN** the system responds with HTTP `403` and body `{ error: { code: "role_forbidden", message: "Auctioneers cannot place bids" } }`

#### Scenario: Bidder attempts to create a lot

- **WHEN** a user with role `bidder` sends `POST /api/lots`
- **THEN** the system responds with HTTP `403` and body `{ error: { code: "role_forbidden", message: "Only auctioneers can create lots" } }`

#### Scenario: Missing or invalid token on protected endpoint

- **WHEN** a request to a protected endpoint arrives with no `Authorization` header or an invalid/expired token
- **THEN** the system responds with HTTP `401` and body `{ error: { code: "unauthorized", message: "Authentication required" } }`

#### Scenario: Public endpoints require no token

- **WHEN** a `GET /api/lots`, `GET /api/lots/:id`, `GET /api/audit/lots/:id`, or `GET /api/audit/receipts/:token` request arrives with no `Authorization` header
- **THEN** the system responds successfully (HTTP `200`) with the public payload

### Requirement: Authenticated user profile endpoint

The system SHALL expose `GET /api/me` that returns the authenticated user's `id`, `email`, `role`, and `handle`.

#### Scenario: Fetch own profile

- **WHEN** an authenticated user sends `GET /api/me` with a valid bearer token
- **THEN** the system responds with `200` and body `{ id, email, role, handle }`
