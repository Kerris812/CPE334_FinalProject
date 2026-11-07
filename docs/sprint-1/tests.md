# tests.md — Sprint 1 Software Test Specification and Verification Plan

> **Status:** Engineering baseline dated 6 November 2026, with approved Issue08 scope revision. F01–F05 are implemented and locally verified on the Issue09 working tree on 7 November 2026. See [release verification](release-verification.md) and [acceptance coverage](acceptance-coverage.md). Peer review, branch integration, security risk resolution and publication are not asserted complete. Examples use synthetic data.

> **Companion files:** [specification.md](specification.md) · [api-spec.md](api-spec.md) · [tests.md](tests.md) · [ui-spec.md](ui-spec.md).


## Team-approved Issue 08 scope revision — 7 November 2026

The team explicitly approved party-size routing and two independent queues in Sprint 1. This revision supersedes the original one-queue seed, Operator B's empty assignment list, and the exclusive Sprint 2 allocation of multiple queues. Other baseline decisions retain their existing status; this approval is not a claim that implementation or tests have passed.

| Queue | Accepted party size for new joins | Seed assignment | Service capacity |
| --- | --- | --- | --- |
| R | 1–4 | Operator A only | One CALLED or SERVING entry |
| S | 5–8 | Operator B only | One CALLED or SERVING entry |

Each queue has independent immutable sequence allocation, FIFO and queue-row locking. One active entry per customer across all queues remains mandatory. Existing historical entries, including parties outside the new range for their historical queue, are preserved and may finish the existing lifecycle. No historical rerouting or renumbering is permitted. New queues start OPEN; rerunning seed preserves existing queue state and counters, users, password hashes, sessions, entries and events. Seed inserts missing approved assignments and fails safely on contradictory seeded-operator assignments instead of deleting existing assignments. Multiple counters within a queue remain Sprint 2; registration and administrator management remain excluded.

### Affected requirements and regression map

| Contract area | Affected identifiers/rules | Approved change / regression obligation |
| --- | --- | --- |
| Decisions and scope | D-03, D-20; FR-04–06, FR-08, FR-16; F-02–05 and F-09; Sprint 1/2 scope and traceability | R/S routing is Sprint 1; multiple counters remain Sprint 2. D-01/02/04–09/14/18/26/28 and BR-01–08/11/15–17/26–28 remain enforced per queue or across customers as originally specified. |
| Acceptance and tests | AC/TEST-009–011, 015–024, 028–031, 032–044; TEST-045–049 | Seed two queues/two assignments; cover boundaries 1/4 on R and 5/8 on S; retain role, ownership, FIFO, terminal, audit and concurrency checks on both queues. TEST-039 still checks B forbidden from R and now also A forbidden from S. TEST-043 covers both operator journeys. Historical test evidence remains historical. |
| HTTP | GET /queues; POST /queues/:queueId/entries; GET /operator/queues; desk and three service actions; GET /public/queues/:queueId/board | Preserve paths and envelopes. Validate party-size/queue match on backend; mismatch is 422 VALIDATION_ERROR with details.fields.partySize and no writes. Only R/S accept new joins. Existing queues/history remain stored. A lists R; B lists S; a separately unassigned operator lists []. |
| Customer UI | /queues, QueueJoinForm, /my-queue | Party size determines displayed queue; remove arbitrary selection for new joins, explain both ranges, disable joining if the matching queue is unavailable, preserve status/history/refresh. |
| Operator UI | /operator/desk, Assigned queues, ActiveServiceCard | Show server assignments only, Active: 0/1 or Active: 1/1, independent waiting and service states, existing actions and responsive behavior. |
| Public UI | /board, /board/:queueId, PublicQueueBoard | /board shows R and S using two existing four-field board responses; /board/R and /board/S and UUID links remain supported. No private data or operator controls; independent loading/error/empty/refresh and visibility-aware polling. |
| Verification | NFR-01/04–06/09–10/12–13/15 | Real PostgreSQL simultaneous calls: one winner per queue; R lock cannot block S; success exactly one event per transition, rejection leaves full DB state unchanged. Authentication and existing regression coverage retained. |


## Coverage and execution status

AC-001 through AC-044 and TEST-001 through TEST-049 retain their stable identifiers. All required IDs executed in successful local runs: 10 unit, 80 API/PostgreSQL, 53 UI and 18 E2E cases, zero failures/skips; both builds passed. See [acceptance coverage](acceptance-coverage.md), [executed titles](../../artifacts/evidence/sprint1/coverage.json) and [release verification](release-verification.md) for actual commands, working-tree provenance, privacy evidence and unresolved release risks. Earlier feature verification documents are not present in this checkout; this report does not reconstruct their TDD or review history.

## Software Test Specification

