# F-01 authentication verification — 6 November 2026

Implemented the scope of [GitHub issue #4, titled Issue03](https://github.com/Kerris812/CPE334_FinalProject/issues/4), after reading all four `docs/sprint-1` engineering contracts. Verified the public issue body through GitHub's API. Existing Prisma schema, migration, Argon2id seed, Express conventions, Vitest/Supertest, Testing Library and Playwright were reused. No migration was necessary.

Local verification: macOS arm64; Node 24.14.0; PostgreSQL 17.11; Chromium through Playwright. A new disposable PostgreSQL cluster was initialized under `/tmp/cpe334-auth-pg`, bound to `127.0.0.1:55432`, with different `cpe334_auth_dev` and `cpe334_auth_test` databases. Ignored `server/.env` contains generated synthetic seed passwords. Real PostgreSQL was used for integration and browser journeys; only the supplemental repository-failure test injects a failing repository. Build output, local credentials, browser caches and test-result artifacts are ignored.

Base HEAD: `29b3034be9f93d270ddb931fa5244c93bbaebbbc`. All changes and tests are in the uncommitted working tree. No commit, push, PR, merge, tag or deployment was made. Consequently there are no RED/GREEN commit SHAs; the evidence below records actual local executions, not a released build.

## RED → GREEN → REFACTOR

Tests were written before implementing the auth endpoints and login UI. The initial real-database API run returned 404 from the existing foundation app, and the UI tests failed because the login form did not exist. TEST-008 failed at the missing Set-Cookie access, and TEST-006 could not find the not-yet-created session; these are missing-behavior failures, not intentionally broken assertions. The browser RED run with installed Chromium timed out looking for the absent Email input. An earlier browser attempt could not launch Chromium and is excluded from behavioral RED evidence and counts.

| Phase / command | Pass | Fail | Skip | Exit | Actual output |
| --- | ---: | ---: | ---: | ---: | --- |
| RED: `npm --prefix server run test:api` | 4 | 9 | 0 | 1 | [API RED](evidence/f01/red-api.txt) |
| RED: `npm --prefix client run test:ui` | 1 | 6 | 0 | 1 | [UI RED](evidence/f01/red-ui.txt) |
| RED: `npm --prefix client run test:e2e -- tests/e2e/auth.spec.ts` | 0 | 2 | 0 | 1 | [Browser RED](evidence/f01/red-e2e.txt) |
| Final: `npm --prefix server run test:unit` | 1 | 0 | 0 | 0 | [Unit GREEN](evidence/f01/green-unit.txt) |
| Final: `npm --prefix server run test:api -- --reporter=verbose` | 14 | 0 | 0 | 0 | [API GREEN](evidence/f01/green-api.txt) |
| Final: `npm --prefix client run test:ui` | 7 | 0 | 0 | 0 | [UI GREEN](evidence/f01/green-ui.txt) |
| Final: `npm --prefix client run test:e2e` | 3 | 0 | 0 | 0 | [Browser GREEN](evidence/f01/green-e2e.txt) |

Final total: **25 passed, 0 failed, 0 skipped**. Tests include existing foundation coverage. Initial RED coverage had nine API authentication/security cases; TEST-051 was added subsequently for repository failure handling. TEST-007's request fixture was refined to explicitly send JSON and an allowed Origin so malformed field cases reach semantic validation. Its ID and intended assertions were retained. No test expectations were weakened.

Both `npm --prefix server run build` and `npm --prefix client run build` passed: [server output](evidence/f01/build-server.txt), [client output](evidence/f01/build-client.txt). The first client build identified missing Node types in the browser fixture; adding `@types/node` and updating the lockfile resolved it. `git diff --check` passed.

Refactoring centralizes safe API errors, identity DTO construction, cookie options, session and mutation guards, frontend auth requests and unauthenticated-error detection. UI tests, browser tests and builds were rerun after the final frontend helper refactor; API regression was rerun with named test output.

## Stable test coverage

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

## Changed files

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

## Scope and remaining work

No incomplete requested F-01 behavior is known from these checks. Queue joining, queue discovery and operator service transitions are intentionally unimplemented. Authenticated `/queues` and `/operator/desk` are landing pages with identity/logout; private queue API namespaces enforce authentication but return 404 for authenticated operations until their feature is implemented. No full queue journey, deployed HTTPS environment, teammate review or release acceptance is claimed. Production Secure behavior is tested at the HTTP header level.

The existing four high-severity Prisma-tooling advisories remain documented in `foundation-verification.md`; dependencies were not force-upgraded across a Prisma major version. Rate limiting remains later hardening in the existing API contract.

The temporary local database setup is for verification. Restart its cluster if needed with `pg_ctl -D /tmp/cpe334-auth-pg -l /tmp/cpe334-auth-pg.log -o '-h 127.0.0.1 -p 55432 -k /tmp' start`, then use the six test/build commands above. Normal project setup continues to follow README; `/tmp` data is disposable.
