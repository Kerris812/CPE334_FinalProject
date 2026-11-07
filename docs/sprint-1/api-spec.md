# api-spec.md — Restaurant Queue REST API Contract

> **Status:** PROPOSED engineering baseline, 6 November 2026. Design and contracts only. No application code, test runs, GitHub releases or deployments are represented as complete. All examples use synthetic placeholders.

> **Companion files:** [specification.md](specification.md) · [api-spec.md](api-spec.md) · [tests.md](tests.md) · [ui-spec.md](ui-spec.md).

## Scope and source of authority

Sprint 1 F-01 through F-05 HTTP and persistence interfaces. All endpoints and examples below are specified, not implemented. Public board data is a separate privacy allowlist. The normative domain rules and relational model are in `specification.md`.

## API conventions

* REST JSON under `/api/v1`; public health at `/health`. IDs are stable UUIDs in concrete implementation, example names in this spec are placeholders.
* Client sends `Content-Type: application/json` for mutations. Session cookie is automatically sent; no request body `userId` or `role` can authorize a call.
* Success is `{"data":...}`; list responses may add `meta`. Date/time ISO-8601 UTC.
* Error is always `{"error":{"code":"SOME_CODE","message":"Safe human message","requestId":"req-id","details":{}}}`. Include `details` for field-level validation only. Never expose stack, SQL, internal email of other users or secret.
* `400` malformed JSON; `401` anonymous/expired; `403` forbidden role or unauthorized known queue; `404` absent/private entry; `409` business-rule conflict; `422` semantic form validation; `429` login rate control (later hardening); `500` safe unexpected response.
* Public board response is allowlisted in a separate DTO, never serialized ORM entity; 10-second UI polling is a client convenience, not a correctness guarantee.
* API responses to mutations include authoritative updated entry to refresh UI; non-idempotent action buttons become temporarily disabled while sending, but DB guards must still handle retries.

### Endpoint inventory (Sprint 1)

| Method and path | Auth | Main effect |
| --- | --- | --- |
| `GET /health` | Anonymous | Readiness response. |
| `POST /api/v1/auth/login` | Anonymous | Validate credentials; create session cookie. |
| `GET /api/v1/auth/me` | Any authenticated role | Current identity, no credential/hash. |
| `POST /api/v1/auth/logout` | Authenticated | Revoke current session and clear cookie. |
| `GET /api/v1/queues` | Customer | Discover open restaurant queues (one seeded initially). |
| `POST /api/v1/queues/:queueId/entries` | Customer | Atomic join. |
| `GET /api/v1/customer/entries/latest` | Customer | Latest personal entry, `data:null` when none. |
| `GET /api/v1/customer/entries/:entryId` | Owning customer | Private entry detail; foreign ID returns 404. |
| `GET /api/v1/public/queues/:queueId/board` | Anonymous | Whitelisted public board. |
| `GET /api/v1/operator/queues` | Operator | Only assigned queues. |
| `GET /api/v1/operator/queues/:queueId/desk` | Assigned operator | Desk/current service overview. |
| `POST /api/v1/operator/queues/:queueId/call-next` | Assigned operator | Call FIFO head. |
| `POST /api/v1/operator/entries/:entryId/start-service` | Assigned operator | CALLED to SERVING. |
| `POST /api/v1/operator/entries/:entryId/complete` | Assigned operator | SERVING to COMPLETED. |

## Authentication and authorization

1. Login compares submitted password against Argon2id stored hash; unknown account and wrong password return the same 401 `INVALID_CREDENTIALS` body. Disable leaking login identifiers to logs. Apply predictable validation errors for blank/incorrectly typed inputs.
2. Generate at least 32 random bytes per session token from a cryptographic generator. Store SHA-256 digest of token server side and send the opaque token in cookie `qs_session`. Session absolute expiry is eight hours; do not slide expiry in Sprint 1.
3. Use HttpOnly; production Secure; SameSite=Lax; Path=/; reasonable Max-Age set to 8 h. Development HTTP uses Secure=false with a documented override only in local env. Backend verifies allowed Origin on unsafe cookie-authenticated requests, plus SameSite and JSON-only mutation requests.
4. `GET /auth/me` resolves principal from DB session; logout revokes DB row before responding and clears cookie; later replay fails with 401. Server checks revocation and expiration every request.
5. Customers' entry endpoints query by `(id, customer_id=principal.id)` or return 404. Operator routes check `operator_queue_assignments` from server-side DB before retrieving/modifying entry. No role sent by client is trusted.
6. Seeded demo passwords supplied by an ignored local env file or safe course handoff, never hardcoded to production source or published in PDF. Only hashes persist; seed is idempotent.

### Permission matrix

