# Lab 7 System-Level SDS Revision

> Version: 1.1.0 | Date: 27 November 2026 (Asia/Bangkok) | Group: NaiCha, 67070503456 / 67070503479

## 1. Source and supersession

L7-SYS 1.1.0 revises `docs/sprint-1/specification.md` Part C: Architecture and stack (line 323), Data model/ER diagram and Data dictionary (355/417), Atomicity and concurrency (438), Database migrations and seed (446), plus Phase 4 service sequence actor interpretation (648/686). Original D-09/20 and F-02/F-05 scope apply as revised by the [SRS](srs-revision.md); [SRS §5](srs-revision.md#5-acceptance-criteria) owns acceptance criteria. All designs below are proposed contractual commitments until reviewed; observations explicitly describe current source, not verified runtime results.

## 2. Affected architecture and actual components

React client → Express routes/session/role/assignment guards → operator/queue services → Prisma transactions → PostgreSQL. No new subsystem is required. Actual client is React 19 per `client/package.json`, whereas original Part C says React 18; this factual dependency discrepancy does not authorize a dependency update. Actual Prisma models map to snake_case database tables. Audit insertion is in the services; there is no standalone implemented audit module to revise.

| Actual module | Responsibility and relationship |
| --- | --- |
| `client/src/OperatorDesk.tsx` | OperatorDesk fetches assigned queues; ServiceDesk reads selected queue and submits call/start/complete; useQueueResource refreshes state |
| `client/src/api-client.ts`, `client/src/useQueueResource.ts` | Shared cookie JSON client, safe errors, loading/polling/refresh |
| `server/src/app.ts` | Mounts authentication/role/mutation/assignment guards and operator handlers; obtains actor via currentUser |
| `server/src/auth/auth.ts`, `server/src/auth/session.ts` | Session resolution and mutation Origin/content checks |
| `server/src/authorization/guards.ts` | Role, target queue assignment and stored entry→queue resolution |
| `server/src/operator/service.ts` | readDesk, operate and transaction-local authorize; entry writes and events |
| `server/src/queues/rules.ts`, `server/src/queues/service.ts` | Transition policy, party routing, number allocation and customer duplicate invariant |
| `server/prisma/seed.ts`, `server/scripts/seed.ts` | Assignment policy and seed invocation; future implementation change is required to seed policy |
| `server/prisma/schema.prisma`, migrations `0001_foundation`/`0002_immutable_queue_sequence` | Existing assignment relation, entry/event persistence, partial uniqueness and immutable allocated identity |

## 3. Operator assignment model (L7-FR-01)

Current `OperatorQueueAssignment` has composite primary key `(operatorId, queueId)`, User/Queue foreign keys, createdAt and queue index. It already permits many queues per operator and many operators per queue. There is no unique constraint on operatorId alone, queueId alone, or active service ownership by an operator.

Proposed approved setup shall resolve synthetic seeded accounts by their existing unique emails and queues by codes R/S, validate OPERATOR roles, and transactionally upsert four pairs A/R, A/S, B/R, B/S. Replace the current “any non-designated assignment is a conflict” check, which would reject the new valid data. Scope the allowed seed assignment set to the two approved queues; unexpected seeded assignments outside R/S shall fail safely for manual investigation without deletion, preserving the existing safety intent. Do not grant all users or all operators universal access.

For an existing DB, add missing A/S and B/R without rewriting original rows or createdAt. Preserve other operators' assignments. No cleanup/revocation is required by this change. Rerun must be idempotent and preserve user flags/password hashes, sessions, queues/state/counters, entries and events. Future deployment must include approved assignment provisioning; shipping code without new assignment data would leave old access behavior.

## 4. Authentication and authorization (L7-FR-09)

Preserve session cookie `qs_session`, SHA-256 token lookup, expiry/revocation and active-user checks in session.ts. app.ts must authenticate and require OPERATOR before route use. Unsafe requests retain allowed Origin and application/json checks. Authorization never trusts an actor/role/queue claim in headers, query or body.

For desk/call, requireQueueAssignment verifies `(principal.id, queueId)`. For start/complete, requireEntryAssignment validates entry UUID, reads its stored queueId and checks that pair. Missing/malformed entry remains 404 ENTRY_NOT_FOUND. In the service transaction, authorize re-reads active role and selects the assignment `FOR SHARE`, retaining it through commit to serialize a concurrent assignment deletion. A previous actor never acts as service owner. No special A/B identity bypass or frontend-only authorization is introduced. Existing sessions pick up persisted assignment changes on subsequent requests.

## 5. Service layer behavior and state enforcement (L7-FR-02–06)

`readDesk` currently authorizes in a RepeatableRead transaction and returns a consistent queue, waitingCount, activeEntry and nextWaiting snapshot. Retain this behavior for both queues.

`operate` currently derives entry queue when needed, locks queue row, authorizes inside transaction, reads current entry and validates canTransition. Keep this path for both operators. For call, require OPEN and no active slot; select smallest-sequence WAITING. Start/complete use the locked, re-read source status, not stale UI data. Update where `{id, status: observedStatus}`; set only the timestamp for the accepted edge, append event, commit and return DTO. There is no comparison of new actor with previous event actor, so handoff needs valid assignments rather than service ownership changes.

| Action | Persisted source | Destination | Timestamp | Event type |
| --- | --- | --- | --- | --- |
| call-next | WAITING FIFO head | CALLED | calledAt | CALLED |
| start-service | CALLED | SERVING | servingAt | STARTED |
| complete | SERVING | COMPLETED | completedAt | COMPLETED |

`canTransition` implements only the edges above; SRS L7-FR-06 governs invalid/terminal states. Non-OPEN prevents new calls, while current start/complete code permits finishing valid active service. Preserve that policy.

## 6. Concurrency and atomicity (L7-FR-07; L7-PR-03)

### 6.1 Observed mechanism

Current operate uses a Prisma interactive transaction with maxWait/timeout of 10,000 ms. All service writers acquire `SELECT id FROM queues WHERE id = ... FOR UPDATE` before reading service eligibility/current status. `authorize` then locks the applicable assignment row FOR SHARE through commit. Entry actions first find queue identity outside the queue lock, but the stored queue identity is protected by the immutable-number trigger in migration 0002; operational status is re-read after acquiring the queue lock. Conditional update additionally checks source status. Transaction isolation for operate is not explicitly set; serialization of service writers relies on the row lock rather than an explicitly configured Serializable transaction.

Migration 0001 adds partial unique index `queue_entries_one_service_slot` on queue_id WHERE status IN ('CALLED','SERVING'). The independent `queue_entries_one_active_customer` index covers WAITING/CALLED/SERVING across queues. Migration 0002 forbids changing queue_id/sequence/display_number. Prisma's DSL alone does not display the partial indexes; preserve the SQL migrations.

### 6.2 Required retained design

All call/start/complete paths shall retain the same queue-first service lock order, transaction-local authorization, post-lock state read, guarded update and atomic event insertion. Two distinct operators lock the same queue row, so a waiting contender sees committed state before deciding. Concurrent starts from CALLED produce one SERVING and one INVALID_TRANSITION; concurrent completes from SERVING produce one COMPLETED and one INVALID_TRANSITION. Two calls against an OPEN idle queue with waiting work produce one CALLED FIFO head and one SERVICE_SLOT_BUSY. Exactly one event is added for the winning action. Do not automatically retry a stale action against a different customer.

The partial unique service index remains a final database invariant, not the sole race handling mechanism. Indexes alone cannot prevent duplicate same-entry events. A unique violation or timeout is not a substitute for the specified normal two-request conflict response; if later verification exposes such failures, fix error handling while retaining safe rollback and review the design before changing contracts. Normal contention fixtures must avoid deliberate timeout or connection-pool exhaustion.

R and S use different queue rows, so holding R's service lock must not prevent S from progressing with available pool capacity. Join locks customer first then queue; it does not lock assignment rows. No new reverse lock dependency is introduced. Global locks, extra counters and new entry ownership tables are unnecessary.

### 6.3 Verification and limits

Existing source tests include same-operator duplicate start/complete and 20 simultaneous same-queue calls, plus R/S lock independence. They do not establish new two-operator behavior under revised seeded data. No concurrency tests were run here. Proposed L7-010/011/019/020 must prove the design on real PostgreSQL, with one event per success, complete before/after snapshots on rejected isolated operations and rollback under injected audit failure. No lock/index/schema rewrite appears necessary from inspection; revisit only if evidence shows a defect.

## 7. Audit design (L7-FR-08)

Existing QueueEvent fields: `id`, `entryId`, nullable `actorId` FK to User, `eventType` VARCHAR(40), nullable `fromStatus`, `toStatus`, `occurredAt` timestamptz, nullable `reason`. Operator service always supplies authenticated operatorId to actorId. Same server `at` value is used for transition timestamp and event occurrence. JOINED uses customer identity and null source status in queue service. Nullable schema does not permit omitting actor for successful operator actions under this contract.

For A-call/B-start/A-complete append `(CALLED,A,WAITING,CALLED)`, `(STARTED,B,CALLED,SERVING)`, `(COMPLETED,A,SERVING,COMPLETED)`. Preserve JOINED and all older events. No audit column/type/endpoint change is required. Append in the entry transaction; failed audit insertion rolls back entry timestamps/status. There is no new requirement for failed-action audit logging; rejected actions must not append successful transition events. Existing append-only application behavior is retained; no database immutability trigger for QueueEvent is claimed.

## 8. API design impact

Preserve full `/api/v1/operator` endpoints: `GET /queues`, `GET /queues/:queueId/desk`, `POST /queues/:queueId/call-next`, `POST /entries/:entryId/start-service`, `POST /entries/:entryId/complete`. See Feature SDS §2 for complete inputs/outputs. Success envelopes and codes stay unchanged. Only valid assigned-list content/access changes for seeded A/B; no new parameter, actor field, endpoint or handoff token. Entry IDs are UUIDs; R/S are queue codes resolved to IDs, not assumed UUID route values. Operational audit data stays server-side; public DTO is not widened.

## 9. UI impact

`OperatorDesk` already maps all assigned queues into its selector. `ServiceDesk` is keyed by selected queueId; actions derive from current activeEntry and exact status. Once assignment provisioning changes, both A and B should see R/S without a source rewrite. Current pending gate only protects one component, so server concurrency remains necessary across operators/tabs. Preserve refresh after success/error, safe conflict text, 401 handoff to login, 403 access message, empty assignments, accessible keyboard/360 px layout, 44px controls and capacity labels 0/1 or 1/1.

No UI implementation change is expected from inspection; verify both operators, queue switching, stale other-operator state and error recovery in future tests. `ActiveServiceCard` appears in original design terminology; current code renders active service inside ServiceDesk rather than a standalone file with that name. CustomerQueues, PublicQueueBoard and QueueNumberDisplay retain their existing functionality.

## 10. Persistence, migration and historical data

No schema migration is expected: composite assignments, shared queue service slot and per-event actor already represent the approved behavior. Required future change is additive assignment data through revised approved seed/setup, not a migration or data edit in Issue 7.1. Keep migrations 0001/0002 and Prisma models intact unless future verified evidence justifies an additional reviewed change.

Do not delete or reroute old entries, renumber tickets, reset lastSequence, reset queue state or reinterpret old actors. Historical events remain attributed to their original actors even after assignment expansion. Existing historical out-of-current-range entries may finish; party routing validates new joins, not historical transitions. Test rerun/restart preserves history and four approved assignment pairs. No service-owner backfill, schema conversion, event migration or Counter table is necessary.

## 11. Backward compatibility and traceability

Preserve L7-PR-01–04 and all unaffected original requirements. Existing A→R/B→S workflows remain valid; A→S/B→R denial expectations change only for newly assigned A/B. Truly unassigned operators remain denied. L7-001–020 in STS cover shared data/setup, service handoff/state/concurrency/audit and preserved behavior. See impact analysis §2 for original part/feature/AC/test/module traceability. Contract and implementation review must reject any shortcut that removes assignment guards or the single-slot index to obtain shared access.

## Revision history

| Version | Date | Revision | Acceptance |
| --- | --- | --- | --- |
| 1.0.0 | 23 November 2026 | Initial repository-grounded Lab 7.1 revision | PENDING teammate review |
| 1.1.0 | 27 November 2026 | Referenced authoritative SRS and reduced repeated policy prose; technical design retained | PENDING teammate review |