**Status:** REQUIRED TESTS IMPLEMENTED AND LOCALLY EXECUTED; external release gates pending.
**Test IDs:** TEST-001 through TEST-044 correspond to AC-001 through AC-044; supplementary unit TEST-045–TEST-049 map to existing AC IDs without renumbering them.  
**Test naming convention:** `TEST-xxx short descriptive behavior` in runner output so result mapping is direct. **Failing-first** column identifies a meaningful TDD RED commit requirement, not a claim a red test has already been captured.

Primary levels: `unit` uses service function with controlled input/clock, `API-integration` uses real isolated PostgreSQL and Supertest against Express, `E2E` uses Playwright with running UI/API/DB. Do not rely on mocked persistence for integration/concurrency evidence. Use `TEST_DATABASE_URL` pointing to an isolated disposable database.

| TEST | AC | Level | Preconditions / input | Action | Expected observable result | RED first? |
| --- | --- | --- | --- | --- | --- | --- |
| TEST-001 | AC-001 | E2E | Seed Customer A, valid credentials | Log in, navigate, call `/me` | UI reaches customer page and API identifies A; HttpOnly cookie set | No |
| TEST-002 | AC-002 | API-integration | Seed hash; wrong password and nonexistent email | Submit each login | Same 401 code/message; no session created; DB hash is Argon2id not plaintext | Yes |
| TEST-003 | AC-003 | API-integration | A's live session | GET `/auth/me` | 200 safe A identity only, no hash/token/password field | No |
| TEST-004 | AC-004 | API-integration | A's valid old cookie saved | POST logout; replay cookie to `/me` | 204 then 401; DB session revoked | Yes |
| TEST-005 | AC-005 | API-integration | No cookie | GET `/me`, POST join | Both 401; no private data or entry | Yes |
| TEST-006 | AC-006 | API-integration | Seed DB session clock before expiry and just after 8 h | GET `/me` with same cookie after expiry | 401; no renewed expiry | Yes |
| TEST-007 | AC-007 | API-integration | Empty, non-string, malformed email/password | POST login per case | 422 validation; zero session rows created | No |
| TEST-008 | AC-008 | API-integration | Valid login, stored session row | Inspect Set-Cookie, JSON, session row | HttpOnly/SameSite; production Secure mode; token DB field hashed, raw password absent | No |
| TEST-009 | AC-009 | API-integration | Fresh disposable DB, seed env | Run migration and seed twice | Two R/S queues, four users, two designated assignments; no duplicate seed rows | No |
| TEST-010 | AC-010 | API-integration | Operator A assigned R | GET assigned list and R desk | R listed, authorized 200 | No |
| TEST-011 | AC-011 | API-integration | Operator B not assigned R | GET R desk; POST R call | 403; no private records or mutations | Yes |
| TEST-012 | AC-012 | API-integration | Customer A, existing R entry | POST call/start/complete with A cookie | Each 403; entry status untouched | Yes |
| TEST-013 | AC-013 | API-integration | Customer A session, forged `role:OPERATOR` in header/body | Direct operator call | 403 from server session role; no mutation | Yes |
| TEST-014 | AC-014 | API-integration | API running without auth | GET `/health` | 200 safe status/service, no credentials or private data | No |
| TEST-015 | AC-015 | API-integration | Persisted entry/event, existing database | Restart app process and rerun seed, re-fetch entry | Same entry/event persist; no counter reset | Yes |
| TEST-016 | AC-016 | API-integration | Empty R, Customer A, `partySize:4` | POST join | 201 WAITING R-0001; one entry and JOINED event | No |
| TEST-017 | AC-017 | API-integration | Separate clean fixtures: sizes 1/4 on R and 5/8 on S | POST join in each | All 201 with correct queue and party size | No |
| TEST-018 | AC-018 | API-integration | Sizes 0,9,-1,1.5,"3",null,missing | POST join for each | Every response 422; no entry/counter increment | Yes |
| TEST-019 | AC-019 | API-integration | A has WAITING; separate CALLED/SERVING fixtures and second queue; then a COMPLETED fixture | POST another join for each case | Active cases return 409 with one active row; COMPLETED case permits a new 201 join | Yes |
| TEST-020 | AC-020 | API-integration | 20 parallel HTTP calls with same A session | POST join simultaneously | Exactly one 201, rest 409; one row and JOINED event | Yes |
| TEST-021 | AC-021 | API-integration | 20 distinct seeded customer fixtures, empty R | POST join concurrently | All committed numbers distinct; sequences 1..20 within isolated queue | Yes |
| TEST-022 | AC-022 | API-integration | Queue state forced PAUSED or CLOSED in test fixture | POST join as A | 409 QUEUE_NOT_OPEN; unchanged DB | Yes |
| TEST-023 | AC-023 | API-integration | A session, payload includes B's customerId, header claims role | POST join | 422 unknown property or safe rejection; B has no new entry | Yes |
| TEST-024 | AC-024 | API-integration | R counter seeded at 9999; app restarted after previous entry | POST next join | `R-10000`, sequence 10000, unique and persistent | Yes |
| TEST-025 | AC-025 | API-integration | A has entry then completed entry | GET latest and A's entry ID | 200 with A details, latest remains COMPLETED after service | No |
| TEST-026 | AC-026 | API-integration | A/B both have separate historical entries | A GET B entry ID | 404 ENTRY_NOT_FOUND, no B fields in JSON | Yes |
| TEST-027 | AC-027 | API-integration | No session | GET latest and ID endpoint | Both 401; no private body | No |
| TEST-028 | AC-028 | API-integration | R has CALLED, waiting entries and private fields | GET public board anonymously | Exact four fields, correct numbers, no private fields | Yes |
| TEST-029 | AC-029 | API-integration | One CALLED/SERVING + one WAITING, then complete first | GET public board at each stage | Correct called number/status/count; after completed called is null | No |
| TEST-030 | AC-030 | E2E | 360 px viewport; empty then populated A; simulated slow/error request | Visit `/my-queue`, test keyboard, display states | No horizontal overflow/truncated large number; loading/empty/error controls usable | No |
| TEST-031 | AC-031 | API-integration | Nested user+event private values in DB | GET board; enumerate all JSON keys recursively | No `customerId`, email, name, partySize, private IDs/timestamps/events | Yes |
| TEST-032 | AC-032 | API-integration | Three WAITING entries with sequences 1,2,3 | Assigned Operator A POST call-next | Only sequence 1 becomes CALLED and response is R-0001 | Yes |
| TEST-033 | AC-033 | API-integration | R has no WAITING entries | POST call-next | 409 QUEUE_EMPTY, no new event/state | No |
| TEST-034 | AC-034 | API-integration | R has CALLED or SERVING and another WAITING | POST call-next | 409 SERVICE_SLOT_BUSY; only one active service entry | Yes |
| TEST-035 | AC-035 | API-integration | CALLED R entry, assigned Operator A | POST start-service | 200 SERVING, timestamp + exactly one STARTED event | No |
| TEST-036 | AC-036 | API-integration | SERVING R entry, assigned Operator A | POST complete | 200 COMPLETED, timestamp + one COMPLETED event | No |
| TEST-037 | AC-037 | API-integration | WAITING, then separate CALLED fixture | POST complete directly | 409 INVALID_TRANSITION, entry and event counts unchanged | Yes |
| TEST-038 | AC-038 | API-integration | Customer A session, R entries | POST call-next/start-service/complete | All 403 and no mutation | Yes |
| TEST-039 | AC-039 | API-integration | B unassigned to R and A unassigned to S, entries in both | GET R desk and POST all actions | Every response 403, no entry leak/change | Yes |
| TEST-040 | AC-040 | API-integration | Each R/S queue with two WAITING; simultaneous assigned-operator calls per queue | POST call-next concurrently | Exactly one 200, other 409; one CALLED row/event, FIFO head selected | Yes |
| TEST-041 | AC-041 | API-integration | Fresh Customer A + Operator A | Join, call, start, complete; query events | Four ordered events with correct actors, old/new statuses and UTC times | Yes |
| TEST-042 | AC-042 | API-integration | COMPLETED entry | POST start/complete repeatedly; call-next with no WAITING | Invalid transitions rejected; terminal state and events unchanged | Yes |
| TEST-043 | AC-043 | E2E | Real UI/API/DB, separate customer/operator browser contexts for R/S | Both customers join; both assigned operators call/start/complete; customers refresh; anonymous dual board | Customer sees COMPLETED after persistence; board reveals no private information | No |
| TEST-044 | AC-044 | API-integration | Queue R PAUSED/CLOSED via fixture and a WAITING entry | Assigned Operator A call-next | 409 QUEUE_NOT_OPEN and no state/event mutation | Yes |