| Action | Anonymous | Customer | Assigned operator | Unassigned operator |
| --- | --- | --- | --- | --- |
| View public board / health | Yes | Yes | Yes | Yes |
| Login | Yes | Yes when signed out | Yes when signed out | Yes when signed out |
| Current user / logout | 401 | Own session | Own session | Own session |
| List customer-visible queues | 401 | Yes | 403 | 403 |
| Join queue | 401 | Yes, derived identity | 403 | 403 |
| View private entry | 401 | Own only; foreign 404 | Assigned queue only via desk | 403 |
| Assigned queue/desk | 401 | 403 | Yes | 403 |
| Call/start/complete | 401 | 403 | Assigned queue only | 403 |
| View public board details beyond allowlist | No | No | No via board endpoint | No |

## HTTP error code matrix

| Condition | HTTP | Error code |
| --- | --- | --- |
| Unauthenticated, expired or revoked | 401 | `UNAUTHENTICATED` |
| Unknown user or incorrect password | 401 | `INVALID_CREDENTIALS` |
| Wrong role | 403 | `FORBIDDEN` |
| Operator not assigned to queue | 403 | `QUEUE_ACCESS_DENIED` |
| Private foreign entry or absent entry | 404 | `ENTRY_NOT_FOUND` |
| Invalid request fields | 422 | `VALIDATION_ERROR` |
| Active duplicate queue entry | 409 | `DUPLICATE_ACTIVE_ENTRY` |
| Unavailable queue | 409 | `QUEUE_NOT_OPEN` |
| No waiting entry | 409 | `QUEUE_EMPTY` |
| Service slot occupied | 409 | `SERVICE_SLOT_BUSY` |
| Invalid lifecycle transition | 409 | `INVALID_TRANSITION` |
| Unexpected system failure | 500 | `INTERNAL_ERROR` |

Return an envelope with `error.code`, safe `error.message`, and `error.requestId`. Validation can add `error.details.fields`. Unknown fields may be rejected with 422; do not trust client supplied identity or role.

## F-01 Login, logout and current user API contract

**Requirement trace:** FR-01; BR-13, BR-14; NFR-01, NFR-02, NFR-03, NFR-11; D-12, D-13, D-22, D-23.

## API contract

### `POST /api/v1/auth/login` (anonymous)

Request:

```json
{"email":"customer.a@example.test","password":"<synthetic-seed-password>"}
```

Response `200`, plus `Set-Cookie: qs_session=<opaque>; HttpOnly; SameSite=Lax; Path=/` (production adds Secure):

```json
{"data":{"user":{"id":"11111111-1111-4111-8111-111111111111","displayName":"Demo Customer A","role":"CUSTOMER"},"expiresAt":"2026-11-06T16:00:00.000Z"}}
```

The expiry in example is illustrative, not the actual current date/time.

Invalid credentials `401`:

```json
{"error":{"code":"INVALID_CREDENTIALS","message":"Invalid email or password.","requestId":"req-example"}}
```

Bad fields `422 VALIDATION_ERROR` with `details.fields.email` or `details.fields.password`. Session persistence failure `500 INTERNAL_ERROR` without stack details.

### `GET /api/v1/auth/me` (authenticated)

`200`:

```json
{"data":{"user":{"id":"11111111-1111-4111-8111-111111111111","displayName":"Demo Customer A","role":"CUSTOMER"}}}
```

Missing/expired/revoked cookie `401 UNAUTHENTICATED`.

### `POST /api/v1/auth/logout` (authenticated)

`204` with cookie cleared. Reuse of old cookie after logout returns `401 UNAUTHENTICATED` from `/me`. An already unauthenticated logout may return 401 consistently; UI clears its local identity regardless.

**Shared error shape:** `{"error":{"code":"...","message":"...","requestId":"...","details":{}}}`; details may be omitted when not applicable.

## Data contract and migration

`users(id PK, email UNIQUE, display_name, password_hash, role, is_active, created_at)` and `sessions(id PK, user_id FK, token_hash UNIQUE, created_at, expires_at, revoked_at)`. See initial `0001_foundation` migration in SDS. Seed creates two customer + two operator accounts with Argon2id hash. Synthetic seed password comes from ignored env and never appears in committed PDF/report. Revocation updates `revoked_at` and must commit before 204.

## F-02 Role and queue authorization API contract

**Requirement trace:** FR-02, FR-03, FR-04, FR-23, FR-24; BR-09–BR-11, BR-27–BR-28; NFR-01, NFR-06, NFR-07, NFR-11; D-09, D-10, D-20, D-25.

## API contract

`GET /health` anonymous → `200`:

```json
{"status":"ok","service":"restaurant-queue-api"}
```

`GET /api/v1/operator/queues` Operator → `200`:

```json
{"data":[{"id":"22222222-2222-4222-8222-222222222222","code":"R","name":"Restaurant Waiting Queue","state":"OPEN"}]}
```

