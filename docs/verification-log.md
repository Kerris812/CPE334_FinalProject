# Verification log

Consolidated foundation, authentication and authorization verification history, preserving commands, results, limitations and changed-file records. Documentation cleanup dated 6 November 2026; base commit `1d35a0f`.

Results apply to the working tree on top of base commit 1d35a0f. Replace with the PR commit SHA after commit.

Changed-file lists retain historical paths; the RED evidence is now under `artifacts/evidence/`, and reproducible GREEN/build output is no longer retained.

## Issue 2: Foundation

Local environment: macOS arm64, Node 24.14.0, npm 11.9.0, PostgreSQL 16.15. Isolated persistent cluster under ignored `.local/postgres`, localhost port 55432; separate `restaurant_queue` and `restaurant_queue_test` databases. Ignored `server/.env` holds generated synthetic passwords. These paths are local verification setup, not required deployment paths. No mock/in-memory persistence was used. Results apply to the working tree on top of base commit 1d35a0f. Replace with the PR commit SHA after commit.

Failing-first execution before implementation: `npm --prefix server run test:unit` and `cd server && npx vitest run tests/api/health.test.ts` each failed to import their not-yet-created implementation module (`test-database.js` / `app.js`); no assertions ran at that stage. Then implementations were added and the suites passed. This records the limited scaffold-level RED evidence accurately; no RED commit exists because committing was prohibited. Database tests were executed against real PostgreSQL after migration implementation.

| Command | Actual result |
| --- | --- |
| `npm --prefix server install` | Installed; initial sandbox network failure resolved with approved execution |
| `npm --prefix client install` | Installed |
| `npm --prefix server run db:generate` | Passed; approved execution required access to Prisma engine cache |
| `npm --prefix server run db:migrate` twice | First applied `0001_foundation`; second had no pending migrations |
| `npm --prefix server run db:seed` twice | Both passed against development DB |
| `npm --prefix server run test:unit` | 1 passed |
| `npm --prefix server run test:api` | 4 passed across 3 files using actual PostgreSQL |
| `npm --prefix server run build` | Passed |
| `npm --prefix client run build` | Passed |
| `npm --prefix client run test:ui` | 1 passed |
| `npm --prefix client run test:e2e` | 1 passed (Chromium, real API/Vite, 3.0s) |
| `npm --prefix server run test:api` repeated on existing test DB | 4 passed; no pending migrations |
| `git diff --check` | Passed; ignored env, DB files and build output confirmed |

API coverage: TEST-009 repeated migration/seed, exact seed identities/counts/assignment, hash verification, stable IDs/hashes and preservation of changed counter/state; TEST-014 safe anonymous health; database constraints for duplicate active customers/service slots, party-size bounds, sequence uniqueness and foreign keys; seeded data unchanged across two actual API processes. Fixtures restore their own temporary queue edits and remove their own entry. The disposable test database was explicitly recreated once during test development; normal scripts never recreate databases.

TEST-015 is deferred: no join/read API exists yet. Foundation restart coverage is not evidence that the future entry/event HTTP persistence journey works.

Dependencies were audited; compatible fixes applied and Vitest upgraded to 5.1.0 to remove its critical advisories. Frontend audit reports zero vulnerabilities. Backend retains four high advisories in Prisma 6 tooling (`@prisma/config`, `effect`, `deepmerge-ts`, `prisma`); npm proposes a breaking Prisma 7 upgrade. `npm --prefix server audit --omit=dev` also reports these four highs because Prisma tooling is present in the resolved dependency graph; do not interpret them as excluded from the installed production tree. The command exits 1. Prisma 7 configuration migration is a remaining maintenance dependency; no forced major upgrade was applied.

## Issue 3: Authentication / F-01