## Additional planned unit tests with stable IDs

These are mandatory unit tests for critical business logic, in addition to real database API integration tests above.

| TEST | AC | Level | Preconditions / input | Action | Expected observable result | RED first? |
| --- | --- | --- | --- | --- | --- | --- |
| TEST-045 | AC-032 | unit | WAITING entries supplied in order 3,1,2 | Apply FIFO eligibility selector | Sequence 1 selected; client sort order irrelevant | Yes |
| TEST-046 | AC-037 | unit | WAITING, CALLED and SERVING statuses | Evaluate transition policy to COMPLETED | WAITING and CALLED forbidden, SERVING allowed | Yes |
| TEST-047 | AC-024 | unit | Counter values 1,9,9999,10000 and queue code R | Format display number | R-0001, R-0009, R-9999, R-10000 | Yes |
| TEST-048 | AC-018 | unit | Values 1,8,0,9,1.5,"3",null | Apply party-size validation | Only integer 1 and 8 accepted | Yes |
| TEST-049 | AC-042 | unit | Terminal status COMPLETED | Evaluate all outgoing transitions | No new active status permitted | Yes |

Other possible supplementary checks, to be numbered new unique test IDs after TEST-049 when specified: 401/403 error shape; UI non-color status, 422 inline errors and desk keyboard navigation. Do not reuse IDs.