Unassigned Operator B returns `200 {"data":[]}`. Customer returns `403 FORBIDDEN`.

`GET /api/v1/queues` Customer → `200` with array of safe queue codes/IDs/names/states. No private entries included. This endpoint gives a queue ID for customer join. `GET /api/v1/operator/queues/:queueId/desk` is specified in F-05 and applies the same assignment guard.

Wrong role error:

```json
{"error":{"code":"FORBIDDEN","message":"You do not have permission to perform this action.","requestId":"req-example"}}
```

Unassigned queue error `403 QUEUE_ACCESS_DENIED` with safe message; anonymous `401 UNAUTHENTICATED`. Invalid identifiers `400`/`404` without internal data. Errors use standard SDS envelope.

## Data contract / seed and migrations

`operator_queue_assignments(operator_id,queue_id)` has a composite PK, two FKs and service-side role assertion. `queues(code UNIQUE, state, last_sequence)` has immutable unique code. `0001_foundation` adds all initial tables, unique indexes and partial active-entry indexes, even if entries are not created by this feature. Seed uses upsert by email and queue code; do not reset counter or delete guest tickets when seed is run twice. Test integration must use a separate disposable database and migration. Account credentials provided via local env; do not commit real secrets.

## F-03 Join queue API contract

**Requirement trace:** FR-05, FR-06; BR-03–BR-06, BR-15, BR-27; NFR-05, NFR-06, NFR-09, NFR-15; D-01–D-08, D-20, D-27.

## API contract

`POST /api/v1/queues/:queueId/entries`, requires Customer session.

Request:

```json
{"partySize":4}
```

`201 CREATED` response:

```json
{"data":{"id":"33333333-3333-4333-8333-333333333333","queueId":"22222222-2222-4222-8222-222222222222","displayNumber":"R-0001","sequence":1,"partySize":4,"status":"WAITING","joinedAt":"2026-11-06T08:00:00.000Z"}}
```

No `customerId` is accepted in input, and response describes only own entry.

`422 VALIDATION_ERROR` example:

```json
{"error":{"code":"VALIDATION_ERROR","message":"Check the submitted fields.","requestId":"req-example","details":{"fields":{"partySize":"Must be an integer from 1 to 8."}}}}
```

`409 DUPLICATE_ACTIVE_ENTRY` example:

```json
{"error":{"code":"DUPLICATE_ACTIVE_ENTRY","message":"You already have an active queue entry.","requestId":"req-example"}}
```

Additional failures: `401 UNAUTHENTICATED`, `403 FORBIDDEN`, `404 QUEUE_NOT_FOUND`, `409 QUEUE_NOT_OPEN`, `409 NUMBER_CONFLICT` (unexpected/rare uniqueness collision), safe `500 INTERNAL_ERROR`. Not idempotent on repeat POST; duplicate guard yields 409, never creates a second active entry.

## Data contract / migration

Writes `queues.last_sequence`, `queue_entries` and `queue_events` in one transaction. Requires `queue_entries(queue_id,sequence)` unique, `display_number` unique, partial unique `customer_id` for active statuses, `party_size` CHECK 1–8, `queue_id` FK and `customer_id` FK. `joined_at` is DB/generated UTC timestamp and cannot be set by client. `JOINED` event `from_status=NULL`, `to_status=WAITING`, actor = authenticated customer. Index `queue_id,status,sequence` supports call-next.

## F-04 My queue and public board API contract

**Requirement trace:** FR-07, FR-08, FR-22; BR-10, BR-12; NFR-01, NFR-04, NFR-09, NFR-10, NFR-15; D-10–D-11, D-24–D-25.

## API contract

### `GET /api/v1/customer/entries/latest` — Customer only

`200` with `{"data":null}` if none; otherwise:

```json
{"data":{"id":"33333333-3333-4333-8333-333333333333","queueCode":"R","displayNumber":"R-0001","partySize":4,"status":"WAITING","joinedAt":"2026-11-06T08:00:00.000Z","calledAt":null,"servingAt":null,"completedAt":null}}
```

### `GET /api/v1/customer/entries/:entryId` — Owner only

Same `200` shape as latest if owned; `404 ENTRY_NOT_FOUND` for missing or someone else's entry:

```json
{"error":{"code":"ENTRY_NOT_FOUND","message":"Queue entry not found.","requestId":"req-example"}}
```

Anonymous `401 UNAUTHENTICATED`, wrong role `403 FORBIDDEN`.

### `GET /api/v1/public/queues/:queueId/board` — Anonymous

The seeded restaurant also accepts the stable public code `R` as `queueId`, so `/board/R` can be linked from the home/sign-in screen without embedding a database UUID. UUID-based requests remain supported and return the identical four-field DTO.

