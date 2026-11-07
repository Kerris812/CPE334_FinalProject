# Sprint 1 integration and release verification

## Tested revision and scope

Executed locally on 7 November 2026 using Node 24.14.0 and PostgreSQL 17.11 (Homebrew, macOS ARM64). Base commit: `4055a963b345dc1182b90ee8ab93e74145dbcaa1`, branch `feature/9-sprint1-verification`, **including uncommitted changes**. This SHA alone does not contain this task's changes. [Tested tree manifest](../../artifacts/evidence/sprint1/tested-tree.json) records source hashes. No commit, push, merge, tag or GitHub release was performed.

Read specification.md, api-spec.md, tests.md and ui-spec.md before implementation. Preserve their approved Issue08 revision: R parties 1–4 / Operator A; S parties 5–8 / Operator B, independent FIFO/service slots, one active entry per customer across both. No additional lifecycle, administration or notification features were added.

## Inspection and changes

The initial working tree was clean. Baseline runs passed 10 unit, 79 API, 53 UI and 17 E2E cases ([baseline logs](../../artifacts/evidence/sprint1/)). Inspection found no named TEST-015 and an incomplete single release-journey scenario, stale documentation claiming operator functionality was absent, and two tracked Vite cache files.

Added TEST-015 with real HTTP join/call/start/complete, two API child processes and two intervening non-destructive seeds. Added the complete TEST-043 release journey with five isolated browser identities and real persisted assertions. Both new tests passed existing application behavior before presentation changes. There is **no newly reproduced product failure or fabricated RED output** in this integration task. Historical TDD evidence is not replaced by a synthetic failing test.

Presentation now follows the supplied examples: cutlery login mark, rounded white forms/cards, full-width burgundy primary actions, operator summary/service-action panels, burgundy public board and gold status accents. Existing route behavior, role gates, requests, enabled-action rules and polling remain intact. Shared CSS tokens and shared QueueNumberDisplay carry the appearance; backend architecture, API handlers, transaction implementation, schema and migrations were not rewritten.

Removed two generated tracked `client/.vite/deps` files and ignored Vite/TypeScript caches. Refreshed README, contract execution status, traceability and draft release notes. Restored historical evidence screenshots after older tests regenerated them; new screenshots are separate Sprint1 evidence.

## Modified files

| Files | Change |
| --- | --- |
| `server/tests/api/release-persistence.test.ts` | New TEST-015 full-lifecycle process restart and reseed regression. |
| `client/tests/e2e/sprint1-journey.spec.ts` | Complete TEST-043 five-context release journey, privacy/denial evidence and screenshots. |
| `client/src/App.tsx`, `CustomerQueues.tsx`, `OperatorDesk.tsx`, `QueueNumberDisplay.tsx`, `style.css` | Reference presentation, headings and shared styling; workflow preserved. |
| `.gitignore`; removed `client/.vite/deps/_metadata.json` and `package.json` | Exclude generated caches and remove tracked generated content. |
| `scripts/sprint1-coverage.mjs` | Validate actual runner results and generate AC/TEST traceability. |
| `README.md` | Current R/S setup, credentials, migration/seed/start/test/build instructions and limits. |
| `docs/sprint-1/specification.md`, `api-spec.md`, `tests.md`, `ui-spec.md` | Current local verification status; normative contracts retained. |
| `docs/sprint-1/acceptance-coverage.md`, `release-verification.md`; `docs/releases/v0.1.0.md` | Traceability, verification and draft release notes. |
| `artifacts/evidence/sprint1/*` | Actual logs, sanitized JSON, provenance and genuine screenshots. |

## Executed commands and actual results

Full command arguments and exit codes: [commands.json](../../artifacts/evidence/sprint1/commands.json). All final tests ran after the presentation changes.