## Expected test file organization (planned, not yet present)

| Location | Purpose |
| --- | --- |
| `server/tests/unit/queue-rules.test.ts` | FIFO eligibility and transition policy unit tests. |
| `server/tests/unit/number-format.test.ts` | R-0001 to R-10000 sequence formatting. |
| `server/tests/api/auth.test.ts` | Login, logout, me, expiry, cookie security. |
| `server/tests/api/authorization.test.ts` | Queue assignment, cross-customer privacy, role spoofing. |
| `server/tests/api/queue-join.test.ts` | Validation, concurrent joins, duplicate and DB persistence. |
| `server/tests/api/public-board.test.ts` | Public allowlist and count/status. |
| `server/tests/api/queue-service.test.ts` | FIFO, call/start/complete, conflict, audit, concurrent call. |
| `client/tests/ui/login.test.tsx` | Login form validation and state. |
| `client/tests/ui/queue-display.test.tsx` | Large number, loading/empty/error and status labels. |
| `client/tests/e2e/sprint1-journey.spec.ts` | Customer + Operator full UI workflow. |

## Test isolation and execution evidence

1. Provision isolated test DB; run migrations and deterministic synthetic fixtures. Never run destructive fixtures against production.
2. For each TDD marked test, commit the real failing assertion before implementing the behavior; record tested SHA, command, failure output and expected reason. Then implement and record green execution. Red evidence is not satisfied by an intentionally broken assertion or wrong environment.
3. Run unit, API-integration and UI/E2E checks on the submitted commit. Record pass/fail/skip totals, test names/files, duration, command and SHA. Screenshots are supplementary evidence, not replacements for tests.
4. Include actual sampled domain test assertion and authorization assertion in the final PDF only after their source exists, with their real results and no invented code excerpts.
5. Unknown actual status remains **NOT RUN**. Do not change test expectations merely to green an incorrect implementation.

## Product Definition of Done (Sprint 1)

All AC-001–AC-044 have runnable test evidence or explicit failed/blocked disclosures; API/database integration checks use real PostgreSQL; UI journey and 360px customer view verified; no high-severity security/privacy or concurrency defect left undisclosed; feature contracts precede implementation; Git Issues, substantive teammate reviews, staging integration and reviewed main release recorded; README/seed/migrations/env docs reproducible; PDF includes Parts A–F and actual tested tag/SHA. This document is design only; **DoD is not yet met.**

## Feature-level TDD emphasis

### F-01 Login, logout and current user

## Verification / failing-first

`TEST-001` through `TEST-008` in [Sprint 1 test specification](tests.md) are required. **RED first:** TEST-002 (invalid credentials / safe hash behavior), TEST-004 (revocation), TEST-006 (expiry) and TEST-005 (no anonymous access). Preserve command, failing assertion, commit, green commit and command output. Do not assert pass before execution.

### F-02 Role and queue authorization

## Verification / failing-first

`TEST-009` through `TEST-015` in STS. **RED first:** TEST-011 (operator unauthorized queue), TEST-012 (Customer operator action), TEST-013 (role spoofing), TEST-015 (persistence). The role matrix is an API contract, not only UI gating. Record actual test output once executed.

### F-03 Join queue

## Verification / failing-first

`TEST-016` through `TEST-024`, plus unit `TEST-047` and `TEST-048` in STS. **RED first:** TEST-018 invalid party sizes, TEST-019 duplicate active, TEST-020 simultaneous same-user, TEST-021 distinct concurrent numbers, TEST-022 not-open, TEST-023 identity spoof, TEST-024 monotone numbering. Integration tests must use real PostgreSQL, not mocked in-memory counters. Evidence must include DB counts and return codes; keep exact test command + commit.

### F-04 My queue and public board

## Verification / failing-first

`TEST-025` through `TEST-031` in STS. **RED first:** TEST-026 cross-customer access, TEST-028 public allowlist, TEST-031 nested data leakage. Use actual API response assertions, not screenshots or hidden controls alone. UI viewport test supplements backend permissions.

### F-05 Call next, start and complete

## Verification / failing-first

`TEST-032` through `TEST-044`, plus unit `TEST-045`, `TEST-046`, `TEST-049` in STS. **RED first:** TEST-032 FIFO, TEST-034 slot exclusivity, TEST-037 invalid transition, TEST-038 role forbidden, TEST-039 queue assignment, TEST-040 concurrent call, TEST-041 event atomicity, TEST-042 terminal guard, TEST-044 queue state guard. Include both unit rule tests and real DB API integration tests, and one selected Playwright full journey. A screenshot is not enough to establish concurrency or access guard correctness.

## Implementation and TDD roadmap

**Status:** PLAN ONLY; do not implement until user explicitly approves. No project test scripts or files have been executed. The exact commands below are the agreed **future script interface**, to be established in CHORE-01, not assertions that they currently exist.

## Ordered implementation sequence (contract-first and TDD)

