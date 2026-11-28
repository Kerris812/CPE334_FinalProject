# Issue #18 implementation and verification

29 November 2026 (Asia/Bangkok) · `feature/18-cancellation-no-show` · Local verification

[Issue #18](https://github.com/Kerris812/CPE334_FinalProject/issues/18) · [Issue #17 contracts](specification.md) · [Test output](../../artifacts/evidence/issue18/)

## Baseline and scope

The branch started clean at `fae672ba2f020bbda53ea89639e1e4dc6c438ca1`, the PR #63 merge, with finalized Issue #17 commit `fb6d7ec` in ancestry. The public PR checklist records teammate review and approval. The public GitHub API returned no standalone reviews or issue/PR comments. All implementation and evidence commits are local.

- F-06 adds authenticated customer and operator cancellation of WAITING entries. Customer cancellation takes the customer then queue lock. Operator actions take the queue lock and hold current assignment through commit. Both persist a server timestamp and actual actor in the same transaction as the status change. The operator’s validated reason stays in audit storage.
- F-07 adds manual no-show after the inclusive five-minute threshold, sampled using the server clock after locking. The CALLED → NO_SHOW update releases the current queue-level slot. Current-model terminal operator responses use `counterId: null`. No schema, migration, occupancy field, counter audit field or public-board projection changed.
- The existing customer view shows cancellation and terminal status, and allows rejoin. The existing operator desk exposes cancellation for its displayed waiting head and no-show for its CALLED entry. The operator cancellation API can target any authorized WAITING entry. Unified waiting-list controls and dashboard projections belong to #20. Customer waiting position, ETA and the remaining additive read fields belong to later integration; terminal customer reads expose the Issue #18 timestamps and null position and ETA.
- Shared server surfaces for #19 include `app.ts`, `operator/service.ts`, queue locking and entry DTOs. The branch exports existing operator helpers for transaction authorization and projection, and adds a desk `asOf` clock sample for the temporary single-slot UI. Coordinate those edits with #19 and #20. The termination handlers live in `server/src/lifecycle/termination.ts`.

## Acceptance verification

| Contract | Test mapping | Status |
| --- | --- | --- |
| S2-F06-AC-01 / FR-13 / BR-18 | S2-TEST-01/02/26 | Verified under current model. Owner and operator cancellation, new join number, actor/time, trimmed operator reason and browser flow. |
| S2-F06-AC-02 / FR-13 / BR-08/16–18/26 | S2-TEST-03/04/05/26 | Verified under current model. Role/scope/ownership, invalid state, payload and reason validation, rollback, privacy, and call/cancel race. The current legacy call endpoint returns QUEUE_EMPTY if cancellation wins and no other head exists. #19 owns preview-aware call and QUEUE_HEAD_CHANGED. |
| S2-F07-AC-01 / FR-14 / BR-07/17/19/20 | S2-TEST-06/26 | Partially verified. Measured 299,999, 300,000 and 300,001 ms boundaries, manual action, handoff actor attribution, current slot release, next call and rejoin. Counter release and isolation are pending. |
| S2-F07-AC-02 / FR-14 / BR-08/11/16/19/26 | S2-TEST-07/08/26 | Verified under current model for permission, invalid or missing call time, repeated request, start/no-show contention, no automatic transition and audit rollback. Repeat rollback and concurrency against persistent counter occupancy after #19. |

Before closing #18, integrate #19’s stored counter lock and release into the no-show transaction, capture the pre-release counter in the audit event, and verify that the associated counter alone is released. Exercise both CALLED and SERVING peers in the same queue, rerun rollback with real occupancy, and rerun same-queue concurrency and end-to-end regressions. The finalized contract and its planned STS remain the integration baseline.

## RED, GREEN and regression evidence

Commands were run from the repository root. Logs preserve runner output with terminal color escapes and trailing whitespace removed. PostgreSQL used an isolated `issue18_test` database at loopback port 55483, seeded with synthetic credentials. The API runner applied the two existing baseline migrations and ran all API files even with the feature argument. GREEN feature logs were captured immediately before the corresponding implementation commits. The final API, UI and browser runs include the working changes recorded in `71c9efb`. The first browser attempts exposed fixture connection setup errors; the final browser run used a fixture bound explicitly to the isolated database. The first UI attempt exposed a missing jsdom dialog stub; the recorded UI RED below uses the corrected test setup and fails on missing controls.

| Stage | Command | Exit / result | Commit and output |
| --- | --- | --- | --- |
| F06 RED | `npm --prefix server run test:api -- issue18-cancellation` | 1 · 5 missing-route failures, 123 baseline tests passed | `c0a7791` · [log](../../artifacts/evidence/issue18/f06-red.txt) |
| F06 GREEN | Same F06 command | 0 · 128 passed | `4667761` · [log](../../artifacts/evidence/issue18/f06-green.txt) |
| F07 RED | `npm --prefix server run test:api -- issue18-no-show` | 1 · 6 missing-route failures, 128 passed | `02c2d07` · [log](../../artifacts/evidence/issue18/f07-red.txt) |
| F07 GREEN | Same F07 command | 0 · 134 passed | `e1dc364` · [log](../../artifacts/evidence/issue18/f07-green.txt) |
| UI RED | `npm --prefix client run test:ui -- issue18-termination` | 1 · 3 missing-control failures, 79 passed | `17bee26` · [log](../../artifacts/evidence/issue18/ui-red.txt) |
| UI GREEN | Same UI command | 0 · 82 passed | `71c9efb` · [log](../../artifacts/evidence/issue18/ui-green.txt) |
| Final API | `npm --prefix server run test:api` | 0 · 134 passed | `71c9efb` · [log](../../artifacts/evidence/issue18/final-api.txt) |
| Unit | `npm --prefix server run test:unit` | 0 · 10 passed | [log](../../artifacts/evidence/issue18/unit.txt) |
| Browser | `npm --prefix client run test:e2e -- issue18-termination lab7-shared-operators operator-workflow customer-status --output=/tmp/cpe334-i18-playwright` | 0 · 7 passed, with API port 3457 and web port 5487 | `71c9efb` · [log](../../artifacts/evidence/issue18/e2e.txt) |
| Static checks and builds | `npm --prefix server run typecheck`, `npm --prefix server run build`, `npm --prefix client run build` | 0 each | [Types](../../artifacts/evidence/issue18/typecheck.txt) · [Server](../../artifacts/evidence/issue18/server-build.txt) · [Client](../../artifacts/evidence/issue18/client-build.txt) |