`200` with a **strictly four-field** `data` object:

```json
{"data":{"queueCode":"R","calledNumber":"R-0001","serviceState":"CALLED","waitingCount":3}}
```

When no current called/serving entry: `calledNumber:null`, `serviceState:null`. Unknown queue `404 QUEUE_NOT_FOUND`. Public board never returns extra nested entity data. `Cache-Control: no-store` (or equivalent) avoids accidental stale shared data in Sprint 1; client polling is used instead.

## Data contract

No new Sprint 1 table. Read `queue_entries` by `(customer_id,joined_at,id)` for private list/latest. Aggregate public board in query/service: current `CALLED`/`SERVING` number and count of `WAITING`, then construct an explicit DTO. Protect against inconsistent serializable view by retrieving within one DB snapshot if needed. F-05 writes new state and history; F-04 only reads.

## F-05 Call next, start and complete API contract

**Requirement trace:** FR-09–FR-12; BR-01, BR-02, BR-07–BR-09, BR-11, BR-16, BR-17, BR-26, BR-28; NFR-01, NFR-05, NFR-12, NFR-13, NFR-15; D-01, D-02, D-07–D-09, D-14, D-18, D-26.

## API contract

### `GET /api/v1/operator/queues/:queueId/desk` — assigned Operator

`200`:

```json
{"data":{"queue":{"id":"22222222-2222-4222-8222-222222222222","code":"R","state":"OPEN"},"waitingCount":2,"activeEntry":null,"nextWaiting":{"id":"33333333-3333-4333-8333-333333333333","displayNumber":"R-0001","partySize":4,"status":"WAITING"}}}
```

The response is only for an assigned queue; may show private operator operational fields, unlike anonymous public board. `401` anonymous, `403 QUEUE_ACCESS_DENIED` unassigned operator/customer.

### `POST /api/v1/operator/queues/:queueId/call-next` — assigned Operator

Body `{}`. `200`:

```json
{"data":{"id":"33333333-3333-4333-8333-333333333333","displayNumber":"R-0001","status":"CALLED","calledAt":"2026-11-06T08:05:00.000Z"}}
```

`409 QUEUE_EMPTY` if no WAITING entries; `409 SERVICE_SLOT_BUSY` if any CALLED/SERVING entry; `409 QUEUE_NOT_OPEN` for unavailable queue; `403 QUEUE_ACCESS_DENIED` if unassigned.

### `POST /api/v1/operator/entries/:entryId/start-service` — assigned Operator

Body `{}`. `200` returns updated entry:

```json
{"data":{"id":"33333333-3333-4333-8333-333333333333","displayNumber":"R-0001","status":"SERVING","servingAt":"2026-11-06T08:07:00.000Z"}}
```

### `POST /api/v1/operator/entries/:entryId/complete` — assigned Operator

Body `{}`. `200`:

```json
{"data":{"id":"33333333-3333-4333-8333-333333333333","displayNumber":"R-0001","status":"COMPLETED","completedAt":"2026-11-06T08:20:00.000Z"}}
```

Invalid state for start/complete `409 INVALID_TRANSITION`:

```json
{"error":{"code":"INVALID_TRANSITION","message":"This queue entry cannot be moved to that status.","requestId":"req-example"}}
```

Other errors: `401 UNAUTHENTICATED`, `403 FORBIDDEN` (Customer), `403 QUEUE_ACCESS_DENIED`, `404 ENTRY_NOT_FOUND` (missing), safe `500 INTERNAL_ERROR`. No endpoint allows explicit target status in JSON; the path determines the allowed single transition.

## Data contract and constraints

Update existing `queue_entries.status` with `called_at`, `serving_at`, `completed_at`. Insert `queue_events` in same transaction with `actor_id`, `from_status`, `to_status`, `event_type`, `occurred_at`. `queue_entries` partial unique queue index for CALLED/SERVING enforces active position. Index `(queue_id,status,sequence)` supports FIFO. Audit events append-only; do not use the caller-provided timestamp. The domain service determines transition legality, and conditional write/locking prevents stale state updates.

## Future sprint APIs

F-06 through F-14 have allocated responsibilities but no frozen endpoint paths yet. Detailed routes, payloads, response examples and error codes must be agreed in feature contracts before Sprint 2/3 implementation. Do not infer that advance booking exists.

## API review checklist

* Backend checks roles, entry ownership and operator queue assignment.
* DB transactions enforce uniqueness, FIFO and transition invariants under concurrent HTTP requests.
* All protected endpoints reject missing/expired/revoked session cookies.
* Public board response is assembled from an explicit four-field public DTO.
* Mutation errors never leave partial entries, numbers or events.
* Passwords, raw tokens, hashes and SQL diagnostics never appear in JSON responses.