| Step | Work | Required output before advancing |
| --- | --- | --- |
| 1 | Pair review D-01–D-28; confirm stack and screen/API naming. | Reviewed decision and baseline docs commits; unresolved issues marked. |
| 2 | Create GitHub repo board, `main`, `sprint-1-staging`, Issue/PR templates, branch protection plan. | Board/issues; initial staging branch; two-person reviewer rule. |
| 3 | Commit Parts A–D and all F-01–05 contracts + STS before implementation. | Versioned specification hash/PR review, AC-001–044 and TEST-001–044 mapped. |
| 4 | CHORE-01: install dependencies, configure isolated PostgreSQL, migration, partial unique indexes, seed and health/test scripts. | Fresh migrate/seed twice successful when later executed; seed must not reset counters. |
| 5 | F-01: write wrong-password, anonymous, expiry and logout replay **failing tests first**; implement auth; add UI. | Red output + green output tied to commit; no plaintext, genuine revocation. |
| 6 | F-02: write unauthorized operator/role spoof/ownership guard **failing tests first**; implement guards/list/seed. | 401/403 tests from HTTP; Operator B can access S only; A can access R only. |
| 7 | F-03: write validation/duplicate/race **failing tests first**, then transaction and customer join UI. | Real PostgreSQL concurrency outputs, distinct numbers, partial unique constraint. |
| 8 | F-04: write cross-customer and public allowlist **failing tests first**, then customer view + board + UI states. | Own-data 200, foreign 404, public four-key JSON, responsive check. |
| 9 | F-05: write FIFO/invalid-transition/unauthorized/concurrent-call **failing tests first**, then lifecycle and operator desk. | Call/start/complete API and audit checks; one active service slot; normal E2E. |
| 10 | Run whole-suite integration; peer review PRs into staging; fix via issue/fix branch. | Actual build/unit/API/UI/E2E output, no hidden failing required checks. |
| 11 | Part F screenshots, DB persistence restart, two excerpts, issues/reviews/contribution evidence. | Self-contained PDF source content with actual AC and TEST results. |
| 12 | Reviewed staging→main release PR, test on exact main SHA, tag `v0.1.0`, generate submission PDF A–F. | Tagged accepted commit, safe demo credentials handoff, runnable README. |

## Required future `package.json` script names

CHORE-01 must add these scripts (the definitions below are specifications, not application code):

| Package | Script | Required behavior |
| --- | --- | --- |
| `server` | `dev` | Start TypeScript Express API in watch/dev mode. |
| `server` | `db:migrate` | Apply versioned Prisma migrations (e.g. `prisma migrate deploy`) without resetting data. |
| `server` | `db:seed` | Run idempotent synthetic seed (e.g. `prisma db seed`). |
| `server` | `test:unit` | Run unit suite noninteractively with Vitest `run`. |
| `server` | `test:api` | Run API + real disposable PostgreSQL integration suite noninteractively. |
| `server` | `build` | Type-check/produce build, nonzero exit on errors. |
| `client` | `dev` | Start Vite dev server, proxy `/api/v1` and `/health` to backend. |
| `client` | `test:ui` | Run React unit/UI component suite noninteractively with Vitest. |
| `client` | `test:e2e` | Run Playwright Sprint 1 browser tests against running UI/API/test DB. |
| `client` | `build` | Type-check/build Vite client, nonzero exit on errors. |

### Exact local commands once scripts exist

Dependency installation:

```bash
npm --prefix server ci
npm --prefix client ci
```

Ensure real PostgreSQL is running and `server/.env` contains `DATABASE_URL` and a **different disposable** `TEST_DATABASE_URL`. Supply synthetic `DEMO_CUSTOMER_PASSWORD` and `DEMO_OPERATOR_PASSWORD` only in ignored local environment. Do not paste secret values into screenshots or PDF.

Migration and seed:

```bash
npm --prefix server run db:migrate
npm --prefix server run db:seed
```

Start backend and frontend in **two separate terminals**:

```bash
npm --prefix server run dev
```

```bash
npm --prefix client run dev
```

Run all required test groups and builds:

```bash
npm --prefix server run test:unit
npm --prefix server run test:api
npm --prefix client run test:ui
npm --prefix client run test:e2e
npm --prefix server run build
npm --prefix client run build
```

Install browser binaries only if not already available:

```bash
cd client
npx playwright install chromium
```

Read test outputs, include pass/fail/skip counts and exit status. For TDD, use the **same specific test file/name** before and after implementation, not only a whole-suite summary. For exact test-name filtering, agreed invocation after a Vitest script exists (example `TEST-020`):

```bash
npm --prefix server run test:api -- -t "TEST-020"
```

Playwright single E2E case, once file exists:

```bash
npm --prefix client run test:e2e -- tests/e2e/sprint1-journey.spec.ts
```

The exact commands are a **contract** for the forthcoming project setup. None have been tested, and they will fail if invoked before package scripts and test files exist. Update these instructions if CHORE-01 creates different names, and record the reason in Git.

