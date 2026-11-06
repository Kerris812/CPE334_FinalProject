# F-03/F-04 verification after reset

Executed 6 November 2026, Asia/Bangkok, against base HEAD `19572d952d059d4fa4b1112127cfc63977c8db73`. All modifications remain uncommitted. No push, PR, tag, deployment or release acceptance was performed. The pre-existing untracked `client/.vite/` cache was left untouched; ignored credentials were not changed.

Read the four Sprint 1 contracts. Verified [GitHub #6, titled Issue05/ Customer Queue Joining and Number Generation](https://github.com/Kerris812/CPE334_FinalProject/issues/6) through the public GitHub API after the web fetch failed. Implemented F-03 and the explicitly requested F-04 contracts. The malformed path in the prompt follows the normative API path: `POST /api/v1/queues/:queueId/entries`.

## Fresh TDD evidence

The reset baseline already contained session/authorization modules and passed all 28 existing API tests: [baseline run](evidence/f03-f04/baseline-api.txt). No baseline repair and no historical F-03 evidence was reused.

Before feature implementation, wrote planned TEST-016–024, TEST-047/048, F-04 TEST-025–029/031, UI tests and TEST-030 browser coverage. Ran actual failures against the reset source. API failures are missing-handler 404s against the intended 200/201/409/422 behavior. The existing ownership/anonymous guards already passed two F-04 security cases. Unit tests entered their named bodies but failed to import the not-yet-created rules module; no rule assertions passed at that point. UI/browser failures reflect absent queue forms and board data. Assertions were not intentionally broken.

| RED command | Pass | Fail | Skip | Exit | Actual output |
| --- | ---: | ---: | ---: | ---: | --- |
| `npm --prefix server run test:unit` | 1 | 2 | 0 | 1 | [unit RED](evidence/f03-f04/red-unit.txt) |
| `npm --prefix server run test:api -- --reporter=verbose` | 30 | 18 | 0 | 1 | [API RED](evidence/f03-f04/red-api.txt) |
| `npm --prefix client run test:ui` | 10 | 9 | 0 | 1 | [UI RED](evidence/f03-f04/red-ui.txt) |
| `E2E_API_PORT=3100 E2E_WEB_PORT=5273 npm --prefix client run test:e2e -- tests/e2e/queue-journey.spec.ts` | 0 | 2 | 0 | 1 | [browser RED](evidence/f03-f04/red-e2e.txt) |
| `npm --prefix server run test:api -- -t 'transaction revalidates'` | 0 | 1 | 48 filtered | 1 | [transaction authorization RED](evidence/f03-f04/red-transaction-authorization.txt) |

The transaction-level permission test was added during final contract review, captured resolving incorrectly for an operator before its fix, and then passed after role/activity were rechecked under the customer-row lock. Its filtered skips are selection effects; the final whole-suite run has zero skips.

The finalized browser RED source includes the slow-response case before UI implementation. The final status assertion was subsequently made exact because `CALLED` also matched the helper text “Currently called number”; expected behavior was preserved. [First browser GREEN attempt](evidence/f03-f04/browser-first-green-attempt.txt) records 5 passed / 1 failed for that ambiguous selector. An intermediate API attempt overlapped browser fixtures and recorded 47 passed / 1 failed on the existing exact seed-count assertion; API and browser runs were then serialized against their shared test DB. These intermediate failures are not used as behavioral RED evidence.

## Final results and refactoring

| Command | Pass | Fail | Skip | Exit | Output |
| --- | ---: | ---: | ---: | ---: | --- |
| `npm --prefix server run test:unit` | 3 | 0 | 0 | 0 | [unit GREEN](evidence/f03-f04/green-unit.txt) |
| `npm --prefix server run test:api -- --reporter=verbose` | 49 | 0 | 0 | 0 | [API GREEN](evidence/f03-f04/green-api.txt) |
| `npm --prefix client run test:ui` | 19 | 0 | 0 | 0 | [UI GREEN](evidence/f03-f04/green-ui.txt) |
| `E2E_API_PORT=3100 E2E_WEB_PORT=5273 npm --prefix client run test:e2e` | 6 | 0 | 0 | 0 | [browser GREEN](evidence/f03-f04/green-e2e.txt) |

**Total: 77 passed, 0 failed, 0 skipped.** Counts include existing regression coverage. Both builds pass: `npm --prefix server run build` ([output](evidence/f03-f04/build-server.txt)) and `npm --prefix client run build` ([output](evidence/f03-f04/build-client.txt)). `git diff --check` passes.

Refactored duplicate frontend fetch/header/envelope/error handling into `api-client.ts`, retaining AuthError's existing interface and messages. Queue number display and visible-only polling are shared between customer/public views. Backend routes, validation/formatting and transactional/read services are separated; private DTO mapping is shared by latest/detail reads. Tests/builds passed after refactoring. Login test setup now supplies valid queue/entry-read fixtures after login; original login assertions remain. No planned IDs were renumbered or expectations weakened.

## Contract coverage

| Test | Actual verification |
| --- | --- |
| TEST-016 | CUSTOMER-only OPEN queue discovery; safe queue DTO; seeded R join returns 201 and next formatted number; derived customer, WAITING row, one JOINED event and one increment. |
| TEST-017 | Party sizes 1 and 8 accepted. |
| TEST-018 | 0, 9, negative, decimal, string, null, missing and null/array bodies yield 422 with no counter/entry/event changes. |
| TEST-019 | WAITING/CALLED/SERVING block same-queue and cross-queue duplicates; COMPLETED allows a new entry. |
| TEST-020 | 20 simultaneous same-customer HTTP requests: exactly one 201 and nineteen duplicate 409s; one entry, event and increment. |
| TEST-021 | 20 simultaneous different customers: twenty 201s, unique numbers, exact gap-free sequences 1–20 and twenty events. |
| TEST-022 | PAUSED/CLOSED fixtures reject joining with 409 and no writes; unavailable queues excluded from discovery. |
| TEST-023 | Forged customer/user/role/time body fields rejected with 422; header/query identity cannot override session customer. |
| TEST-024 | Counter fixture 9999 creates 10000; stop actual API process, reseed, start second process; retrieve the same entry through HTTP, retain unchanged entry/event rows, then allocate 10001. |
| TEST-025 | Latest returns null or exact owned DTO; detail/latest agree and retain COMPLETED data. |
| TEST-026 | Foreign, missing and malformed private IDs share identical safe 404s, despite forged identity. |
| TEST-027 | Anonymous and wrong-role private latest/detail requests rejected. |
| TEST-028 | Anonymous board returns exactly four fields with correct called number and WAITING-only count. |
| TEST-029 | Board reads CALLED/SERVING fixtures and clears the slot after a COMPLETED fixture; no operator transition endpoint added. |
| TEST-030 | Real mobile UI/API/DB: slow loading, empty state, connection error/retry, invalid party size, keyboard submit, join, reload, audit record and no horizontal overflow. |
| TEST-031 | Nested private account/entry/event fixture data never appears in board JSON. |
| TEST-047 | R-0001, R-0009, R-9999 and R-10000 formatting. |
| TEST-048 | Strict integer validation, including invalid types, NaN and Infinity. |

Supplemental API tests cover role/origin/missing-queue denials, same-customer simultaneous cross-queue requests, collision-to-NUMBER_CONFLICT rollback, real PostgreSQL audit-insert failure rollback, malformed/unknown public queue IDs, and transaction-level persisted role/activity validation. Nine new component tests cover validation, pending/double-submit behavior, conflicts, retry/empty/missing states, completed rejoining, public privacy, identity expiry, and visible-only polling/cleanup. A second browser journey validates anonymous board rendering. Actual screenshots: [my queue](evidence/f03-f04/my-queue-mobile.png), [public board](evidence/f03-f04/public-board-mobile.png); both were visually inspected.

## Database constraints and persistence

Reused `0001_foundation` and Prisma schema unchanged; no migration or dependency installation required:

- Unique queue code, unique `(queue_id, sequence)` and globally unique display number.
- Partial unique customer index across WAITING/CALLED/SERVING in every queue.
- Existing single CALLED/SERVING slot per queue preserved.
- Party-size 1–8, positive sequence, nonnegative counter checks and all foreign keys retained.

Join transactions use parameterized PostgreSQL row locks in consistent customer-then-queue order. The customer role/activity is rechecked under its lock; OPEN state and duplicate participation are checked before allocating a number. Counter update, entry creation and JOINED insertion commit together. Unique violations map to safe duplicate/number conflict 409 responses; any failure rolls back the entire transaction. Real database failure injection proves that an audit failure consumes no number or entry. The test trigger rejects only its generated fixture actor and is removed afterward. Numeric API sequences are guarded against exceeding JavaScript's safe integer range rather than silently rounded; formatting grows beyond 9999.

Private entry queries include the authenticated customer ID. Only prescribed private DTO fields are returned. Public board slot/count reads share a RepeatableRead database snapshot and construct an explicit four-field DTO; no ORM entity, private ID or related record is serialized. Existing session, role, Origin/JSON guards, safe error envelopes and no-store headers remain in effect.

## Changed files

- `server/src/app.ts`: mounts customer/public routers after existing guards; replaces reserved private read path with real owned queries.
- `server/src/queues/routes.ts`, `rules.ts`, `service.ts`: queue discovery/join, validation/formatting, transactional writes, owned detail/latest reads and public board snapshot.
- `server/tests/support/queue-fixture.ts`: isolated PostgreSQL fixtures and cleanup.
- `server/tests/api/queue-join.test.ts`, `queue-views.test.ts`: planned and supplemental integration tests.
- `server/tests/unit/queue-rules.test.ts`: TEST-047/048.
- `client/src/CustomerQueues.tsx`: discovery, join, my-queue, validation, submission/conflict/recovery states.
- `client/src/PublicQueueBoard.tsx`, `QueueNumberDisplay.tsx`, `useQueueResource.ts`: public view, shared number/status display and visible-only polling.
- `client/src/api-client.ts`, `queue-api.ts`, `auth-api.ts`: common HTTP handling and typed auth/queue requests.
- `client/src/App.tsx`, `style.css`: route integration, restaurant palette, status colors and responsive layout.
- `client/tests/ui/queues.test.tsx`, `login.test.tsx`: new UI tests and post-login data fixture adaptation.
- `client/tests/e2e/queue-journey.spec.ts`: real browser journeys and screenshots.
- `client/playwright.config.ts`, `vite.config.ts`: optional isolated test ports/proxy target; defaults preserved.
- `README.md`, `docs/sprint-1/tests.md`, `docs/verification-log.md`, this report and `docs/evidence/f03-f04/*`: usage and actual evidence.

## Environment, blockers and boundaries

Node 24.14.0, PostgreSQL 17.11 and Playwright Chromium on macOS arm64. API/browser integration uses the existing disposable `_test` database selected by the established URL guard. No mock persistence, production database reset or truncation is used. Fixtures remove only their own users, sessions, queues, entries/events and temporary failure trigger. TEST-016 restores its temporary seeded-R counter change after removing its fixture entry; normal application startup/seeding/operation never resets counters. Other sequence/state fixtures use disposable queues. Run API and browser suites sequentially; API restart listeners require ports 3001/3302 free. Browser ports 3100/5273 avoid interrupting existing development servers.

No known requested F-03/F-04 implementation blocker remains. Cancellation, no-show and operator service workflows are unimplemented. Status changes used for read-view tests are database fixtures, not new transition APIs. Full TEST-043 customer/operator lifecycle, deployment and teammate/release acceptance are outside this scope. No RED/GREEN commit SHA exists because committing was explicitly prohibited; the saved outputs are genuine runs of the working tree based on the HEAD above.
