# Lab 7 Feature-Level SDS Revision

> Version: 1.1.0 | Date: 27 November 2026 (Asia/Bangkok) | Group: NaiCha, 67070503456 / 67070503479 

## 1. Sources and scope

L7-FEAT 1.1.0 supersedes affected portions of `docs/sprint-1/specification.md`, Part E F-02 (lines 829–859), F-05 (937–975) and service sequence diagrams (Phase 4 §§4–5); `api-spec.md` F-02/F-05; `ui-spec.md` F-02/F-05. The [SRS](srs-revision.md) defines L7-FR-01–09 and L7-PR-01–04; [SRS §5](srs-revision.md#5-acceptance-criteria) owns all acceptance criteria. The following complete workflows replace exclusive actor assumptions while keeping endpoint contracts. All proposed workflows await teammate acceptance.

## 2. Common API and workflow contract

All paths below have prefix `/api/v1`. Queue parameters are stored UUIDs; R/S refer to codes. Authenticated actor comes solely from valid `qs_session` and active database User. Unsafe requests use allowed Origin and `Content-Type: application/json`; actions send `{}` and no operator identifier is required. Current action handlers ignore unknown body fields for authorization; they do not reject all such fields with 422. Customer join retains its separate strict body contract.

| Method/path | Inputs | Success response and effect |
| --- | --- | --- |
| GET `/operator/queues` | Session, no body | 200 `{data:[{id,code,name,state},...]}` ordered code ascending; A/B see R and S after approved assignment setup |
| GET `/operator/queues/:queueId/desk` | Session, queue UUID | 200 `{data:{queue:{id,code,state},waitingCount,activeEntry,nextWaiting}}`; activeEntry null or operational entry; nextWaiting null or `{id,displayNumber,partySize,status}` |
| POST `/operator/queues/:queueId/call-next` | Session, queue UUID, `{}` | 200 `{data:entry}`; WAITING→CALLED |
| POST `/operator/entries/:entryId/start-service` | Session, entry UUID, `{}` | 200 `{data:entry}`; CALLED→SERVING |
| POST `/operator/entries/:entryId/complete` | Session, entry UUID, `{}` | 200 `{data:entry}`; SERVING→COMPLETED |

Operational entry DTO is exactly `{id,displayNumber,partySize,status,calledAt,servingAt,completedAt}` in current service. Dates serialize ISO UTC or null. API success does not include actor/event objects; audit assertions inspect database. Desk activeEntry uses the same operational fields. This complete source DTO clarifies the abbreviated original response examples.

Errors use `{error:{code,message,requestId,details?}}` with safe text; details.fields is for validation. Missing/invalid session: 401 UNAUTHENTICATED. Wrong role: 403 FORBIDDEN. Missing assignment: 403 QUEUE_ACCESS_DENIED. Malformed/missing entry: 404 ENTRY_NOT_FOUND. Service conflicts: 409 QUEUE_EMPTY, SERVICE_SLOT_BUSY, QUEUE_NOT_OPEN, INVALID_TRANSITION. No private details in errors. Invalid/unknown queue IDs remain fail-closed through assignment guard. Transaction failure returns safe 500 INTERNAL_ERROR and rolls back; it is not counted as successful service.

All workflows inherit common actors/authorization: active assigned OPERATOR; A and B have R/S, other operators use actual assignments; customers and anonymous callers are excluded. Every rejected isolated workflow leaves entry/queue counters/timestamps/events unchanged. After a conflict the UI refreshes authoritative state. STS specifies concurrency assertions separately so a loser is not incorrectly expected to undo the winner's committed state.

## 3. L7-FEAT-01 Assigned queue selection (F-02)

**Requirements:** L7-FR-01/09; L7-PR-03/04. **Actors:** Operator A, B, other OPERATOR. **Preconditions:** valid session and persisted assignment rows. **Inputs:** GET list, selected returned queue UUID, GET desk. **Authorization:** list filters by principal assignments; desk additionally verifies target pair and transaction-local active OPERATOR check.

**Main flow:** (1) fetch assigned list; (2) display R and S for A/B; (3) choose one returned queue; (4) fetch its desk snapshot; (5) render FIFO waiting head, waiting count, active entry and capacity 0/1 or 1/1; (6) switching queue loads its own state and controls. **Alternatives/errors:** no assignments gives list [] and “No assigned queues”; 401 returns sign-in, 403 safe forbidden, network/server error offers retry. A supplied foreign UUID cannot force desk access.

**Outputs/postconditions:** 200 list and authorized snapshot, no DB mutation, no transition, no audit insert. **Tests:** L7-001/002/007/016/017; original TEST-010/011/055/057 and UI permissions tests require revised A/B fixtures. Verify the existing dynamic selector with both queues.

## 4. L7-FEAT-02 Call next (F-05)

**Requirements:** L7-FR-02/07/08/09; L7-PR-01/03. **Actors/authorization:** common contract in §2, applied to the target queue. **Preconditions:** OPEN queue, no CALLED/SERVING and at least one WAITING. **Inputs:** call-next endpoint, queue UUID, `{}`. **Authorization processing:** repeat the target-assignment check inside the transaction.

**Main flow:** (1) lock queue row; (2) recheck actor/assignment and queue OPEN; (3) inspect combined active slot; (4) select WAITING smallest sequence; (5) validate WAITING→CALLED; (6) update status/calledAt, append CALLED event with current actor; (7) commit; (8) return DTO and refresh desk. **Alternatives/errors:** closed/paused 409 QUEUE_NOT_OPEN; occupied 409 SERVICE_SLOT_BUSY; empty 409 QUEUE_EMPTY; invalid authorization common errors; transaction/event failure rolls back.

**Outputs/postconditions:** exactly one head CALLED, one event, calledAt server time; all other waiting entries/order/sequence and counters unchanged. **State/audit:** WAITING→CALLED, event CALLED, actor=request principal. **Tests:** L7-001/002/011/013/015/019/020; original TEST-032–034/040/044/056.

## 5. L7-FEAT-03 Start service (F-05)

**Requirements:** L7-FR-03/05–09. **Actors:** any operator assigned to stored entry queue, independent of call actor. **Preconditions:** existing CALLED entry, authenticated active OPERATOR and target assignment. **Inputs:** start-service endpoint, entry UUID, `{}`. **Authorization:** resolve stored queue; never use caller-provided queue or previous caller identity.

**Main flow:** (1) resolve queue and lock it; (2) revalidate actor/assignment; (3) re-read current status; (4) require CALLED→SERVING; (5) guarded update status/servingAt and append STARTED event for this operator; (6) commit and return DTO; (7) refresh. **Alternatives/errors:** missing/malformed entry 404; any other source status 409 INVALID_TRANSITION; missing scope/session/role as common contract; failure rolls back.

**Outputs/postconditions:** SERVING occupies same queue slot; existing calledAt unchanged; servingAt and one STARTED event written atomically. **State/audit:** CALLED→SERVING, actor=starting operator. **Tests:** L7-003/005/008/010/012/018/020; original TEST-035/037 and repeated-transition test.

## 6. L7-FEAT-04 Complete service (F-05)

**Requirements:** L7-FR-04–09. **Actors:** any operator assigned to stored entry queue, independent of call/start actors. **Preconditions:** existing SERVING entry and valid identity/scope. **Inputs:** complete endpoint, entry UUID, `{}`. **Authorization:** entry-derived target assignment and transaction recheck.

**Main flow:** (1) lock target queue; (2) recheck actor/assignment; (3) re-read status; (4) require SERVING→COMPLETED; (5) update completedAt/status and append COMPLETED event for current operator atomically; (6) commit/return DTO; (7) refresh. **Alternatives/errors:** 404 missing entry; WAITING/CALLED/terminal sources 409 INVALID_TRANSITION; common authorization and rollback behavior.

**Outputs/postconditions:** COMPLETED record/history retained; same queue service slot free; calledAt/servingAt/number/queue/customer unchanged; next WAITING remains uncalled until explicit call-next. **State/audit:** SERVING→COMPLETED, actor=completing operator. **Tests:** L7-004/005/009/010/012/018/020; original TEST-036/037/042.

## 7. L7-FEAT-05 Cross-operator handoff

**Requirements:** L7-FR-02–08. **Actors:** A/B both assigned to entry queue. **Preconditions/inputs:** customer has joined with valid routing; OPEN idle queue; three independently authenticated POST actions from §§4–6. No new handoff endpoint, token, service-owner or reassignment request.

**Main flow/example:** customer joins R (partySize 4), yielding WAITING and JOINED(customer); A calls next, yielding CALLED and CALLED(A); B refreshes R desk and starts that same entry, yielding SERVING and STARTED(B); A refreshes and completes, yielding COMPLETED and COMPLETED(A). calledAt/servingAt/completedAt use each server action time; previous timestamps remain. Each action is a separate atomic transaction, not one transaction across the whole human workflow.

**Alternatives/errors:** reverse B→A→B and all 8 A/B triples in each queue are valid. Each step independently enforces current assignment/status; if assignment was removed, deny 403 even though the actor participated earlier; if another operator already performed the same step, reject stale repeat 409. **Outputs/postconditions:** completed entry and four correctly attributed retained events. No “must match previous actor” condition. **Tests:** L7-005/007/010/012/016; original TEST-041/043 extended.

## 8. L7-FEAT-06 Invalid transitions

**Requirements:** L7-FR-06/08. **Actors:** otherwise authenticated and assigned operator. **Preconditions:** known entry in a disallowed source state. **Inputs:** start from WAITING/SERVING/COMPLETED/CANCELLED/NO_SHOW or complete from WAITING/CALLED/COMPLETED/CANCELLED/NO_SHOW. **Authorization:** still mandatory before exposing/operating entry.

**Main rejection flow:** derive stored queue, lock, authorize, read status, reject before update/event insert. **Alternatives:** valid source follows §§5–6; call-next has no entry parameter and selects only WAITING, so it cannot directly reopen a terminal entry. **Outputs/errors:** 409 INVALID_TRANSITION, no status/timestamp/history mutation; terminal-only idle queue call returns QUEUE_EMPTY. **Postconditions/state/audit:** no transition and no event. **Tests:** L7-008/009/018, original TEST-037/042/046/049.

## 9. L7-FEAT-07 Unauthorized actions

**Requirements:** L7-FR-09. **Actors:** anonymous, expired/revoked/inactive account, CUSTOMER, unassigned OPERATOR. **Preconditions/inputs:** existing target entry/queue and direct list/desk/action requests, including forged claims. **Authorization:** common session/role/target rules; list itself needs OPERATOR but no specific queue pair.

**Main rejection flow:** session check → role check → for desk/action assignment guard; entry action resolves persisted queue. **Alternatives:** a valid role/assignment proceeds under earlier workflows; no-assignment operator list returns 200 []. **Errors/outputs:** 401 UNAUTHENTICATED; customer 403 FORBIDDEN; missing pair 403 QUEUE_ACCESS_DENIED; malformed/missing entry 404. No operational data leak, status change or event. **State/postconditions/audit:** unchanged queue/service state and history. **Tests:** L7-006/007/016 and preserved TEST-005/012/013/038/039 with genuinely unassigned fixture.

## 10. L7-FEAT-08 Concurrent conflicting requests

**Requirements:** L7-FR-07/08; L7-PR-01/03. **Actors:** A and B with distinct valid sessions and both target assignments. **Preconditions:** same CALLED entry (start race), SERVING entry (complete race), or OPEN idle queue with two WAITING (call race). **Inputs:** two same-stage requests released together; no automatic retries. **Authorization:** both independently checked, including inside locked transaction.

**Main flow:** lock serializes queue requests; first validates and commits one transition/event; second re-reads new state, fails transition or occupancy check. **Alternative:** operations on distinct R/S queue rows may both succeed independently. Different-stage actions may serialize validly; this contract does not require rejecting valid later stages just because requests overlapped.

**Outputs:** identical-stage race returns one 200 plus one 409 INVALID_TRANSITION; call race returns one 200 plus one 409 SERVICE_SLOT_BUSY. **Postconditions/state/audit:** one resulting transition and one actor-attributed event per winning stage; no event attributed to loser; no second active entry. Refresh both desks after conflict. **Tests:** L7-010/011/015/019/020; original TEST-040/056 and existing same-operator duplicate test are regression foundations, not proof of new shared setup.

## Revision history

| Version | Date | Revision | Acceptance |
| --- | --- | --- | --- |
| 1.0.0 | 23 November 2026 | Initial repository-grounded Lab 7.1 revision | PENDING teammate review |
| 1.1.0 | 27 November 2026 | Referenced authoritative SRS and tightened shared workflow wording; API and feature coverage retained | PENDING teammate review |