## Required Part F demonstration captures

| Capture ID | Role / starting state | Steps to show | Expected evidence in screenshot / output | Linked AC / TEST |
| --- | --- | --- | --- | --- |
| DEMO-01 | Customer A signed out | Login with synthetic seeded credentials | Logged-in customer page and role-safe header; no password visible | AC-001, TEST-001 |
| DEMO-02 | Customer A, no active entry | Enter `partySize=4`, join R | Large `R-0001`, WAITING; API 201, DB row/event | AC-016, TEST-016 |
| DEMO-03 | Customer A, already active | Attempt second join | 409 duplicate message; DB still one active row | AC-019, TEST-019 |
| DEMO-04 | Customer A, input invalid | Try party sizes 0 and 9 | 422 field error; DB remains unchanged | AC-018, TEST-018 |
| DEMO-05 | Operator A assigned R | Login, call next | R-0001 CALLED on desk, and board public number only | AC-032, AC-029 / TEST-032, TEST-029 |
| DEMO-06 | Operator A, entry CALLED | Start service, then complete | SERVING → COMPLETED, new DB events/timestamps | AC-035–036, AC-041 |
| DEMO-07 | Customer A after operator completion | Refresh `/my-queue` or restart API then retrieve | Same completed entry from DB, not browser-only storage | AC-025, AC-015, AC-043 |
| DEMO-08 | Customer A | Attempt `call-next` using API test/direct request | 403 despite any hidden UI; unchanged DB | AC-038 / TEST-038 |
| DEMO-09 | Operator B unassigned to R | Access R desk/call by direct URL/API | 403 and no sensitive R entry payload | AC-039 / TEST-039 |
| DEMO-10 | Customer A + B entries | A requests B entry ID | 404 with no B's details | AC-026 / TEST-026 |
| DEMO-11 | Anonymous visitor | Open public board and inspect JSON | Four public fields only; no email/partySize/customer ID | AC-028, AC-031 |
| DEMO-12 | Customer A logged in | Logout, replay former cookie through API test | Subsequent request 401, DB revoked session | AC-004 / TEST-004 |
| DEMO-13 | Operator A, entry WAITING | Direct POST complete | 409 INVALID_TRANSITION; history unchanged | AC-037 / TEST-037 |
| DEMO-14 | Parallel clients, test DB | Run concurrency suite | One same-customer join, distinct numbers and one call, with DB assertions | AC-020, AC-021, AC-040 |

Actual screenshot names, steps, starting DB fixtures, user/role, expected and actual results, tested SHA must be captured **after implementation**. Do not stage screenshots of mock UI as evidence of real API/database behavior. Auth requests in terminal tests must redact Cookie values and passwords.

## Part F required evidence package and PDF layout

* **A:** stakeholder/context, actors, exclusions, all FR/BR/NFR, D decisions.
* **B:** features F-01–14, traceability, later coverage allocations, approved changes/gaps.
* **C:** architecture/ER, ownership constraints, API/role matrix, auth, env/GCP plan, diagrams.
* **D:** three-sprint goal/features/dependencies/outcome and why two independent single-slot queues are feasible.
* **E:** complete F-01–05 contracts, UI/API/data, AC-001–044, STS and Product DoD, dated spec-to-test-to-implementation history.
* **F:** screenshots DEMO-01–14 (selected clear subset), actual run outputs, [Part F evidence matrix](tests.md), **two actual short test excerpts** (one domain rule and one role/ownership), red→green evidence, two Issue/PR/review samples, release main tag+SHA, both students' contribution table, AI-use declaration, limitations.

The submitted PDF must be **self-contained** with A–F and a page-number table of contents/navigation table. GitHub docs are additionally required and not a substitute for the PDF. Do not put actual passwords or raw tokens in screenshots or PDF.

## Suggested selected test excerpts, once code exists

1. **Domain rule excerpt:** actual `TEST-020` (20 parallel same-customer joins) or `TEST-037` (reject direct WAITING→COMPLETED). Include fixture, request/action and meaningful DB/assertion, real file path, tested commit and result.
2. **Authorization excerpt:** actual `TEST-026` (Customer A cannot read B) or `TEST-039` (Operator B cannot manage R). Include separate actors/tokens in fixture with values redacted, request, 404/403 and no data leak assertion.

Do not invent source excerpts in this plan. Only extract short code snippets from the actual implemented test files at submission time.

## README requirements

Repository product description and scope; technologies; prerequisites and Node/Postgres versions; install commands; `.env.example` variable names (no real secrets); safe local account provisioning; migrations and idempotent seed; how to run UI/API and identify ports; `/health` smoke check; all build/test commands; isolated test database; role permissions and demo sequence; architecture/docs navigation; known limitations (no booking/no-show until Sprint 2); screenshots and release reference; later Docker/GCP directions once Lab 5 complete; AI-use declaration location.

## Acceptance results status