| Command | Passed | Failed | Skipped | Actual output |
| --- | ---: | ---: | ---: | --- |
| `npm --prefix server run test:unit -- --reporter=verbose` | 10 | 0 | 0 | [unit.txt](../../artifacts/evidence/sprint1/unit.txt) |
| `npm --prefix server run test:api -- --reporter=verbose` | 80 | 0 | 0 | [api.txt](../../artifacts/evidence/sprint1/api.txt) |
| `npm --prefix client run test:ui -- --reporter=verbose` | 53 | 0 | 0 | [ui.txt](../../artifacts/evidence/sprint1/ui.txt) |
| `npm --prefix client run test:e2e` | 18 | 0 | 0 | [e2e.txt](../../artifacts/evidence/sprint1/e2e.txt) |
| `npm --prefix server run build` | Build/TypeScript pass | — | — | [server-build.txt](../../artifacts/evidence/sprint1/server-build.txt) |
| `npm --prefix client run build` | Build/TypeScript pass | — | — | [client-build.txt](../../artifacts/evidence/sprint1/client-build.txt) |
| **Total test cases** | **161** | **0** | **0** | All four suites completed |

Database-dependent commands were actually prefixed with `node .local/run-verification.mjs test`. That ignored local launcher loaded the existing ignored server environment, then substituted **two newly created isolated database URLs** and `E2E_API_PORT=3100`, `E2E_WEB_PORT=5273`. No credentials are recorded. API tests use the disposable `_test` URL; test and development database names differ. API and browser suites ran sequentially. Use the public [README test instructions](../../README.md#tests) to reproduce without this local launcher.

`node scripts/sprint1-coverage.mjs` verified **44/44 AC identifiers and 49/49 required TEST identifiers** from successful runner cases, including dynamically named TEST-035/036. It rejects incomplete runs, failures, skipped tests, missing IDs and mismatched case counts. [Coverage table](acceptance-coverage.md) and [executed titles](../../artifacts/evidence/sprint1/coverage.json) provide mappings. This is acceptance traceability, not measured branch/line coverage. Repository inspection found no skip/only/todo/fixme test declarations.

## Integration evidence

- Authentication: customer and operator logins; wrong/unknown/inactive accounts share generic errors; malformed credentials, eight-hour boundary expiry, logout replay, current user, cookie flags, opaque token hashes and credential-free JSON/logs. Origin/JSON protection and safe failure envelopes also pass.
- Authorization: customers cannot use operator routes, operators cannot use customer routes, forged roles/IDs cannot grant access, disabled users and changed assignments fail closed, cross-customer reads return indistinguishable 404s. Operator B is forbidden from R and authorized for S; a separately unassigned operator has no access.
- Joining: both approved ranges/boundaries, invalid types/sizes and queue mismatches, paused/closed queues, duplicate statuses and completed rejoin, 20 same-customer and 20 different-customer concurrent submissions, cross-queue race, collision rollback, failed audit rollback, persistence and formatting beyond 9999.
- Customer status: own latest/detail/history, ownership, anonymous denial, lifecycle refresh/reload, loading/empty/retry, revoked session handling and 360px number rendering.
- Public: anonymous R/S boards, exact recursive allowlist, called/serving/null states, WAITING-only aggregate, safe unknown queue 404, hidden-tab polling pause, retry and responsive rendering.
- Operator: independent assignment-scoped desks, FIFO by immutable sequence, empty/non-OPEN queues, occupied slot, valid/invalid/terminal transitions, concurrent calls/start/complete, exactly one audit per success, transactional rollback. Holding R's row lock does not block S.

### Complete release journey

`client/tests/e2e/sprint1-journey.spec.ts` requires a clean seeded fixture rather than resetting unknown data. Separate Customer A, Operator A, anonymous board, Customer B and Operator B contexts exercise all 16 requested steps. The UI produces **R-0001**, the duplicate request returns 409, Customer A observes CALLED → SERVING → COMPLETED and reloads the completed entry. B receives 404 for A's private entry. Operator B sees S and receives 403 for R desk/call/start/complete. Assertions verify denials leave the completed entry and four correctly attributed events unchanged.

[Sanitized actual HTTP and audit evidence](../../artifacts/evidence/sprint1/journey-http-evidence.json) records actual status codes and event timestamps, without passwords, cookies, token hashes or private IDs. Test cleanup removes only its own synthetic records **after** persistence assertions; production retains history.

### Public field allowlist

Successful board responses are exactly:

```json
{"data":{"queueCode":"R","calledNumber":null,"serviceState":null,"waitingCount":0}}
```

The example above is also the actual completed-slot response recorded by the journey. The recursive path set is exactly `data`, `data.queueCode`, `data.calledNumber`, `data.serviceState`, `data.waitingCount`. Dedicated DTO tests reject extra or nested properties and recursively check private fixtures. Anonymous cookies contain no session and the page has no logout/login controls. The public JSON excludes customer names/emails/IDs, party sizes, entry IDs, timestamps and related Prisma objects.

### Genuine screenshots and responsive verification

Screenshots were produced by the running Chromium/API/PostgreSQL journey; no image generation or compositing was used. Visually reviewed the login, join, operator desk and public board screenshots.

| Evidence | Viewport / state |
| --- | --- |
| [Login](../../artifacts/evidence/sprint1/login-mobile.png) | 360px, before credentials are entered |
| [Joining](../../artifacts/evidence/sprint1/join-mobile.png) | 360px, party size 4 |
| [Operator desk](../../artifacts/evidence/sprint1/operator-called-desktop.png) | 1440px, CALLED |
| [Operator mobile](../../artifacts/evidence/sprint1/operator-serving-mobile.png) | 360px, SERVING |
| [Public desktop](../../artifacts/evidence/sprint1/public-serving-desktop.png) | 1440px, SERVING |
| [Public mobile](../../artifacts/evidence/sprint1/public-serving-mobile.png) | 360px, SERVING |
| [Customer completed](../../artifacts/evidence/sprint1/customer-completed-mobile.png) | 360px, COMPLETED after reload |

Operator/public interfaces were asserted free of horizontal overflow at 360, 768 and 1440px; visible buttons were asserted at least 44px in both dimensions. Existing customer mobile and keyboard tests also pass. Chromium local evidence does not establish Safari/Firefox or physical display testing.

## Database and fresh setup

Created two new databases using the existing local PostgreSQL login; original configured databases were not used for fixture writes. Ran:

```sh
node .local/run-verification.mjs dev npm --prefix server run db:migrate
node .local/run-verification.mjs dev npm --prefix server run db:seed
node .local/run-verification.mjs dev npm --prefix server run db:seed
```

[Migration output](../../artifacts/evidence/sprint1/fresh-migrate.txt), [seed output](../../artifacts/evidence/sprint1/fresh-seed.txt), and [sanitized fresh snapshot](../../artifacts/evidence/sprint1/fresh-environment.json) show two migrations, four users, two OPEN queues at counter zero, two assignments and no entries/events. The exact README test-database preparation snippet also executed successfully: [output](../../artifacts/evidence/sprint1/readme-test-db-preparation.txt). The compiled API started on isolated port 3101 and returned the expected HTTP 200 health envelope: [startup output](../../artifacts/evidence/sprint1/compiled-startup.txt). This verifies a fresh **database**, not an entire freshly installed operating system.

TEST-015 proves committed COMPLETED entry, four events, original timestamps, queue counter and session remain readable across an actual API process stop/start and repeated seeds. Existing TEST-024 additionally proves the next allocation across restart and numbers above 9999. No in-memory substitute was used for database integration.

Existing constraints preserved: unique `(queue_id, sequence)` and display number; one active customer across all queues; one CALLED/SERVING slot per queue; positive sequence, nonnegative counter and party range checks; restrictive foreign keys; immutable queue/sequence/display-number trigger. Customer-row and queue-row transaction locks allocate numbers and prevent races. Entry creation/transition and audit insertion commit together; rejection and failed audit leave counters, entries and events unchanged.

## Security, blockers and release limitations

[Repository hygiene audit](../../artifacts/evidence/sprint1/repository-hygiene.json) verifies environment files/local credential configuration and generated outputs are ignored, no known local secret values appear in inspected deliverables, and no disabled/exclusive tests were introduced. Curated evidence is intentionally versionable. This is a local value scan, not a comprehensive Git-history secret audit.

Actual dependency audit commands:

```sh
npm --prefix server audit --omit=dev --json
npm --prefix client audit --json
```

Server audit exits nonzero with **4 high / 0 critical** affected packages (`prisma`, `@prisma/config`, `effect`, `deepmerge-ts`); client audit exits zero with **0 findings**. See [server report](../../artifacts/evidence/sprint1/dependency-audit-server.json) and [client report](../../artifacts/evidence/sprint1/dependency-audit-client.json). The report proposes a Prisma major upgrade. No unsupported claim of exploitability or harmlessness is made; dependency remediation/security review remains an unresolved release risk. No forced major upgrade was performed during integration verification.

Functional regression is green; publication remains pending dependency review, teammate review and whatever branch integration/release checks the team requires. No GitHub approvals, deployment, tag, release or main/staging merge was performed or fabricated. Tests cover Chromium; other browsers, hosting, HTTPS termination and production operations remain unverified. Do not interpret local acceptance coverage as completion of these external release gates.

## Follow-up: compact public board presentation

After the initial integration run above, the user requested smaller public boards and fonts, solid buttons, and color only in card headers. `PublicQueueBoard.tsx` now separates burgundy headers from white content. Scoped CSS reduces the public number to 32–48px, neutralizes the status badge, reduces card spacing and uses solid burgundy navigation, Back and refresh controls. API, polling and privacy behavior remain unchanged. The prior 96px minimum assertion was replaced to reflect this explicit presentation request, retaining number visibility, overflow, privacy and polling assertions.

Executed `npm --prefix client run test:ui` (53 passed, zero failed/skipped), `npm --prefix client run build` (TypeScript/Vite passed), and `node .local/run-verification.mjs test npm --prefix client run test:e2e -- tests/e2e/public-board.spec.ts tests/e2e/board-navigation.spec.ts` (7 passed, zero failed/skipped). These are targeted follow-up checks, not a new full backend regression run. [Logs and current screenshots](../../artifacts/evidence/public-board-compact/) cover single-board and overview layouts on mobile/desktop. The earlier Sprint1 screenshots and source-hash manifest remain historical records of the initial integration verification.

## Follow-up: restrained public-board visual design

The subsequent public-board-only visual revision supersedes the earlier compact presentation. See the [current UI specification and contrast table](ui-spec.md#public-board-visual-refinement--7-november-2026) and [new evidence folder](../../artifacts/evidence/public-board-refinement/). It uses cream/white surfaces, a serif wordmark, sparse burgundy and gold, confirmed active queue tabs, quiet navigation, large real numbers, medium empty copy, emphasized waiting counts and friendly retry states. Backend source, schema, auth services, shared polling and customer/operator workflow logic were not changed.

Executed frontend checks: **55 React UI cases and 19 Playwright cases passed, zero failed/skipped**, plus the TypeScript/Vite build. The complete browser suite includes real PostgreSQL authentication, customer/operator lifecycle and recursive public privacy regressions. Layout, tap targets, equal-height desktop cards, empty/error states, active navigation and reduced motion were checked at 1440/1024/768/360px. See [exact commands, scope and source hashes](../../artifacts/evidence/public-board-refinement/verification.json). Backend unit/API suites were not rerun for this UI-only revision.

Initial Sprint1 runner logs and the initial source-hash manifest describe their earlier run. Existing journey screenshot paths under `artifacts/evidence/sprint1` are refreshed by subsequent E2E runs; the new evidence folder captures the current public appearance. No screenshots or passing results were synthesized.

## Follow-up: customer My queue presentation

The CUSTOMER `/my-queue` screen now uses the compact AppHeader, 560px maximum column, palette-based number/status panel and definition-list details specified in [Customer status visual refinement](ui-spec.md#customer-status-visual-refinement--7-november-2026). The shared display adds an atomic polite region, decorative status dot and a scoped 150ms status fade; other page styles and queue behavior are preserved. Bangkok Joined formatting uses the existing `joinedAt`; Updated is local receipt time. No API, schema, session, ownership, shared polling service or lifecycle logic changed.

Actual results: **56 React UI and 20 complete Playwright cases passed, zero failed/skipped**; the TypeScript/Vite build passed. The full browser suite uses isolated real PostgreSQL and includes ownership, session revocation, customer/operator service workflow and public privacy regressions. New UI assertions cover all four badge palettes, R-10000 without clipping, 360/768/1440px widths, 44px controls, non-clipped header, single page H1, reduced motion, keyboard focus and loading/empty/error states. Backend unit/API suites were not rerun for this UI-only revision.

[Commands, hashes, logs and genuine screenshots](../../artifacts/evidence/customer-status-refinement/) include the initial programmatic-focus probe (19 pass, 1 fail), the corrected real-keyboard focus test and the final successful full suite. Keyboard Tab/Shift+Tab verifies the 2px `:focus-visible` ring rather than relying on programmatic focus alone. No implementation rule or required behavior was weakened. Test screenshots complete finite animations for stable captures; motion behavior is independently asserted.
