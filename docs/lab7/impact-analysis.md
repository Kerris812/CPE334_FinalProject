# Lab 7 Change Impact Analysis

> Version: 1.1.0 | Date: 27 November 2026 (Asia/Bangkok) | Group: NaiCha, 67070503456 / 67070503479  

## 1. Change and inspection basis

Old rule: A is seeded only for R, B only for S. Approved rule: each has valid R/S assignments and may call/start/complete, including handoff; state, audit, concurrency, role/scope, FIFO, routing and capacity remain. Current source already generalizes operations to arbitrary valid assignments. The primary mandatory implementation change is future seed/provisioning policy plus legitimate test expectation updates; guards, transition/audit/locking and UI should be retained unless future verification reveals a defect.

Original analysis inspected prechange commit `fc178ed639619e3e74a37724a0373e990839a0e8`, recorded on 23 November 2026 from the initially clean `docs/lab7-contract` worktree. See [README §2](README.md#2-version-record-and-verification-limits) for tagged Sprint 1 reference, missing formal acceptance and intervening development. Sources: original combined specification Parts A/C/E and Phase 4, API/UI/STS, acceptance coverage/release records, all relevant service/guard/seed/schema/migration and operator/customer/public UI modules, unit/API/UI/E2E test sources. Test sources were read, not executed. No live database/cloud state inspected.

## 2. Detailed impact matrix

Original SRS, Feature SDS and System SDS named sections below are in `docs/sprint-1/specification.md` unless noted. They have named parts/headings, not invented numeric subsection IDs. `L7-AC-` and `L7-` prefixes apply to acceptance/test numeric lists; full acceptance definitions are in [SRS §5](srs-revision.md#5-acceptance-criteria); revised file shorthand SRS/Feature/System/STS denotes the corresponding revision in this directory.

| Requirement ID | Feature | Original behavior | New behavior | Original SRS | Original Feature SDS | Original System SDS | Revised reference | AC | STS | Actual module paths | Required verification |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| FR-03/04; L7-FR-01 | F-02 assignments | A→R/B→S only | Four approved pairs; backend scope retained | Phase 0 D-20; Part A FR-03/04, BR-11 | Part E F-02 Feature-level SDS, AC-009–011 | Part C Data dictionary; Database migrations and seed | SRS §3; Feature §3; System §3 | 01,13,15 | 001,002,007,017 | server/prisma/seed.ts; server/prisma/schema.prisma; server/src/app.ts | Fresh/rerun seed, preserved data, unassigned actor denial |
| FR-09; L7-FR-02 | F-05 call | Own designated queue FIFO call | Either assigned A/B calls either queue | Part A FR-09, BR-01/02/07 | Part E F-05 workflow, AC-032–034/039 | Part C Atomicity and concurrency; Phase 4 §4 | SRS §3; Feature §4; System §§5–6 | 02,09,11 | 001,002,011,013,015 | server/src/operator/service.ts; server/src/queues/rules.ts; server/src/app.ts | Both crossed and original paths; independent FIFO |
| FR-10/11; L7-FR-03–06 | F-05 start/complete/handoff | Valid stage in assigned queue; exclusive seed limits actors | Any assigned actor per valid stage, explicit handoff | Part A FR-10/11, BR-08/26 | Part E F-05 workflow, AC-035–037/042 | Part C Atomicity and concurrency; Phase 4 §5/state diagram | SRS §3; Feature §§5–8; System §5 | 03,04,05,06 | 003,004,005,008,009,018 | server/src/operator/service.ts; server/src/queues/rules.ts; server/src/authorization/guards.ts | All A/B triples, invalid and terminal states |
| BR-16; NFR-05; L7-FR-07 | F-05 contention | Queue lock, guarded status update, single-slot index | Retain design; prove distinct-operator races | Part A BR-16, NFR-05 | Part E F-05 Concurrency, AC-040 | Part C Atomicity and concurrency, physical constraints | SRS §3; Feature §10; System §6 | 07,11 | 010,011,015,019 | server/src/operator/service.ts; server/prisma/migrations/0001_foundation/migration.sql | Real PostgreSQL one winner/event, R/S lock independence |
| FR-12; L7-FR-08 | F-05 audit | Per-request actorId already recorded | Explicit handoff per-step actor and rollback | Part A FR-12, BR-17, NFR-13 | Part E F-05 Data contract, AC-041 | Part C QueueEvent/data dictionary and atomicity | SRS §3; Feature §7; System §7 | 08 | 012,020 | server/src/operator/service.ts; server/src/queues/service.ts; server/prisma/schema.prisma | A/B/A event tuples and injected event-failure rollback |
| FR-02/03; L7-FR-09 | F-01/02 security | Session/role/queue scope enforced | Same enforcement; A/B newly assigned, others unchanged | Part A FR-01–03, BR-09/11/13, NFR-01 | Part E F-02, F-05 AC-038/039 | Part C architecture policies/session | SRS §3; Feature §9; System §4 | 12,13,14 | 006,007,016 | server/src/auth/session.ts; server/src/auth/auth.ts; server/src/authorization/guards.ts; server/src/app.ts | Direct HTTP spoofing, stale/missing assignments/sessions |
| BR-01/03/07; L7-PR-01–03 | F-03/05 invariants | FIFO, 1–4 R/5–8 S; one service slot | Unchanged | Part A BR-01–07; D-01–07 | Part E F-03, F-05 AC-016–024/032/034 | Part C constraints; join/call atomicity | SRS §4; System §§5–6/10 | 09,10,11 | 013,014,015,019 | server/src/queues/rules.ts; server/src/queues/service.ts; server/src/operator/service.ts; server/prisma/migrations | Boundaries/types/mismatches, counters, occupied queues |
| FR-22; NFR-15; L7-PR-04 | Operator UI and regression | Assigned selector; status controls and refresh | R/S choices for A/B; conflict recovery retained | Part A FR-22; NFR-09/10/15 | Part E F-02/F-05; ui-spec F-02/F-05 | Part C React component responsibility | Feature §§2–3/10; System §9; STS §4 | 01,15 | 001,002,016,017,019 | client/src/OperatorDesk.tsx; client/src/useQueueResource.ts; client/src/api-client.ts | Queue switching, two sessions, 401/403/409 and accessible UI |

## 3. Component impact assessment

| Component and exact module | Current behavior | Proposed behavior / implementation impact | Risk | Required regression |
| --- | --- | --- | --- | --- |
| Authentication: `server/src/auth/session.ts`, `auth/auth.ts` | DB session, active user, expiry/revocation; role checked separately; unsafe origin/JSON checks | Retain, no expected code change | Mistaking shared assignment for role bypass | L7-006/016; auth.test.ts and permission-guards.test.ts |
| Operator authorization: `server/src/authorization/guards.ts`, `server/src/app.ts`, operator/service.ts authorize | List filters pairs; queue/entry guards; transactional FOR SHARE assignment recheck | Preserve checks; newly valid pairs authorize both operators; no expected guard change | Removing guards or trusting posted queue/actor | L7-006/007/016; original customer/unassigned/spoof tests |
| Assignment setup: `server/prisma/seed.ts`, `server/scripts/seed.ts` | Only designated pair; fails on opposite pair | **Required future change:** accept/upsert four approved pairs; non-destructive transaction, fail safely for unexpected outside-R/S seeded scope | Rerun failing on approved cross pair or destructive “reset” | L7-017 and revised TEST-009/053 |
| Call: `server/src/operator/service.ts` operate | Queue lock, OPEN/slot check, smallest WAITING sequence | Retain algorithm, broaden only seeded assignment set | Duplicate/skipped calls from two sessions | L7-001/002/011/013/015 |
| Start and complete: same operate; `server/src/queues/rules.ts` canTransition | Source status re-read after queue lock; guarded update | Retain, no actor ownership rule; no expected code change | New owner constraint would incorrectly deny handoff | L7-003/004/005/008/009/018 |
| Handoff: operator/service.ts, `client/src/OperatorDesk.tsx` | No prior-actor check; UI shows persisted queue active entry | Explicitly permit each authorized actor per stage; verify rather than invent ownership machinery | Stale UI or erroneous actor-equality check | L7-005/012/019 |
| Queue/customer-level contention: operator/service.ts, queues/service.ts, migration 0001 | Shared queue FOR UPDATE; customer join lock; partial service/customer indexes; conditional transitions | Retain design; add distinct-operator test coverage later; code changes conditional on evidence | Two events even if final row has one status; global locking | L7-010/011/019, duplicate join regression |
| Audit: operator/service.ts; queues/service.ts | QueueEvent created with request principal in same transaction | No expected schema or event-format change; require explicit handoff assertions | Attributing STARTED/COMPLETED to caller of prior step | L7-012/020; original TEST-041 rollback test |
| APIs: `server/src/app.ts`, `server/src/http/errors.ts` | Existing list/desk/call/start/complete paths and stable envelopes | Preserve URLs/shapes; list content expands for A/B | Clients/tests hardcoding one queue; erroneous status codes | Feature SDS §2; L7-001–012/016 |
| Operator UI: `client/src/OperatorDesk.tsx`, `useQueueResource.ts`, `api-client.ts` | Dynamic assignment selector, keyed ServiceDesk, status gating, refresh/error/pending | No expected source change; verify R/S selector and shared-session conflict refresh | Per-tab gate mistaken for cross-operator concurrency control | L7-001/002/019; UI and E2E desk tests |
| Customer routing: `server/src/queues/rules.ts`, `queues/service.ts`; `client/src/CustomerQueues.tsx` | Numeric integer 1–8; 1–4 R/5–8 S; no arbitrary rerouting | Unchanged; no code/data change | Unrelated route relaxation while editing fixtures | L7-014; party-routing tests at unit/API/UI/E2E |
| Persistence/schema: `server/prisma/schema.prisma`, migrations 0001/0002 | Many-to-many pairs, per-event actor, partial unique indexes, immutable number identity | No expected DDL migration; additive assignment setup only later | Assuming schema DSL lists partial indexes; dropping slot invariant | L7-015/017/020; database/restart/release-persistence tests |
| Historical data: queue_entries/queue_events/queues | Retained lifecycle, original actor, immutable queue/number/sequence | No rewrite/backfill; out-of-current-range historical entries may finish | Rerouting/renumbering or attributing old events to new operator | L7-017/018; persistence snapshots |
| Test sources: server/tests/api/{authorization,permission-guards,party-routing,operator-workflow,database}.test.ts; client/tests/ui/{operator-desk,permissions}.test.tsx; client/tests/e2e/{operator-workflow,party-routing,sprint1-journey}.spec.ts | Some seed assertions and B-as-unassigned fixtures require exclusivity; generic unassigned tests still valid | Later revise superseded expectations; introduce independent unassigned operator and preserve old assertions for it; no edits now | Weakening customer/unassigned checks to obtain green | STS §3 and L7-006/007/016/017 |
| Public board: `server/src/public-board/service.ts`, `dto.ts`; `client/src/PublicQueueBoard.tsx` | Four-field anonymous projection; current service/count per queue | Unchanged; no extra operator/audit fields | Leaking actors/entry details, count regression | L7-016/019; public-board unit/API/UI/E2E |

## 4. Database and migration conclusion

Schema inspection verifies OperatorQueueAssignment composite key `(operatorId, queueId)` and no single-queue restriction on User or Queue. QueueEvent already has actorId per event; QueueEntry has no service-owner field. Migration 0001 physically enforces one CALLED/SERVING per queue and one active entry per customer; 0002 protects queue_id/sequence/display_number. Therefore **no schema migration is expected**. The current seed explicitly rejects a non-designated queue despite representable multi-assignment data, so revised seed/setup is required after review. No database provisioning or migration was run here; actual deployed assignment state remains unverified.

## 5. Historical data and compatibility

Do not migrate/reinterpret events, assign ownership to a past caller, reroute historical tickets, reset queue states/counters or change numbers. Add only missing approved assignment pairs later. Original account roles/flags/hashes/sessions and other assignments survive. Historical party sizes outside current routing retain their stored queue and may finish existing lifecycle. No event schema/backfill is required. Existing A/R and B/S workflows remain valid.

## 6. Dependencies and risks

| Dependency/risk | Consequence | Proposed control and verification |
| --- | --- | --- |
| Seed rejects opposite assignment | Naively adding two rows makes future setup fail | Replace contradictory-pair rule with approved R/S set; idempotence and rollback in L7-017 |
| Cross-queue access mistaken for no authorization | Other operators/customers gain unintended service access | Preserve role/assignment guards and transaction recheck; L7-006/007/016 |
| Two operators using stale same customer | Duplicate transition/event or skipped service | Queue lock + post-lock source check + atomic event; L7-010/011 |
| Attribution taken from prior event or client body | Misleading audit trail after handoff | Principal per request; exact event tuples in L7-012 |
| Selector/test assumes one queue | Wrong initial queue, foreign entry action or false regression failure | Existing dynamic selector; targeted UI/E2E verification and explicit queue selection |
| Existing B-as-unassigned fixtures | Old tests fail legitimately or denial coverage disappears | New unassigned actor fixture; revise only exclusive expectation, preserve denial oracle |
| Prechange RED fixture gives both assignments manually | Old generic service already passes; missing new behavior not demonstrated | Use actual old seed/setup with valid env and DB; preserve missing approved assignment as behavioral failure, STS §5 |
| Unverified accepted/deployed version | Evidence refers to wrong maintenance baseline | Fill README version placeholders from actual Lab 6/deployment evidence before final submission |

## 7. Preserved behavior and regression selection

[SRS §§4–5](srs-revision.md#4-explicitly-preserved-requirements), L7-PR-01–04 and L7-AC-09–15 protect unchanged FIFO, routing, slot/customer uniqueness, numbering, authentication, scope/ownership, public privacy and restart/history. Keep `server/tests/unit/{operator-rules,queue-rules,party-routing}.test.ts`; relevant API auth/authorization/permission-guards/operator-workflow/queue-join/queue-views/party-routing/database/restart/release-persistence/public-board suites; UI permissions/operator-desk/queues/party-routing/customer-status/public-board suites; E2E auth/operator-workflow/party-routing/sprint1-journey/public-board/customer-status journeys. Exact existing AC→test sources are in original acceptance-coverage.md; do not overwrite historical run results.

Later verification commands already defined in package.json: server `npm run test:unit`, `npm run test:api`; client `npm run test:ui`, `npm run test:e2e`; both `npm run build`. These are future commands, not execution evidence. API/E2E must use isolated PostgreSQL and run sequentially where they share fixtures. Lab 6's deliberately defective public-board commits are outside the recorded prechange commit's ancestry and must not be silently merged into this scope.

## Revision history

| Version | Date | Revision | Acceptance |
| --- | --- | --- | --- |
| 1.0.0 | 23 November 2026 | Initial repository-grounded Lab 7.1 revision | PENDING teammate review |
| 1.1.0 | 27 November 2026 | Updated SRS criterion references and exact module paths; preserved impact/risk/regression analysis | PENDING teammate review |