Before implementing, every AC-001–044 is `NOT RUN` in [Part F evidence matrix](tests.md). Do not mark `PASS` until test command and output are recorded on a specific commit, and explicitly report any `FAIL`, `SKIP` or not-covered AC.

**Stop point:** Wait for explicit permission to write application code after engineering documents have been reviewed.

## Part F execution evidence template

**Status:** EMPTY TEMPLATE. All results `NOT RUN` by design. Only fill with actual output from the implemented application and the submitted release SHA.

## Release metadata

| Field | Actual value |
| --- | --- |
| Team members / student IDs | TODO (do not guess) |
| Repository URL | TODO |
| Staging merge SHA | TODO |
| Main accepted SHA | TODO |
| Release tag | `v0.1.0` (planned only) |
| Test execution date and timezone | TODO |
| Automated test pass / fail / skip | NOT RUN |
| Known unimplemented or failed checks | Record accurately |

## AC-to-test execution matrix

The current [44-row acceptance matrix](acceptance-coverage.md) links each criterion to executed source files and test levels. [coverage.json](../../artifacts/evidence/sprint1/coverage.json) additionally records every actual passing title, including supplementary unit TEST-045–049. Generate these from runner output using `node scripts/sprint1-coverage.mjs`; missing required IDs, failures, skips and inconsistent case counts fail the audit.

## Required real build and test run results

