# Issue #19 implementation and verification

29 November 2026 (Asia/Bangkok) · `feature/19-service-counter-management` · Local verification

[Approved design decision](issue-19-design-decision.md) · [Issue #19](https://github.com/Kerris812/CPE334_FinalProject/issues/19) · [API](api-spec.md) · [UI](ui-spec.md) · [STS](tests.md) · [Evidence](../../artifacts/evidence/issue19/)

## Objective, baseline and approved scope

Persistent dedicated service counters extend the existing restaurant queues without changing FIFO, party routing, customer ownership, shared operator authorization or actual-actor auditing. Counter R serves Queue R (party sizes 1–4); Counter S serves Queue S (5–8). Either assigned operator can call, start, complete or manually mark no-show at either counter. Each queue and each counter retains at most one combined CALLED/SERVING entry. R and S can be active independently.

The clean Phase 0 baseline was `af01e1d302b03940424b0e1d9bdcb48abd659135`, the PR #64 merge. The feature branch and local `sprint-2` resolved to that SHA. Read-only ancestry checks confirmed Issue #17 contracts (`fb6d7ec`) and Issue #18 verification (`43e63d1`). The user resolved the reported contract contradiction by explicitly selecting **design 2** and then authorized local commits and continuation through all phases, with **no push**.

The approved decision supersedes the original shared-C1/C2 proposal, same-queue parallel service and clearing terminal counter links. Precedence notices in the four Sprint 2 contract files point to that decision; original identifiers remain intact. The public additive projection still applies with zero or one active entry per queue. The unified dashboard and ETA remain #20, and its future implementation must follow this counter configuration. No extra queue, exclusive counter ownership, new role, dynamic administration, priority, analytics, notification, deployment or unrelated redesign was implemented.

## Database, migration and provisioning

`ServiceCounter` maps to `service_counters(id, code, name, queue_id)`. Code is unique, queue deletion is restrictive, and `(id,queue_id)` is a unique foreign-key target. `QueueEntry.counterId` maps to nullable `queue_entries.counter_id` with a composite FK to that counter and the entry's existing queue. No independent mutable occupancy flag exists.

`0003_service_counters` is a new transactional migration; `0001_foundation` and `0002_immutable_queue_sequence` are unchanged. A CHECK requires a valid association for CALLED/SERVING and no association for WAITING/CANCELLED. COMPLETED/NO_SHOW may retain history; legacy terminal rows may remain null. The new active-only unique counter index works alongside the retained `queue_entries_one_service_slot`. Existing active-customer uniqueness, queue/display-number uniqueness and the immutable-number trigger remain.

Before DDL/backfill, the migration rejects unsupported active queues and missing active lifecycle timestamps. It reuses existing R/S queues, creates their counters where those queues already exist, backfills active R→R and S→S, verifies coverage and installs constraints in one transaction. If the database starts without queues, ordinary seed provisions R/S and their counters afterward. The backfill changes only the new association column, preserving statuses, timestamps, users, sessions, assignments, audit events and sequence values.

The six real PostgreSQL migration/integrity cases cover valid populated migration, repeat seed, direct SQL constraints, independent enforcement of both capacity indexes, invalid called/serving timestamps, and an unsupported active legacy queue. The counter-index isolation case temporarily drops the queue index **inside an intentionally rolled-back transaction in its own disposable database**; the queue index is present afterward. Nothing is dropped from an operational database.

[Actual preservation JSON](../../artifacts/evidence/issue19/phase6/migration-preservation.json) records eight preserved users, one session, two queues, four assignments, six entries representing every status, and six events. Full pre/post row equality is asserted, apart from the added association. Queue sequences remain R=`42`, S=`87`. It also records actual counter IDs unchanged after two seed executions and the active backfill R/CALLED and S/SERVING.

Seed uses transactionally validated upserts: compatible records retain IDs, missing required counters are created, incompatible name/queue configurations abort without overwriting them, and all four A/R, A/S, B/R, B/S assignments remain. Existing account credentials/flags, sessions, queue state/sequences, entries and audit remain unchanged. [Repeated CLI seed output](../../artifacts/evidence/issue19/phase3/repeated-seed.txt) shows the same two counter IDs and four assignments twice; preservation is also asserted against operational entry/audit fixtures.

## Lifecycle, authorization and transaction integrity

Call retains the queue-first lock order. After session/role guards it locks the queue, rechecks the active operator and persisted assignment, holds that assignment FOR SHARE through commit, resolves/validates the counter, locks it, and checks both capacities and the fresh FIFO head. It persists counterId, CALLED/calledAt and exactly one actor-attributed event atomically. Explicit preview mismatch returns QUEUE_HEAD_CHANGED. Invalid or foreign selection returns the documented validation/access response without writes. Legacy `{}` and absent-body JSON calls resolve the dedicated queue counter.

Start validates and locks the stored counter and preserves it during CALLED→SERVING. Completion changes SERVING→COMPLETED; no-show changes CALLED→NO_SHOW only after the inclusive 300,000 ms threshold using server time sampled after locks. Both retain historical counterId while their new terminal status releases effective occupancy. Terminal entries cannot be reopened through these actions. Passage of time alone does not release anything.

Issue #18 cancellation remains WAITING-only: owners use their stored identity and operators supply the validated trimmed reason. Customer cancellation retains customer-then-queue locking. Cancelling another waiting entry does not change an active reservation. The original exact no-show boundary, reason/ownership checks, start/no-show and call/cancel races, rejoin behavior and rollback tests pass with valid counter fixtures. Its old null-counter no-show expectation was explicitly updated to the approved retained-history behavior.

No counter has an operator owner. Calls/entry actions always validate current queue assignments, derive entry queues from storage, and attribute events to the authenticated actor. Revoked assignments deny subsequent actions with the same session. A deterministic PostgreSQL barrier also verifies revocation after route authorization while a call waits for the queue lock. Sixteen A/B call/start/complete combinations across R/S remain covered by the existing Lab 7 provisioning suite.

Real queue/counter row locks, guarded source-status updates and PostgreSQL uniqueness prevent duplicate reservations/events. Counter R can be held by a test transaction while S calls successfully. Same-queue calls with/without previews have one winner selecting the lowest immutable sequence; concurrent starts/completions have one transition and one actual-actor event. Real process restarts preserve both reservations and occupied-call rejection.

Audit failure rolls back status, timestamps and reservations. Phase 6 found a specific error-mapping defect: an audit uniqueness failure was incorrectly reported as SERVICE_SLOT_BUSY. Two regression tests first demonstrated 409 instead of 500. The separate fix restricts busy-error mapping to QueueEntry errors; QueueEvent failures use safe INTERNAL_ERROR, retain state and permit a single successful retry after fault removal.

## API, UI and privacy

Existing route paths and success/error envelopes remain. Call accepts optional counterId plus optional expectedEntryId, rejects malformed/non-object/unknown properties, and preserves legacy body compatibility. Operator DTOs include counterId and Issue #18 timestamps. Terminal operator counterId is historical, not an occupancy flag.

The existing desk adds a zero/one `activeEntries` array and `counter` identity/queue/status/occupant from one repeatable-read snapshot. The operator UI displays the counter name/code, queue, AVAILABLE/OCCUPIED and active reservation; it submits the displayed counter/head, disables invalid calls and refreshes authoritative state after writes/conflicts/uncertain transport results. No mutation auto-replay was introduced. No-show confirmation identifies the counter being released. Existing selected-queue navigation and scalar-only legacy responses remain supported.

The public board preserves `queueCode,calledNumber,serviceState,waitingCount` and adds `activeEntries`, ordered by immutable sequence with zero or one row. Each row contains **exactly** `displayNumber,counterLabel,serviceState`. It excludes customer identities, private queue/entry/counter IDs, timestamps, actors and reasons. The browser explicitly projects those fields, renders the list, treats an explicit empty list as empty, and falls back to legacy scalars only when the array is absent. Customer DTOs expose no new counter/actor/reason fields. Existing legacy scalar value assertions remain alongside the exact revised root/nested public allowlist.

The final traceability review identified that this additive public list remained mandatory despite dedicated capacity. One API and two UI tests first failed on its absence; implementation and complete regressions followed in a separate feature commit. The approved decision was corrected accordingly. Earlier phase evidence describing the unchanged public board records intermediate states, superseded by this final implementation.

## Requirement and test traceability

All identifiers below are existing contracts interpreted through the approved design decision; no new requirement IDs were invented. Paths are relative to the repository root.

| Requirement/acceptance | Existing test contract | Executed sources |
| --- | --- | --- |
| FR-09–12/16; S2-F09-AC-01, shared operators and independent dedicated counters | S2-TEST-12/20/25 | `server/tests/api/issue19-counters.test.ts`, `issue19-concurrency.test.ts`, `lab7-provisioning.test.ts`; `client/tests/e2e/issue19-counters.spec.ts`, `lab7-shared-operators.spec.ts` |
| FR-09/16; S2-F09-AC-02, occupancy, preview, FIFO and capacity | S2-TEST-13/14/15/16 | `issue19-counters.test.ts`, `issue19-concurrency.test.ts`, existing `operator-workflow.test.ts`/`lab7-regression.test.ts`, `server/tests/database/issue19-migration.test.ts` |
| FR-11/16/24; S2-F09-AC-03, historical linkage, restart, migration and repeat seed | S2-TEST-17/18 | `issue19-counters.test.ts`, `issue19-concurrency.test.ts`, `issue19-provisioning.test.ts`, `issue19-migration.test.ts`, existing persistence suites |
| FR-09/16; S2-F09-AC-04, scope/eligibility/OPEN/legacy payloads | S2-TEST-19/20; scope extension S2-TEST-09 | `issue19-counters.test.ts`, `issue19-concurrency.test.ts`, existing permission/authorization/operator suites |
| FR-09/11/12/16, audit failure and safe retry | S2-TEST-27 | `issue19-counters.test.ts`, `issue19-audit-errors.test.ts`, existing `operator-workflow.test.ts` and L7-020 |
| FR-13/14; S2-F06/F07 acceptance, cancellation/manual no-show compatibility | S2-TEST-01–08/26 | Existing `issue18-cancellation.test.ts`, `issue18-no-show.test.ts`, `issue19-counters.test.ts`, `client/tests/e2e/issue18-termination.spec.ts` |
| FR-22; minimum counter UI and authoritative conflict refresh | S2-TEST-10/11/13/19 | `client/tests/ui/issue19-counters.test.tsx`, existing desk/termination UI suites, `client/tests/e2e/issue19-counters.spec.ts` |
| FR-08; exact anonymous active list, scalar compatibility and WAITING-only count | S2-TEST-24/25 | New public case in `issue19-counters.test.ts`, public DTO unit/API/privacy suites and exact allowlist helpers; `client/tests/ui/public-board.test.tsx`, public-board/Sprint 1/counter E2E journeys |

The original same-queue parallel-service and shared-counter contention scenarios are superseded, not silently skipped. Dedicated capacity instead verifies one same-queue winner and independently callable R/S. S2-TEST-16 permits terminal history, rather than rejecting it. Full dashboard/ETA cases remain #20 and are not claimed implemented here.

## RED, GREEN, regression and build evidence

| Stage | Actual result | Evidence |
| --- | --- | --- |
| Phase 0 baseline | 10 unit + 134 API + 82 UI + 33 browser = **259 passed**; static/build/Docker checks passed | Baseline report/logs retained locally under `/tmp/cpe334-issue19-phase0.ZqEDOv`; Phase 0 reported in the conversation |
| Phase 1 RED | New API: 18 expected failures, one pass; 134 baseline API pass. New UI: four expected failures; 82 baseline UI pass. Backend typecheck passed. | [API RED](../../artifacts/evidence/issue19/phase1/api-red.txt), [UI RED](../../artifacts/evidence/issue19/phase1/ui-red.txt), [phase status](../../artifacts/evidence/issue19/phase1/status.txt) |
| Phase 2 schema | Four migration/integrity cases passed; Prisma validation/generation and typecheck passed. Runtime/UI intentionally still incomplete. | [Migration](../../artifacts/evidence/issue19/phase2/migration.txt), [status](../../artifacts/evidence/issue19/phase2/status.txt) |
| Phase 3 provisioning | Four cases passed; two CLI seed runs retained IDs and four assignments. | [Tests](../../artifacts/evidence/issue19/phase3/tests.txt), [repeat seed](../../artifacts/evidence/issue19/phase3/repeated-seed.txt) |
| Phase 4 backend GREEN | 157 API + 10 unit passed; typecheck passed. Frontend RED remained pending. | [API](../../artifacts/evidence/issue19/phase4/api-green.txt), [status](../../artifacts/evidence/issue19/phase4/status.txt) |
| Phase 5 UI GREEN | 86 UI + 9 relevant browser tests passed; client build passed. | [UI](../../artifacts/evidence/issue19/phase5/ui-green.txt), [browser](../../artifacts/evidence/issue19/phase5/e2e-green.txt), [build](../../artifacts/evidence/issue19/phase5/client-build.txt) |
| Phase 6 audit defect RED→GREEN | Two expected HTTP-code failures, then both pass with rollback/retry assertions. | [RED](../../artifacts/evidence/issue19/phase6/audit-constraint-red.txt), [GREEN](../../artifacts/evidence/issue19/phase6/concurrency-green.txt), [separate fix record](../../artifacts/evidence/issue19/phase6/audit-fix.txt) |
| Final public projection RED→GREEN | One API and two UI failures demonstrated missing list/label/empty handling; all pass in final regressions. | [API RED](../../artifacts/evidence/issue19/phase6/public-projection-red-api.txt), [UI RED](../../artifacts/evidence/issue19/phase6/public-projection-red-ui.txt) |

Final local counts, superseding the intermediate 306-case Phase 6 run:

| Category | Files | Passed | Failed |
| --- | ---: | ---: | ---: |
| Backend unit | 5 | 10 | 0 |
| Backend API | 20 | 170 | 0 |
| PostgreSQL migration/integrity | 1 | 6 | 0 |
| Frontend UI | 13 | 88 | 0 |
| Playwright | 13 spec files | 35 | 0 |
| **Total** | | **309** | **0** |

No final test was skipped. Compared with Phase 0 this adds 36 API, six database, six UI and two browser cases: 50 more passing cases. [Phase 6 status](../../artifacts/evidence/issue19/phase6/status.txt), [unit](../../artifacts/evidence/issue19/phase6/unit.txt), [API](../../artifacts/evidence/issue19/phase6/api.txt), [database](../../artifacts/evidence/issue19/phase6/database.txt), [UI](../../artifacts/evidence/issue19/phase6/ui.txt), [browser](../../artifacts/evidence/issue19/phase6/e2e.txt) contain actual runner output.

Backend typecheck, backend production build, frontend production build, Prisma validation and both local Docker builds all exited 0: [types](../../artifacts/evidence/issue19/phase6/types.txt), [server](../../artifacts/evidence/issue19/phase6/server-build.txt), [client](../../artifacts/evidence/issue19/phase6/client-build.txt), [Prisma](../../artifacts/evidence/issue19/phase6/prisma.txt), [backend Docker](../../artifacts/evidence/issue19/phase6/docker-server.txt), [frontend Docker](../../artifacts/evidence/issue19/phase6/docker-client.txt).

These are local results, not a GitHub Actions run. Existing CI build/unit/API/UI/Docker commands were exercised locally. The workflow still targets `staging`/`main`; it does not automatically run on `sprint-2`, and the new `test:database` script remains an explicit local check. No workflow or deployment was changed. The backend image's normal npm installation still reports the four high-severity dependency vulnerabilities also seen at baseline; dependency remediation was outside this change.

## Actual commands and independent verification

Tests used Node `v24.14.0`, npm `11.9.0`, local PostgreSQL 17 and Docker daemon `29.9.3`. Installed dependencies were reused; Docker builds ran their normal `npm ci`. PostgreSQL 16 remains the existing CI service configuration; no actual remote CI run is claimed.

The configured development/test databases at loopback port 55432 were not used or modified. Verification created a separate PostgreSQL cluster under `/tmp/cpe334-issue19-phase0.ZqEDOv`, bound only to loopback port 55489. API and browser suites used different disposable databases. Migration tests allocated and dropped their own uniquely named `_test` databases. Only synthetic credentials/data were used. The temporary server is stopped after verification, with evidence/data retained locally; no production resource was contacted.

Actual package/build commands, with safe test URLs explicitly set in the local shell where needed:

```bash
npm --prefix server run db:generate
npm --prefix server run test:unit
npm --prefix server run test:api
npm --prefix server run test:database
npm --prefix server run typecheck
npm --prefix server run build
npm --prefix client run test:ui
npm --prefix client run build
npm --prefix client run test:e2e -- --output=/tmp/cpe334-issue19-phase0.ZqEDOv/phase6-playwright
./server/node_modules/.bin/prisma validate --schema=server/prisma/schema.prisma
docker build -t cpe334-issue19-server:verified .
docker build -f client/Dockerfile -t cpe334-issue19-client:verified .
git diff --check
```

Targeted API verification uses direct Vitest, because the existing `test:api` script always includes the full API directory even when another filename is appended:

```bash
(
  cd server
  DATABASE_URL="$TEST_DATABASE_URL" npx vitest run tests/api/issue19-counters.test.ts tests/api/issue19-provisioning.test.ts tests/api/issue19-concurrency.test.ts tests/api/issue19-audit-errors.test.ts --maxWorkers=1 --no-file-parallelism
)
```

For independent verification from the repository root, the following Bash sequence creates an entirely fresh local cluster and never resets an existing database. It requires the already used local PostgreSQL CLI tools, installed project dependencies/Prisma client, Playwright Chromium and available ports. Migration tests require CREATE DATABASE privilege; the disposable cluster's synthetic role provides it. The commands are a reproducible recipe, not a claim that this exact new cluster name/port has already been executed.

```bash
set -euo pipefail
issue19_repo="$PWD"
issue19_verify="$(mktemp -d /tmp/cpe334-issue19-review.XXXXXX)"
initdb -D "$issue19_verify/pgdata" --auth=trust --username=issue19_review --no-locale --encoding=UTF8
pg_ctl -D "$issue19_verify/pgdata" -l "$issue19_verify/postgres.log" \
  -o "-h 127.0.0.1 -p 55490 -k $issue19_verify" start
trap 'pg_ctl -D "$issue19_verify/pgdata" stop -m fast' EXIT
createdb -h 127.0.0.1 -p 55490 -U issue19_review issue19_api_test
createdb -h 127.0.0.1 -p 55490 -U issue19_review issue19_browser_test
export DATABASE_URL='postgresql://issue19_review@127.0.0.1:55490/issue19_unused_dev'
export TEST_DATABASE_URL='postgresql://issue19_review@127.0.0.1:55490/issue19_api_test'
export DEMO_CUSTOMER_PASSWORD='SyntheticIssue19Customer!'
export DEMO_OPERATOR_PASSWORD='SyntheticIssue19Operator!'
export TZ=UTC
npm --prefix server run db:generate
npm --prefix server run test:unit
npm --prefix server run test:api
ISSUE19_MIGRATION_EVIDENCE="$issue19_verify/migration.json" npm --prefix server run test:database
npm --prefix server run typecheck
npm --prefix server run build
npm --prefix client run test:ui
NODE_ENV=production npm --prefix client run build
./server/node_modules/.bin/prisma validate --schema=server/prisma/schema.prisma

export TEST_DATABASE_URL='postgresql://issue19_review@127.0.0.1:55490/issue19_browser_test'
DATABASE_URL="$TEST_DATABASE_URL" npm --prefix server run db:migrate
DATABASE_URL="$TEST_DATABASE_URL" npm --prefix server run db:seed
mkdir "$issue19_verify/workspace"
rsync -a --exclude='.git' --exclude='node_modules' --exclude='dist' \
  --exclude='.env' --exclude='test-results' --exclude='playwright-report' \
  ./ "$issue19_verify/workspace/"
ln -s "$issue19_repo/server/node_modules" "$issue19_verify/workspace/server/node_modules"
ln -s "$issue19_repo/client/node_modules" "$issue19_verify/workspace/client/node_modules"
touch "$issue19_verify/workspace/server/.env"
(
  cd "$issue19_verify/workspace"
  E2E_API_PORT=3460 E2E_WEB_PORT=5490 ISSUE19_EVIDENCE_DIR="$issue19_verify/screenshots" \
    npm --prefix client run test:e2e -- --output="$issue19_verify/playwright"
)
docker build -t cpe334-issue19-server:review .
docker build -f client/Dockerfile -t cpe334-issue19-client:review .
git diff --check
git status --short
```

E2E runs from a source copy because some legacy tests write fixed historical screenshot paths; this protects original evidence. Current source and symlinked dependencies are used, not a simulated application. API and E2E suites must run sequentially if configured to share a database. A fresh database is required for the existing seeded `R-0001` release journey.

Read-only SQL inspection, using an explicitly verified local URL:

```bash
psql "$TEST_DATABASE_URL" -X -v ON_ERROR_STOP=1 \
  -c 'SELECT id,code,name,queue_id FROM service_counters ORDER BY code;' \
  -c 'SELECT display_number,status,counter_id,sequence FROM queue_entries ORDER BY queue_id,sequence;' \
  -c 'SELECT code,last_sequence,state FROM queues ORDER BY code;' \
  -c 'SELECT operator_id,queue_id FROM operator_queue_assignments ORDER BY operator_id,queue_id;' \
  -c "SELECT indexname,indexdef FROM pg_indexes WHERE tablename='queue_entries' ORDER BY indexname;"
```

Per-phase status files contain commands, changed-file summaries, test contracts/results, independent verification, evidence guidance, limitations and commit readiness. No runtime suite is rerun for a documentation-only change without a new concern.

## Deployment ordering and limitations

No GCP resource, production database, remote branch, PR or merge was modified. **No push was performed.** The user will push.

The new schema intentionally rejects old call writers that omit counterId. Stop/exclude old writers before applying the migration; run approved provisioning and the compatible application, validate state and smoke behavior, and only then reopen writes. The current migration-before-service-update deployment workflow must not be used for this change with live old writers. This document does not authorize deployment. Old no-show/completion status-only updates are compatible with retained historical links, but that does not make the old application a supported mixed-version deployment. A traffic rollback cannot undo schema/data changes; restoration/reconciliation needs an independently reviewed plan.

Remaining external evidence is clearly separate from the completed local implementation:

- **PENDING USER:** manual local acceptance screenshots/review. Automated real screenshots already exist below; they are not described as manual captures.
- **PENDING EXTERNAL:** real GitHub Actions URL/result after a user push to a triggering context. No CI pass is claimed now.
- **PENDING TEAM INTEGRATION:** carry the approved dedicated-counter decision into remote issue review and #20 planning. The original shared-counter text remains historical under the explicit precedence notice.
- Production deployment, production before/after data/session continuity and production recovery were **not performed** and are outside this task.

## Evidence locations and genuine screenshots

All repository evidence is selected synthetic test output with no credentials or sensitive operational data. Logs have runner output and ANSI/trailing-whitespace cleanup only. Migration JSON contains fixture counts/configuration, not user credentials. Phase 0 local logs were not copied wholesale into Git.

- [Operator availability at 320 px](../../artifacts/evidence/issue19/phase5/screenshots/available-320.png)
- [Counter S occupied at 320 px](../../artifacts/evidence/issue19/phase5/screenshots/occupied-s-320.png)
- [Counter S released at 1280 px](../../artifacts/evidence/issue19/phase5/screenshots/released-s-1280.png)
- [Anonymous Counter R projection at 320 px](../../artifacts/evidence/issue19/phase6/screenshots/public-counter-r-320.png)
- [Anonymous Counter R projection at 1280 px](../../artifacts/evidence/issue19/phase6/screenshots/public-counter-r-1280.png)
- [Phase 5 manual reproduction instructions](../../artifacts/evidence/issue19/phase5/status.txt) cover available/occupied counters, simultaneous R/S, handoff, completion/no-show release, duplicate-call rejection and conflict refresh.

The occupied operator capture and 320 px public capture were visually inspected. Responsive browser assertions also verify no horizontal overflow in the new operator journeys. Screenshots do not establish production deployment or teammate acceptance.

## Verified implementation commits

These references were read from local history after the commits existed. The documentation is prepared after `474fcc5`; no future documentation SHA is invented.

| Phase/change | Verified commit |
| --- | --- |
| Baseline / merged #18 | `af01e1d302b03940424b0e1d9bdcb48abd659135` |
| 1: RED contracts/tests | `69dbd5a24f934486c482f5d33a2b414201e41f86` |
| 2: schema/migration | `29c6de8fa79814cfcffd715e96ebd79a4076ea40` |
| 3: provisioning | `6cf14539b14b0a39394f7ea6d5b1c3afc0554834` |
| 4: backend lifecycle | `0ea939bf41b484fd0f754892f8bd2ad91efbad78` |
| 5: operator interface | `1d68e2123b0c4b284eaca6ef6ebfe109191b9add` |
| 6: separate audit error fix | `437d59ab00220d10f58cf3dfce86739c0769382b` |
| 6: concurrency/regression verification | `7057482a2e5a08d1dd7ffe53f2f929c11638e6d3` |
| 6: contracted public projection completion | `474fcc59e27b6834129c4313d0ab309f228f8595` |

## Final local acceptance checklist

- [x] Approved dedicated R/S policy explicitly supersedes original conflicting contracts.
- [x] Persistent counters, valid queue linkage and both combined service-capacity constraints.
- [x] Populated safe migration, all six statuses preserved, invalid inputs roll back atomically.
- [x] Repeat provisioning preserves IDs, all four assignments, credentials and operational history.
- [x] Call/start/complete/manual-no-show occupancy and retained historical associations.
- [x] Customer/operator cancellation, exact no-show boundary and source-status restrictions preserved.
- [x] Shared A/B access, handoff, revoked/unassigned denial and actual actor auditing.
- [x] Real lock/concurrency/restart/FIFO checks and audit rollback/retry.
- [x] Minimum operator UI, authoritative refresh, disabled states and responsive real journeys.
- [x] Exact public active-entry allowlist and legacy scalar values/fallback; private customer data excluded.
- [x] All **309** local tests pass, with typecheck, Prisma validation, production builds and Docker builds passing.
- [x] Evidence/provenance and deployment compatibility documented; no push, PR, merge or deployment.

## Proposed pull request summary

Implements Issue #19 using the approved dedicated-counter design: Counter R for Queue R and Counter S for Queue S, available to both assigned operators, while retaining one active service per queue. Adds persistent counters, a preserving migration, idempotent provisioning, transactional lifecycle associations and historical links, operator occupancy controls, and a privacy-safe public counter-label projection.

Validation: 170 API, 10 unit, six PostgreSQL migration/integrity, 88 UI and 35 Playwright tests passed. Backend typecheck, Prisma validation, both production builds and both Docker builds passed locally. Includes genuine RED/GREEN output and responsive screenshots. Requires a controlled writer-stop migration window; no deployment or GitHub Actions success is claimed. The original shared-counter proposal is superseded by the recorded user decision. This is a draft summary only; no PR was created.