Implemented the scope of [GitHub issue #4, titled Issue03](https://github.com/Kerris812/CPE334_FinalProject/issues/4), after reading all four `docs/sprint-1` engineering contracts. Verified the public issue body through GitHub's API. Existing Prisma schema, migration, Argon2id seed, Express conventions, Vitest/Supertest, Testing Library and Playwright were reused. No migration was necessary.

Local verification: macOS arm64; Node 24.14.0; PostgreSQL 17.11; Chromium through Playwright. A new disposable PostgreSQL cluster was initialized under `/tmp/cpe334-auth-pg`, bound to `127.0.0.1:55432`, with different `cpe334_auth_dev` and `cpe334_auth_test` databases. Ignored `server/.env` contains generated synthetic seed passwords. Real PostgreSQL was used for integration and browser journeys; only the supplemental repository-failure test injects a failing repository. Build output, local credentials, browser caches and test-result artifacts are ignored.

Base HEAD: `29b3034be9f93d270ddb931fa5244c93bbaebbbc`. Results apply to the working tree on top of base commit 1d35a0f. Replace with the PR commit SHA after commit. No PR, merge, tag or deployment was made. Consequently there are no RED/GREEN commit SHAs; the evidence below records actual local executions, not a released build.

### RED → GREEN → REFACTOR

Tests were written before implementing the auth endpoints and login UI. The initial real-database API run returned 404 from the existing foundation app, and the UI tests failed because the login form did not exist. TEST-008 failed at the missing Set-Cookie access, and TEST-006 could not find the not-yet-created session; these are missing-behavior failures, not intentionally broken assertions. The browser RED run with installed Chromium timed out looking for the absent Email input. An earlier browser attempt could not launch Chromium and is excluded from behavioral RED evidence and counts.

| Phase / command | Pass | Fail | Skip | Exit | Actual output |
| --- | ---: | ---: | ---: | ---: | --- |
| RED: `npm --prefix server run test:api` | 4 | 9 | 0 | 1 | [API RED](../artifacts/evidence/f01/red-api.txt) |
| RED: `npm --prefix client run test:ui` | 1 | 6 | 0 | 1 | [UI RED](../artifacts/evidence/f01/red-ui.txt) |
| RED: `npm --prefix client run test:e2e -- tests/e2e/auth.spec.ts` | 0 | 2 | 0 | 1 | [Browser RED](../artifacts/evidence/f01/red-e2e.txt) |
| Final: `npm --prefix server run test:unit` | 1 | 0 | 0 | 0 | (raw output not retained; counts recorded above) |
| Final: `npm --prefix server run test:api -- --reporter=verbose` | 14 | 0 | 0 | 0 | (raw output not retained; counts recorded above) |
| Final: `npm --prefix client run test:ui` | 7 | 0 | 0 | 0 | (raw output not retained; counts recorded above) |
| Final: `npm --prefix client run test:e2e` | 3 | 0 | 0 | 0 | (raw output not retained; counts recorded above) |

Final total: **25 passed, 0 failed, 0 skipped**. Tests include existing foundation coverage. Initial RED coverage had nine API authentication/security cases; TEST-051 was added subsequently for repository failure handling. TEST-007's request fixture was refined to explicitly send JSON and an allowed Origin so malformed field cases reach semantic validation. Its ID and intended assertions were retained. No test expectations were weakened.

Both `npm --prefix server run build` and `npm --prefix client run build` passed: (raw output not retained; counts recorded above), (raw output not retained; counts recorded above). The first client build identified missing Node types in the browser fixture; adding `@types/node` and updating the lockfile resolved it. `git diff --check` passed.

Refactoring centralizes safe API errors, identity DTO construction, cookie options, session and mutation guards, frontend auth requests and unauthenticated-error detection. UI tests, browser tests and builds were rerun after the final frontend helper refactor; API regression was rerun with named test output.

### Stable test coverage

| ID | Actual test coverage |
| --- | --- |
| TEST-001 | Customer/operator login, case-normalized email, safe server roles; two real browser login/reload/logout journeys at 360 px; `/me` identity and HttpOnly cookie. |
| TEST-002 | Same 401 code/message for wrong password, unknown and inactive accounts; no new sessions; seeded Argon2id hash verifies. |
| TEST-003 | Exact current-user allowlist, no-store response, account deactivation invalidates subsequent requests. |
| TEST-004 | 204 logout, cookie clearing, committed revoked timestamp, replay rejected, separate session still valid. |
| TEST-005 | Missing, malformed and unknown cookie rejection on `/me`, logout and the protected future join namespace; 401 envelope. |
| TEST-006 | Controlled clock before, exactly at and after the eight-hour boundary; no sliding expiry or renewed cookie. |
| TEST-007 | Missing/empty/wrong-type/oversized/malformed credentials, null/array body, forged role/identity fields; safe 422 and malformed JSON 400; no persistence. |
| TEST-008 | Random unique tokens of at least 32 bytes; SHA-256-only session storage; eight-hour persisted lifetime; HttpOnly, SameSite=Lax, Path=/, Max-Age; production Secure despite false local override; secure clearing cookie; no JSON/console secrets. |
| TEST-050 | Missing/opaque/foreign origin and form requests rejected, session remains live; foreign-origin login rejected. |
| TEST-051 | Repository lookup/session-persistence failures produce safe 500 without exception diagnostics or cookies. |

Six new component tests cover labels, password visibility, no role selector, field-linked validation, loading and double-submit prevention, customer navigation, operator restoration, logout, authentication/validation errors, connection retry and failed-logout recovery. The seventh UI test is the existing foundation test.

### Changed files

- `server/src/app.ts`: JSON parsing, auth router, protected namespace gate, no-store headers and error handling.
- `server/src/auth/auth.ts`: credential validation, Argon2id verification, session lifecycle, identity DTO, cookie and origin/JSON guards.
- `server/src/http/errors.ts`: shared safe error envelope.
- `server/tests/api/auth.test.ts`: TEST-001–008 and TEST-050–051.
- `server/scripts/test-api.ts`: forward documented Vitest filters/reporters.
- `server/.env.example`: matching browser origin; fixed lifetime documentation.
- `client/src/App.tsx`: login, identity restoration, role landing pages, access state and logout.
- `client/src/auth-api.ts`: shared auth requests, identity type and error handling.
- `client/src/style.css`: specified palette, responsive form, 44 px controls and focus/error styling.
- `client/tests/ui/login.test.tsx`: six component tests.
- `client/tests/e2e/auth.spec.ts`: two real browser journeys.
- `client/package.json`, `client/package-lock.json`: Node types for Playwright fixtures.
- `README.md`: auth setup, API, origin/cookie rules, feature scope and evidence navigation.
- `docs/sprint-1/tests.md`: execution-status pointer to this evidence.
- `docs/f01-verification.md` and nine `docs/evidence/f01/*.txt` files: this report and actual execution output.

### Scope and remaining work

No incomplete requested F-01 behavior is known from these checks. Queue joining, queue discovery and operator service transitions are intentionally unimplemented. Authenticated `/queues` and `/operator/desk` are landing pages with identity/logout; private queue API namespaces enforce authentication but return 404 for authenticated operations until their feature is implemented. No full queue journey, deployed HTTPS environment, teammate review or release acceptance is claimed. Production Secure behavior is tested at the HTTP header level.

The existing four high-severity Prisma-tooling advisories remain documented in the Issue 2: Foundation section of `verification-log.md`; dependencies were not force-upgraded across a Prisma major version. Rate limiting remains later hardening in the existing API contract.

The temporary local database setup is for verification. Restart its cluster if needed with `pg_ctl -D /tmp/cpe334-auth-pg -l /tmp/cpe334-auth-pg.log -o '-h 127.0.0.1 -p 55432 -k /tmp' start`, then use the six test/build commands above. Normal project setup continues to follow README; `/tmp` data is disposable.

## Issue 4: Authorization

Test counts and execution outcomes below are from the earlier run. Tests were not rerun during this documentation-only cleanup.

Verified 6 November 2026, Asia/Bangkok. Base commit `1d35a0ffe8729b1f4f5e1e9997d417391dc5eeb6`; Results apply to the working tree on top of base commit 1d35a0f. Replace with the PR commit SHA after commit. Read the existing four Sprint 1 engineering contracts and inspected completed F-01/session, seed, Prisma, API error and React identity implementations before writing changes.

### RED → GREEN → REFACTOR

Before changing production code, added assertions against real Express routes using actual login cookies and the existing disposable PostgreSQL database on port 55432. Command:

```sh
npm --prefix server run test:api -- -t 'TEST-01[0-3]|operator cannot|sessions fail closed'
```

RED: **5 failed, 1 passed, 14 filtered/skipped**. TEST-010 and TEST-011 expected the queue listing's 200 but received 404. TEST-012, TEST-013 and operator-to-customer rejection expected 403 but received 404. Missing/expired/revoked session protection already passed. These were actual assertion failures after successful PostgreSQL migrations/setup, not import failures or deliberately broken expectations. [Raw RED](../artifacts/evidence/issue04/api-red.txt).

Frontend RED command `npm --prefix client run test:ui -- tests/ui/permissions.test.tsx`: **2 failed, 8 passed**. The script includes the entire UI directory. Operator `/my-queue` did not show Access denied; anonymous `/board/test-queue` redirected to login instead of showing the public shell. Existing customer-to-operator protection passed.

GREEN: the identical backend selection passed **6 tests**, with 14 intentionally filtered/skipped. (raw output not retained; counts recorded above). All UI tests passed **10 tests** after route policy changes. Extracted existing session middleware rather than creating a second session mechanism; authentication regression tests were maintained.

REFACTOR: consolidated repeated role assertions into `roleUser`, retaining fail-closed behavior when a guard is composed without a principal or with the wrong role. Added focused test-only routes to exercise positive assignment/ownership paths and a downstream real DB counter mutation. Full post-refactor API suite: **24 passed, 0 failed, 0 skipped**, six files. (raw output not retained; counts recorded above).

### Commands and actual results

| Command | Actual result |
| --- | --- |
| `npm --prefix client ci` | Passed; restored the already-declared Node types missing from the local install |
| `npm --prefix server run build` | Passed |
| `npm --prefix client run build` | Passed after `ci`; initial attempt failed on missing local `@types/node` from existing E2E tests |
| `npm --prefix server run test:unit` | 1 passed |
| `npm --prefix server run test:api` | 24 passed after refactor; existing migration had no pending changes |
| `npm --prefix client run test:ui` | 10 passed |
| `npm --prefix client run test:e2e` | 4 passed: foundation, both real role login/reload/logout paths plus forbidden direct URL/API checks, anonymous public display shell |
| `git diff --check` | Passed |

### Behavior and evidence boundaries

- TEST-010: assigned Operator A receives only R's safe listing fields; fixture confirms assigned queue guard access. Full desk response remains deferred.
- TEST-011: Operator B receives an empty listing and 403 for R desk/call/start/complete; forged operatorId cannot grant access.
- TEST-012: Customer A receives 403 on operator listing and call/start/complete; operator customer discovery/join/private-entry requests are also rejected.
- TEST-013: forged roles and customer/operator identities in headers/body cannot override the authenticated user.
- Existing TEST-001–009, TEST-014, TEST-050 and TEST-051 execute in the full API suite. TEST-001 also executes through real browser login for both roles.
- Additional fixtures verify owner success, identical nonleaking foreign/missing/invalid entry 404s, entry-to-queue assignment resolution, live assignment removal, changed persisted role and disabled users with existing sessions. The guard fixture returns 204 only in the test harness; it is never registered in the production app.
- Failure cases compare persisted queues, entries, events and assignments before/after denied requests. The test-only mutation fixture proves that a successful assigned request increments a real PostgreSQL counter and denied requests leave it unchanged. Only fixture-created sessions/entries are removed; temporarily changed test records are restored.
- Production session checks, safe error envelopes, cache policy, CSRF Origin and JSON protections remain in use. No schema, seed accounts, passwords or role enum changed.

### Dependencies and incomplete acceptance coverage

- Deferred to Issue 8 for TEST-010, TEST-011, TEST-012 and TEST-013: desk response, call-next/start/complete handlers, and no-mutation checks on real service transitions.

Discovery/join, desk/service actions and private entry response endpoints are not implemented in this issue. Permitted requests fall through to a truthful 404 rather than fake production success. Reusable guards cover the reserved paths now. Full TEST-010 desk response and TEST-011/012/013 downstream workflow integration need regression when those handlers arrive. TEST-026's complete customer-entry response coverage depends on Issue 6; the ownership fixture is not claimed as full TEST-026. TEST-015's entry/event HTTP persistence journey remains deferred. Public board data is also deferred; only its anonymous routing shell exists. No required implemented authorization test is blocked by database availability.

Future mutation services must revalidate authorization together with their transaction/concurrency policy to cover assignment removal racing a write. Existing dependency security findings from foundation verification were not changed by this issue.

### All changed files

Modified:

- `README.md`
- `server/src/app.ts`
- `server/src/auth/auth.ts`
- `client/src/App.tsx`
- `client/src/auth-api.ts`
- `client/tests/e2e/auth.spec.ts`

Added:

- `server/src/auth/session.ts`
- `server/src/authorization/guards.ts`
- `server/tests/api/authorization.test.ts`
- `server/tests/api/permission-guards.test.ts`
- `client/tests/ui/permissions.test.tsx`
- `docs/authorization-verification.md`
- `docs/evidence/issue04/api-red.txt`
- `docs/evidence/issue04/api-green.txt`
- `docs/evidence/issue04/api-refactor-green.txt`


## F-03/F-04 reimplementation after reset — 6 November 2026

Fresh work starts from `19572d952d059d4fa4b1112127cfc63977c8db73`. The earlier sections remain historical evidence for their respective scopes. Customer joining, private queue reads and anonymous board are now implemented and tested; their earlier deferrals above are superseded by [the new verification report](f03-f04-verification.md). Final current suites: 3 unit, 49 API, 19 UI and 6 browser tests pass, with zero failures/skips; both builds pass. Actual RED and GREEN outputs and changed files are linked in that report. No commit or push was made.