Tested base SHA: `4055a963b345dc1182b90ee8ab93e74145dbcaa1` **plus uncommitted Issue09 changes**. Database-dependent commands ran with isolated database overrides through an ignored local launcher; exact arguments are in [commands.json](../../artifacts/evidence/sprint1/commands.json). See the [README](../../README.md#tests) for reproducible environment preparation.

| Command | Passed | Failed | Skipped | Evidence |
| --- | ---: | ---: | ---: | --- |
| `npm --prefix server run test:unit -- --reporter=verbose` | 10 | 0 | 0 | [Unit](../../artifacts/evidence/sprint1/unit.txt) |
| `npm --prefix server run test:api -- --reporter=verbose` | 80 | 0 | 0 | [API](../../artifacts/evidence/sprint1/api.txt) |
| `npm --prefix client run test:ui -- --reporter=verbose` | 53 | 0 | 0 | [UI](../../artifacts/evidence/sprint1/ui.txt) |
| `npm --prefix client run test:e2e` | 18 | 0 | 0 | [Browser](../../artifacts/evidence/sprint1/e2e.txt) |
| `npm --prefix server run build` | Build pass | — | — | [Server build](../../artifacts/evidence/sprint1/server-build.txt) |
| `npm --prefix client run build` | Build pass | — | — | [Client build](../../artifacts/evidence/sprint1/client-build.txt) |

## Required test excerpts

Actual domain-rule source: [operator workflow tests](../../server/tests/api/operator-workflow.test.ts), TEST-037: snapshots and compares the persisted fixture after invalid lifecycle actions. Actual role/ownership source: [queue view tests](../../server/tests/api/queue-views.test.ts), TEST-026: foreign/missing/malformed IDs return safe indistinguishable 404s. Both names and successful outputs appear in [api.txt](../../artifacts/evidence/sprint1/api.txt), with revision provenance above.

The new [release journey](../../client/tests/e2e/sprint1-journey.spec.ts) uses the actual assertion `expect(foreign.status()).toBe(404)` and compares the completed entry/events before and after denied operator requests. [Persistence test](../../server/tests/api/release-persistence.test.ts) checks the exact completed DTO and database rows across two real API processes and two intervening seeds.

## Failing-first TDD evidence (historical template, not current test results)

Issue09 adds integration assertions to existing behavior; they passed on first execution. No RED result or past RED/GREEN commit was fabricated. The historical feature TDD record below remains unpopulated in this checkout and is not established by this verification. Current GREEN evidence is above.

| Feature / rule | RED test commit | Actual failing output file/screenshot | GREEN implementation commit | Actual passing output |
| --- | --- | --- | --- | --- |
| F-01 logout/token expiry | TODO | NOT RUN | TODO | NOT RUN |
| F-02 assignment/role guards | TODO | NOT RUN | TODO | NOT RUN |
| F-03 duplicate/concurrent join | TODO | NOT RUN | TODO | NOT RUN |
| F-04 private-entry/board leak | TODO | NOT RUN | TODO | NOT RUN |
| F-05 FIFO/transition/concurrent call | TODO | NOT RUN | TODO | NOT RUN |

## Sample Issue / PR / reviewer evidence

| Issue | Branch | Author | Reviewing teammate | PR to staging | Substantive review finding | Integrated SHA |
| --- | --- | --- | --- | --- | --- | --- |
| Issue TODO | TODO | TODO | TODO | TODO | TODO | TODO |
| Issue TODO | TODO | TODO | TODO | TODO | TODO | TODO |

## Contribution table template

| Team member | Requirement/design contributions | Test/TDD contributions | Implementation contributions | PR/review/release contributions | Linked Issues/PRs/commits |
| --- | --- | --- | --- | --- | --- |
| Member A (replace with name/ID) | TODO | TODO | TODO | TODO | TODO |
| Member B (replace with name/ID) | TODO | TODO | TODO | TODO | TODO |

## Demo, limits and disclosure

Current genuine demo screenshots, role-separated journey, expected/actual assertions and base SHA are recorded in [release verification](release-verification.md). No deployment or GitHub review capture is claimed.

Current limitations: four high-severity affected server dependency packages need review; production hosting and non-Chromium browsers are unverified; human release gates remain outstanding. Local regression has zero failed/skipped cases. See the release report for details.

AI-use declaration (fill truthfully): tool, tasks assisted, human review and verification. No transcript is required.

PDF navigation (actual pages only): A pages TODO; B pages TODO; C pages TODO; D pages TODO; E pages TODO; F pages TODO.

**Never claim passing tests or a released tag before executing and verifying them.**

## Coverage bookkeeping

Sprint 1 tests must use isolated PostgreSQL fixtures, execute the backend authorization endpoints directly, and exercise a real UI→API→database E2E path. Tests for later sprints are allocated conceptually but have no executable IDs yet. Add new unique IDs rather than reusing AC/TEST values.

## Issue 08 approved routing tests (new IDs)

| ID | Layer | Required assertions |
| --- | --- | --- |
| TEST-052 | Unit | Route 1/4 to R, 5/8 to S; reject 0/9, decimals, strings/null. |
| TEST-053 | API/PostgreSQL | Idempotent non-destructive seed creates R/S and A→R/B→S; snapshot users, sessions, counters, entries and events unchanged on rerun; fail safely on contradictory assignments. |
| TEST-054 | API/PostgreSQL | Four join boundaries, all mismatches and unsupported queues; matching PAUSED/CLOSED queues reject; rejected requests preserve entire fixture state; same-customer R/S race permits one join. |
| TEST-055 | API/PostgreSQL | Seeded A can inspect/mutate R only, B S only; forged queue/actor data cannot grant permission. |
| TEST-056 | API/PostgreSQL | Both queues choose independent FIFO heads; 20 concurrent calls per queue produce one winner each; hold R row lock while S call commits; each transition exactly one correctly attributed event. |
| TEST-057 | UI/E2E | Party-size routing, unavailable matching queue, safe conflicts, capacity labels, both public boards; both operators complete persisted workflows; customer refresh and anonymous privacy checks. |

Existing TEST-009–011/015–024/028–044 remain regression requirements, with seed counts, boundary fixtures, B's assigned list and per-queue coverage revised above. Existing historical evidence describes its original scope and does not establish results for this revision. API and E2E suites sharing the disposable DB run sequentially; browser tests using seeded R/S also run sequentially and restore only their own fixture changes.

## Issue 08 routing verification — 7 November 2026

Executed against the uncommitted `feature/8-operator-workflow` working tree. Evidence and source hashes: [routing results](../../artifacts/evidence/f05-routing/results.json). Historical baseline results above remain unchanged.

| Stage / suite | Actual result | Evidence |
| --- | --- | --- |
| RED unit | 2 failed, 8 passed | `artifacts/evidence/f05-routing/red-unit.log` |
| RED selected API | 8 failed, 71 filtered out | `artifacts/evidence/f05-routing/red-api.log` |
| RED UI | 4 failed, 35 passed | `artifacts/evidence/f05-routing/red-ui.log` |
| RED selected E2E | 1 failed: missing S | `artifacts/evidence/f05-routing/red-e2e-isolated-ports.log` |
| GREEN/refactor unit | 10 passed, 0 failed/skipped | `refactor-unit-final.log` in the same directory |
| GREEN/refactor API/PostgreSQL | 79 passed, 0 failed/skipped | `refactor-api.log` |
| GREEN/refactor UI | 39 passed, 0 failed/skipped | `refactor-ui.log` |
| GREEN/refactor E2E | 13 passed, 0 failed/skipped | `refactor-e2e.log` |
| Server and client builds | Both passed | `refactor-build-server.log`, `refactor-build-client.log` |

Real PostgreSQL TEST-056: 20 simultaneous calls to each queue produced one success and 19 SERVICE_SLOT_BUSY responses per queue; both FIFO heads were selected, each with exactly one CALLED event. Holding R's queue-row lock did not prevent S from calling before that lock was released. Both seeded operators completed their own browser workflows with four events per joined entry; customer status persisted COMPLETED and the public boards cleared their active numbers. Existing audit-insert rollback, auth, ownership, immutable-number and queue-joining regressions passed.

Development seed verification preserved 4 users, 24 existing sessions, 4 entries, 11 audit events, the existing queue/state/counter and assignment; it added S and B→S, and the second seed changed nothing. No routing migration was required; development migration deployment reported no pending migrations. No commit, push, merge or data reset was performed. The first E2E launch encountered the occupied development port; the genuine RED and final runs used isolated ports 3400/5473. API and browser suites ran sequentially.
