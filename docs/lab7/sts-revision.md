# Lab 7 Software Test Specification Revision

> Version: 1.1.0 | Date: 27 November 2026 (Asia/Bangkok) | Group: NaiCha, 67070503456 / 67070503479 

## 1. Test basis and protocol

L7-STS 1.1.0 revises affected `docs/sprint-1/tests.md` (Required test cases; Issue08 TEST-052–057) and original F-02/F-05 acceptance/test mappings. Status of every case: **SPECIFIED / NOT EXECUTED**. No PASS/FAIL result is assigned. Namespaced `L7-001` onward avoid collisions with original TEST-001–057 and preserve the requested Lab 7 case names. Future executable test names should include these exact IDs. No executable tests are created in Issue 7.1.

All cases use isolated real PostgreSQL with existing migrations, synthetic active A/B and customer accounts, deterministic fixture IDs/sequences and distinct customer per concurrent active entry. A/B each have R/S assignments under approved setup, except denial/old-code setup cases. U denotes an independently created active unassigned OPERATOR, never B by assumption. Session creation precedes snapshots. Each scenario is reset independently; API/E2E sharing a DB run sequentially. Existing reserved enums may be inserted as test fixtures only, not exposed as new application workflows.

Every POST uses `/api/v1`, the configured allowed Origin, JSON and the specified session. Service bodies are `{}` except explicit spoof variants; customer join body is `{partySize: value}`. Queue IDs come from persisted R/S queue lookup; entry IDs from fixtures/API. The common error oracle asserts status/code/safe message/requestId and absence of private fields/stack/SQL. Mutation success asserts full operational entry DTO from Feature SDS §2.

“Unchanged snapshot” means compare ordered persisted queues (state/counter), entries (all identity/status/timestamp fields), events (IDs/actors/types/from/to/times/reason), and assignments; include users/sessions where seed/persistence is tested. Exclude the test's deliberate setup changes and dynamic error requestId. Rejections add no transition events. During a race compare final state with exactly one winner, rather than expecting the loser to restore the pre-race state. Event chains are checked by causal stage and IDs, allowing equal timestamps at clock resolution; no assumption that millisecond timestamps always differ.

## 2. Requirement→acceptance→test traceability

Acceptance criteria are defined authoritatively in [SRS §5](srs-revision.md#5-acceptance-criteria). The matrix below links those criteria to the original sources and future test cases; test-case criterion fields reference the same SRS definitions.

| Revised SRS requirement | Original source / approved extension | Acceptance criteria | STS cases |
| --- | --- | --- | --- |
| L7-FR-01 | FR-03/04, D-20 | L7-AC-01, L7-AC-13, L7-AC-15 | L7-001, L7-002, L7-007, L7-017 |
| L7-FR-02 | FR-09, BR-01/02 | L7-AC-02, L7-AC-09, L7-AC-11 | L7-001, L7-002, L7-011, L7-013, L7-015 |
| L7-FR-03 | FR-10 | L7-AC-03, L7-AC-06 | L7-003, L7-005, L7-008, L7-010, L7-018 |
| L7-FR-04 | FR-11 | L7-AC-04, L7-AC-06 | L7-004, L7-005, L7-009, L7-010, L7-018 |
| L7-FR-05 | FR-09–12 plus TA handoff approval | L7-AC-05 | L7-005, L7-012 |
| L7-FR-06 | BR-08/26 | L7-AC-06 | L7-005, L7-008, L7-009, L7-018 |
| L7-FR-07 | BR-16, NFR-05 | L7-AC-07, L7-AC-11 | L7-010, L7-011, L7-015, L7-019 |
| L7-FR-08 | FR-12, BR-17, NFR-13 | L7-AC-08 | L7-012, L7-020 |
| L7-FR-09 | FR-01–03, BR-09/11/13 | L7-AC-12, L7-AC-13, L7-AC-14 | L7-006, L7-007, L7-016 |
| L7-PR-01 | BR-01/02/05 | L7-AC-02, L7-AC-09 | L7-001, L7-002, L7-013 |
| L7-PR-02 | BR-03 and Issue08 routing | L7-AC-10, L7-AC-15 | L7-014, L7-017, L7-018 |
| L7-PR-03 | BR-07, D-07/26 | L7-AC-07, L7-AC-11 | L7-010, L7-011, L7-015, L7-019 |
| L7-PR-04 | All unaffected Sprint 1 requirements, SRS §4 | L7-AC-15 | L7-016, L7-017, L7-018, L7-019, L7-020 |

## 3. Original test expectations and regression selection

| Existing records / actual test source | Future specification treatment |
| --- | --- |
| TEST-009/053; `server/tests/api/database.test.ts`, `party-routing.test.ts` | Change two designated pairs to four approved seeded pairs; preserve account/queue counts, rerun safety, history and unknown-scope failure. Opposite R/S pair is now valid, so old contradictory fixture must use outside-approved scope |
| TEST-010/011/055; `server/tests/api/authorization.test.ts`, `party-routing.test.ts` | A/B list R/S and are allowed crossed actions; retain unauthorized-action assertions using independent U or missing target pair. Forged identity remains ineffective |
| TEST-039; `server/tests/api/operator-workflow.test.ts` | Executable test already creates unrelated unassigned operator: retain. Original STS/AC-039 A/B-exclusive wording superseded, not the denial property |
| Unnumbered guard cases; `server/tests/api/permission-guards.test.ts` | Replace B-as-unassigned fixture with truly unassigned U; keep revocation/role-disable/ownership assertions |
| TEST-035/036/040/041/043/056/057; operator-workflow/party-routing API and operator/sprint1 E2E | Extend to crossed actors, handoff, per-step identity, mixed-actor races and both queue selectors; do not remove original valid same-actor paths |
| `client/tests/e2e/sprint1-journey.spec.ts` | B is currently used to assert denied R access: use U after revision; preserve customer isolation/public privacy/persisted completion checks |
| UI `operator-desk.test.tsx`, `permissions.test.tsx`; E2E `operator-workflow.spec.ts`, `party-routing.spec.ts` | Verify R/S options for both A/B; retain empty assignments, pending gate, 403/409 handling, queue switching and status-only action controls |
| Unchanged TEST-001–008/012–031/032–038/040–049/052/054 and unaffected portions of 056/057 | Keep original assertions for auth, join/duplicates, numbering, own-entry privacy, public allowlist/counts, FIFO, stage/terminal guards and independent queue locks; revised scope data must not hide unrelated failures |

Later execute appropriate unit/API/UI/E2E suites and both builds using package.json commands (listed in impact analysis §7), with actual tested SHA, configured test DB evidence and genuine failed/skipped counts. Original Sprint 1 recorded results are historical, not Lab 7 evidence. This STS does not assert current test-run health.

## 4. Detailed test specifications

### L7-001: Operator A calls next in Queue S

Status: SPECIFIED / NOT EXECUTED.

| Field | Specification |
| --- | --- |
| Requirement reference | L7-FR-01/02/09; L7-PR-01/03 |
| Acceptance criteria | L7-AC-01, L7-AC-02 |
| Category | API + UI/E2E |
| Objective | Demonstrate newly assigned cross-queue call. |
| Preconditions | Approved setup has A/S; OPEN idle S with two API-joined customers size 5 and 8, increasing sequences s1<s2. |
| Test data and inputs | A session; S UUID; call-next `{}`. |
| Detailed steps | 1. Authenticate A; GET assigned queues and assert codes R/S. 2. Select S and GET desk. 3. POST S call-next. 4. Read response, entry rows and events. 5. Refresh A desk. |
| Expected response | 200; returned ID is S head, status CALLED; list includes both codes and desk shows that entry. Also retain original A/R call coverage through L7-005/013. |
| Expected database/state effect | Only s1 changes to CALLED/calledAt; s2 stays WAITING; counts 1 WAITING and 1 active. |
| Expected audit effect | One new CALLED event for s1, actor A, WAITING→CALLED, event time equals calledAt. |
| Boundary/invalid case | A outside former designated R; no bypass of assignment. |
| Regression relationship | Replaces exclusive A/S denial in TEST-055; extends TEST-032/057. |

### L7-002: Operator B calls next in Queue R

Status: SPECIFIED / NOT EXECUTED.

| Field | Specification |
| --- | --- |
| Requirement reference | L7-FR-01/02/09; L7-PR-01/03 |
| Acceptance criteria | L7-AC-01, L7-AC-02 |
| Category | API + UI/E2E |
| Objective | Demonstrate reverse cross-queue call. |
| Preconditions | Approved setup has B/R; OPEN idle R; two joined customers size 1 and 4, r1<r2. |
| Test data and inputs | B session; R UUID; call-next `{}`. |
| Detailed steps | 1. Authenticate B and assert assigned codes R/S. 2. Select R, read desk. 3. POST R call-next. 4. Verify head response and DB. 5. Refresh B desk. |
| Expected response | 200 CALLED for r1; both queues selectable by B. Also retain original B/S call coverage through L7-005/013. |
| Expected database/state effect | Only r1 changes; r2 WAITING; queue counter/identities unchanged by call. |
| Expected audit effect | Exactly one CALLED(B) for r1 and no call event for r2. |
| Boundary/invalid case | B outside former S scope, but now validly assigned. |
| Regression relationship | Replaces B/R denial assumptions in TEST-011/055; TEST-039 generic unassigned test remains. |

### L7-003: Operator A starts service in Queue S

Status: SPECIFIED / NOT EXECUTED.

| Field | Specification |
| --- | --- |
| Requirement reference | L7-FR-03/05/06/08/09 |
| Acceptance criteria | L7-AC-03, L7-AC-06 |
| Category | API integration |
| Objective | Verify crossed actor can start without owning call. |
| Preconditions | Approved assignments; S head CALLED by B through API; snapshot calledAt and existing events. |
| Test data and inputs | A session; CALLED S entry UUID; start-service `{}`. |
| Detailed steps | 1. Read A S desk. 2. POST start-service as A. 3. Fetch persisted entry/events and refresh desk. 4. Repeat same scenario on R and with B for all actor×queue start combinations using fresh entries. |
| Expected response | 200 with correct entry ID/status SERVING and servingAt ISO UTC. |
| Expected database/state effect | calledAt preserved; servingAt set; still exactly one S service slot occupied. |
| Expected audit effect | One appended STARTED event by current actor A (or B in variant); CALLED→SERVING, occurrence equals servingAt. |
| Boundary/invalid case | Starter differs from caller; queue membership comes from stored entry. |
| Regression relationship | Extends TEST-035 and does not weaken original status checks. |

### L7-004: Operator B completes service in Queue R

Status: SPECIFIED / NOT EXECUTED.

| Field | Specification |
| --- | --- |
| Requirement reference | L7-FR-04/05/06/08/09 |
| Acceptance criteria | L7-AC-04, L7-AC-06 |
| Category | API integration |
| Objective | Verify crossed actor can complete independently. |
| Preconditions | Approved assignments; R entry SERVING after A call/start; capture timestamps/history. |
| Test data and inputs | B session; R entry UUID; complete `{}`. |
| Detailed steps | 1. Read B R desk. 2. POST complete as B. 3. Inspect entry/events and refresh desk. 4. Repeat fresh scenarios for both A/B×R/S complete combinations. |
| Expected response | 200 COMPLETED, completedAt ISO UTC, same ID/number. |
| Expected database/state effect | calledAt/servingAt unchanged; completion set; R active count zero; no automatic next call. |
| Expected audit effect | One appended COMPLETED(B), SERVING→COMPLETED, occurrence equals completedAt; analogous current actor in variants. |
| Boundary/invalid case | Completer need not be caller or starter. |
| Regression relationship | Extends TEST-036; original valid A/R and B/S paths retained. |

### L7-005: Cross-operator lifecycle and all authorized handoff combinations

Status: SPECIFIED / NOT EXECUTED.

| Field | Specification |
| --- | --- |
| Requirement reference | L7-FR-02/03/04/05/06/08 |
| Acceptance criteria | L7-AC-03, L7-AC-04, L7-AC-05, L7-AC-06 |
| Category | API integration + three-context E2E |
| Objective | Demonstrate A calls, B starts, A completes and full actor independence. |
| Preconditions | Approved setup, distinct A/B sessions plus customer; OPEN idle R or S. |
| Test data and inputs | Customer partySize 4 for R or 5 for S; all 8 triples from {A,B}³ per queue. |
| Detailed steps | 1. Customer joins target queue. 2. Chosen caller calls next. 3. Starting actor refreshes same queue then starts returned entry. 4. Completing actor refreshes and completes it. 5. Customer refreshes own entry. 6. Repeat all triples with fresh fixtures in each queue; explicitly capture A/B/A and B/A/B. |
| Expected response | Join 201, each service action 200; status progression WAITING,CALLED,SERVING,COMPLETED; customer sees COMPLETED. |
| Expected database/state effect | One retained entry/number/queue/customer; timestamps set once in order; slot free after completion. |
| Expected audit effect | JOINED(customer), CALLED(chosen caller), STARTED(chosen starter), COMPLETED(chosen completer), exact from/to chain. |
| Boundary/invalid case | Handoff, same-actor paths and reverse handoff; no caller ownership rule. |
| Regression relationship | Extends TEST-041/043/057; preserves original journeys. |

### L7-006: Customer cannot invoke operator actions

Status: SPECIFIED / NOT EXECUTED.

| Field | Specification |
| --- | --- |
| Requirement reference | L7-FR-09; L7-PR-04 |
| Acceptance criteria | L7-AC-12 |
| Category | Negative API/security |
| Objective | Verify backend role denial independent of UI and spoofed claims. |
| Preconditions | Customer C active session; R/S existing entries; separate fresh valid-state fixture per action. |
| Test data and inputs | Customer session; list/desk/call/start/complete; forged role=OPERATOR and actor/queue headers/query/body. |
| Detailed steps | 1. Snapshot operational DB after session creation. 2. GET operator list and each desk. 3. POST each action in R and S with correct Origin/JSON, first plain then forged claims. 4. Compare state after each request and inspect error bodies. |
| Expected response | Every request 403 FORBIDDEN, safe envelope, no operational data. |
| Expected database/state effect | Entire operational snapshot unchanged; assignment rows unchanged. |
| Expected audit effect | No new transition events. |
| Boundary/invalid case | Wrong role even if client sends A/B identity or known entry UUID. |
| Regression relationship | Preserves TEST-012/013/038 and UI permissions coverage. |

### L7-007: Unassigned operator and assignment revocation remain denied

Status: SPECIFIED / NOT EXECUTED.

| Field | Specification |
| --- | --- |
| Requirement reference | L7-FR-01/09 |
| Acceptance criteria | L7-AC-01, L7-AC-13 |
| Category | Negative API/security |
| Objective | Retain scope checks after granting A/B both queues. |
| Preconditions | Create active OPERATOR U with no assignments; separate V assigned R only; target entries ready for each action. |
| Test data and inputs | U/V sessions; R/S desk and action IDs; forged operatorId=A, queueId=R on S entry actions. |
| Detailed steps | 1. U GET list must return []. 2. U attempts each desk/call/start/complete in both queues. 3. V attempts S desk/actions while assigned only R. 4. In isolated fixture remove B/S, keep B session and repeat S requests. 5. Use valid entry source states to avoid confusing authorization failure with transition failure. |
| Expected response | Lists filter assignments; every unauthorized desk/action is 403 QUEUE_ACCESS_DENIED even with forged claims. |
| Expected database/state effect | No unauthorized writes; compare to snapshot after deliberate fixture revocation, not before it. |
| Expected audit effect | No denied transition events; historical actors remain unchanged. |
| Boundary/invalid case | Missing target pair, no pairs, revoked pair and entry-derived target mismatch. |
| Regression relationship | Preserves generic TEST-039; replaces B-as-unassigned fixtures in authorization/permission-guards and E2E journey. |

### L7-008: Reject start from WAITING

Status: SPECIFIED / NOT EXECUTED.

| Field | Specification |
| --- | --- |
| Requirement reference | L7-FR-03/06/08 |
| Acceptance criteria | L7-AC-06 |
| Category | Negative API/domain |
| Objective | Prevent skipping call step. |
| Preconditions | Both operators assigned; one WAITING R entry and fresh equivalent S entry, joined through API. |
| Test data and inputs | A then B independently POST start-service on WAITING UUID. |
| Detailed steps | 1. Snapshot after join. 2. Start WAITING as A. 3. Verify rejection and unchanged snapshot. 4. Start same still-WAITING entry as B. 5. Repeat for S. |
| Expected response | 409 INVALID_TRANSITION for every request. |
| Expected database/state effect | Entry WAITING; calledAt/servingAt/completedAt remain null; queue/number/counter unchanged. |
| Expected audit effect | Only existing JOINED event, no STARTED. |
| Boundary/invalid case | WAITING→SERVING forbidden for each operator. |
| Regression relationship | Retains/expands TEST-037. |

### L7-009: Reject completion from CALLED and WAITING

Status: SPECIFIED / NOT EXECUTED.

| Field | Specification |
| --- | --- |
| Requirement reference | L7-FR-04/06/08 |
| Acceptance criteria | L7-AC-06 |
| Category | Negative API/domain |
| Objective | Prevent direct completion before service. |
| Preconditions | Assigned A/B; fresh WAITING then valid CALLED fixtures on R/S. |
| Test data and inputs | Both actors POST complete to each disallowed source. |
| Detailed steps | 1. Snapshot WAITING; request complete independently as A/B and compare. 2. Call via valid API, snapshot CALLED. 3. Request complete as A/B and compare. 4. Repeat for both queues. |
| Expected response | 409 INVALID_TRANSITION each time. |
| Expected database/state effect | WAITING/CALLED source unchanged; no completedAt or servingAt added. |
| Expected audit effect | No COMPLETED/STARTED event from rejections; valid prior CALLED retained. |
| Boundary/invalid case | CALLED→COMPLETED and WAITING→COMPLETED skip edges. |
| Regression relationship | Preserves TEST-037/046. |

### L7-010: Two operators race the same start or complete

Status: SPECIFIED / NOT EXECUTED.

| Field | Specification |
| --- | --- |
| Requirement reference | L7-FR-03/04/07/08; L7-PR-03 |
| Acceptance criteria | L7-AC-07 |
| Category | Real PostgreSQL concurrency |
| Objective | Prove one winner per same-stage transition and correct actor. |
| Preconditions | Both assignments/sessions valid; API-created CALLED entry; two independent HTTP clients; adequate pool capacity. |
| Test data and inputs | Barrier-released A/B start-service; later barrier-released A/B complete on same entry. |
| Detailed steps | 1. Record source/event count. 2. Release both start requests concurrently and await both. 3. Assert response multiset and persisted result. 4. Record winner actor from response/client pairing. 5. Release both completion requests; assert again. 6. Repeat fresh scenario on R and S; no retry of rejected request. |
| Expected response | Each phase exactly one 200 and one 409 INVALID_TRANSITION. Winner identity unspecified, response statuses deterministic. |
| Expected database/state effect | After phase 1 SERVING; after phase 2 COMPLETED; one timestamp update per phase; no duplicate slot or lost history. |
| Expected audit effect | Exactly one STARTED and one COMPLETED added; each actorId matches that phase winner, not assumed same actor. |
| Boundary/invalid case | Same entry/stage overlapping requests; loser must see committed source-state change. |
| Regression relationship | Extends existing same-operator repeated simultaneous test; separate from same-queue calls TEST-040. |

### L7-011: Both operators race call-next on one queue

Status: SPECIFIED / NOT EXECUTED.

| Field | Specification |
| --- | --- |
| Requirement reference | L7-FR-02/07/08; L7-PR-01/03 |
| Acceptance criteria | L7-AC-02, L7-AC-07, L7-AC-11 |
| Category | Real PostgreSQL concurrency |
| Objective | Preserve FIFO and shared single slot under distinct-operator calls. |
| Preconditions | OPEN idle target R/S; two WAITING entries with sequence q1<q2; both actors assigned. |
| Test data and inputs | Two simultaneous call-next requests, one A and one B. |
| Detailed steps | 1. Snapshot heads/count/events. 2. Barrier-release A and B call-next against same queue. 3. Await both, match success client to actor. 4. Query active/waiting/events. 5. Repeat fresh scenario for other queue. 6. Stress variant: 20 requests alternating A/B per queue with two or more WAITING. |
| Expected response | Pair: one 200 for q1, one 409 SERVICE_SLOT_BUSY. Stress: one 200 and 19 busy conflicts per queue. |
| Expected database/state effect | Exactly q1 CALLED; q2 WAITING; no new sequence/counter allocation; active combined count one. |
| Expected audit effect | One appended CALLED event on head by winning operator; none for loser/q2. |
| Boundary/invalid case | Two valid actors share scope; no double selection or skipped FIFO head. |
| Regression relationship | Extends TEST-040/056 beyond same assigned actor. |

### L7-012: Audit identity after handoff

Status: SPECIFIED / NOT EXECUTED.

| Field | Specification |
| --- | --- |
| Requirement reference | L7-FR-05/08 |
| Acceptance criteria | L7-AC-08 |
| Category | API + persistence audit |
| Objective | Assert exact actual operator on each stage, including forged actor claims. |
| Preconditions | Distinct A/B sessions and approved assignments; customer has no active entry; OPEN idle queue. |
| Test data and inputs | Join partySize 4 R (repeat 5 S); call A, start B, complete A; action bodies may include false operatorId. |
| Detailed steps | 1. Join through customer API. 2. Call A/start B/complete A with forged prior/other actor fields. 3. Fetch all events for that entry and correlate statuses and timestamps. 4. Reverse B/A/B on fresh entry. 5. Verify old events were not overwritten. |
| Expected response | All valid actions 200; no audit fields added to operational/public API payloads. |
| Expected database/state effect | Entry completed with each timestamp unchanged after its stage. |
| Expected audit effect | Exactly JOINED(customer,null,WAITING), CALLED(A,WAITING,CALLED), STARTED(B,CALLED,SERVING), COMPLETED(A,SERVING,COMPLETED); reversed actors in variant. Server event times equal corresponding transition times. |
| Boundary/invalid case | Do not infer eventType SERVING: actual type is STARTED; actor comes from session. |
| Regression relationship | Extends TEST-041/056; clarifies imprecise SERVING history wording in old AC-041. |

### L7-013: FIFO preserved independently of operator and insertion order

Status: SPECIFIED / NOT EXECUTED.

| Field | Specification |
| --- | --- |
| Requirement reference | L7-FR-02; L7-PR-01 |
| Acceptance criteria | L7-AC-02, L7-AC-09 |
| Category | Unit + API regression |
| Objective | Keep immutable sequence as sole FIFO order within each queue. |
| Preconditions | Each queue has three WAITING rows for distinct customers with sequences 3,1,2 inserted in that order; joinedAt values deliberately disagree; matching party sizes. |
| Test data and inputs | A and B alternate full call/start/complete cycles on each queue; sequences 1,2,3. |
| Detailed steps | 1. Assert unit selector yields 1 from [3,1,2]. 2. Call each queue and verify head sequence 1. 3. Start/complete head, call again with other actor and verify 2. 4. Finish and verify 3. 5. Verify no renumbering and other queue unaffected. |
| Expected response | Each call 200 selecting ascending sequence, regardless of inserted time or acting operator. |
| Expected database/state effect | Only selected head changes per cycle; immutable number/queue/sequence preserved. |
| Expected audit effect | One actor-attributed event per action; no event on uncalled head. |
| Boundary/invalid case | Out-of-order insertion and timestamps; no cross-queue ordering. |
| Regression relationship | Preserves TEST-032/045/056 and number-immutability assertion. |

### L7-014: Party-size boundaries, invalid types and queue mismatch

Status: SPECIFIED / NOT EXECUTED.

| Field | Specification |
| --- | --- |
| Requirement reference | L7-PR-02 |
| Acceptance criteria | L7-AC-10 |
| Category | Unit + API + UI regression |
| Objective | Keep actual validation/routing rules intact. |
| Preconditions | OPEN R/S; distinct fresh customer for each accepted join and no active entry for rejection fixture. |
| Test data and inputs | Valid 1,2,3,4→R and 5,6,7,8→S. Invalid 0,9,-1,1.5,"3",null,true,missing partySize; array/scalar body; unknown join property. Mismatch R with 5/8 and S with 1/4. |
| Detailed steps | 1. Apply unit validator/router to all values. 2. Submit each valid party to target queue via POST /queues/:queueId/entries. 3. Snapshot before each invalid/mismatched POST; assert no writes. 4. Verify customer UI selects R for 1/4 and S for 5/8 with no arbitrary fallback. 5. Check unavailable matching queue rejects safely. |
| Expected response | Valid 201 WAITING with correct queueId, partySize and number prefix. Invalid/mismatch 422 VALIDATION_ERROR with details.fields.partySize (unknown property uses fields.form). Valid-size unavailable queue 409 QUEUE_NOT_OPEN. |
| Expected database/state effect | Rejected join leaves entries/events/lastSequence unchanged. Accepted joins allocate unique immutable per-queue sequence; unrelated operator assignments unchanged. |
| Expected audit effect | One JOINED by each successful customer; none for rejected input. |
| Boundary/invalid case | Exact required boundaries 1/4/5/8; numeric strings are invalid, not coerced. |
| Regression relationship | Preserves TEST-018/048/052/054 and UI/E2E party-routing suites. |

### L7-015: One combined CALLED/SERVING slot per queue

Status: SPECIFIED / NOT EXECUTED.

| Field | Specification |
| --- | --- |
| Requirement reference | L7-FR-02/07; L7-PR-03 |
| Acceptance criteria | L7-AC-11 |
| Category | API + database invariant |
| Objective | Ensure more operators never create more service capacity. |
| Preconditions | R with one CALLED and one WAITING; S OPEN idle with WAITING; A/B assigned both. |
| Test data and inputs | Both actors attempt call R while CALLED, then while SERVING; independent S call. |
| Detailed steps | 1. Snapshot R after first valid call. 2. A and B separately call occupied R and compare snapshots. 3. Start active R entry and repeat. 4. B calls S while R remains busy. 5. Complete R active, then call R waiting. 6. In disposable DB verify direct attempt to create a second active row for a different customer (with distinct sequence/displayNumber and valid foreign keys) violates the retained service-slot partial unique index. |
| Expected response | R occupied calls 409 SERVICE_SLOT_BUSY; S idle call 200; later R call 200 only after completion. DB direct conflicting active insert rejected. |
| Expected database/state effect | At every checkpoint active count in each queue ≤1, combined over CALLED/SERVING; failed DB insertion transaction rolls back. |
| Expected audit effect | No events for busy requests; S/R successful actions append their own operator events. |
| Boundary/invalid case | CALLED and SERVING share same slot; R busy must not disable S. |
| Regression relationship | Preserves TEST-034/040 and migration-index assertions. |

### L7-016: Unaffected Sprint 1 security, privacy and persistence regression

Status: SPECIFIED / NOT EXECUTED.

| Field | Specification |
| --- | --- |
| Requirement reference | L7-FR-09; L7-PR-04 |
| Acceptance criteria | L7-AC-14, L7-AC-15 |
| Category | Regression unit/API/UI/E2E |
| Objective | Protect full dependent Sprint 1 behavior beyond shared actor positives. |
| Preconditions | Isolated migrated/approved-seeded DB; documented Node/env; named baseline suites; synthetic accounts/sessions. |
| Test data and inputs | Original unchanged AC/TEST cases plus amended exclusive-assignment fixtures listed in §3. |
| Detailed steps | 1. For list/desk/all three actions, separately use no cookie, expired cookie, revoked session and inactive account; assert 401 and no service mutation. 2. Execute selected unchanged auth, ownership, customer join/duplicates/concurrency/numbering, queue reads, public DTO and restart/persistence cases from §3. 3. Exercise UI loading/error/keyboard/360px controls and safe conflict refresh. 4. Record future commands, tested SHA and genuine runner counts. |
| Expected response | Security variants 401 UNAUTHENTICATED. Other unchanged cases retain original specified responses; foreign customer entry 404, duplicate join 409, public DTO exactly queueCode/calledNumber/serviceState/waitingCount. |
| Expected database/state effect | No rejected service writes; own completed entry survives restart and non-destructive setup; one active entry per customer across queues, numbers continue. |
| Expected audit effect | Denied service requests add no transition event; preserved workflow history unchanged across restart. |
| Boundary/invalid case | Anonymous/expired/revoked/inactive; privacy/ownership and unrelated-regression boundaries. |
| Regression relationship | Preserves original TEST-001–008/012–031/037–049/052/054/056/057, with explicit legitimate changes in §3; no results claimed here. |

### L7-017: Shared seed policy, repeatability and historical preservation

Status: SPECIFIED / NOT EXECUTED.

| Field | Specification |
| --- | --- |
| Requirement reference | L7-FR-01/09; L7-PR-02/04 |
| Acceptance criteria | L7-AC-01, L7-AC-15 |
| Category | Setup/API/PostgreSQL |
| Objective | Verify required assignment change without schema/history reset. |
| Preconditions | Disposable migrated DB, valid synthetic password env; separate fresh DB and old A/R B/S DB fixture with sessions, nonzero counters, paused queue and completed/history entry (including historical size outside current queue routing). |
| Test data and inputs | Run approved future seed function twice on each fixture; separate unexpected seeded-operator assignment outside R/S fixture. |
| Detailed steps | 1. Record old DB users/password hashes/flags/sessions/queues/counters/entries/events and assignments. 2. Run seed once then twice. 3. Assert exactly four approved seeded A/B×R/S pairs, no duplicates and unchanged existing rows. 4. Authenticate A/B and assert both lists/desks. 5. Restart and confirm data/assignments retained. 6. In separate fixture add unexpected outside-R/S seeded pair; assert proposed seed rejects atomically without deleting it. |
| Expected response | Approved existing/fresh setups succeed; rerun makes no extra changes; unexpected outside-scope seeded pair fails safely. Lists R/S for each A/B. |
| Expected database/state effect | Only missing approved pairs/accounts/queues created as applicable; historical IDs/numbers/partySize/actors/timestamps, queue state/counters and existing credentials untouched; no DDL migration required. |
| Expected audit effect | No service events generated by seed; historical event rows byte-for-byte equivalent in field comparison. |
| Boundary/invalid case | Old valid opposite assignment is now accepted; unexpected scope remains explicit failure. |
| Regression relationship | Revises TEST-009/053 seed expectations, retains idempotence/non-destructive and persistence obligations. |

### L7-018: Terminal and repeated transitions stay immutable

Status: SPECIFIED / NOT EXECUTED.

| Field | Specification |
| --- | --- |
| Requirement reference | L7-FR-06/08; L7-PR-04 |
| Acceptance criteria | L7-AC-06, L7-AC-15 |
| Category | Negative API/domain regression |
| Objective | Prevent reopening, duplicate completion and new reserved-state workflows. |
| Preconditions | Assigned A/B; separate R/S entries in COMPLETED, CANCELLED, NO_SHOW; another valid SERVING entry for duplicate-start check, isolated fixtures avoid slot conflicts. |
| Test data and inputs | Both actors start/complete each terminal entry; repeat start of SERVING; call queue with terminal-only entries. |
| Detailed steps | 1. Snapshot each source. 2. Attempt start/complete twice as A/B and compare each snapshot. 3. Start SERVING must reject. 4. Complete a valid SERVING entry once then repeat completion as other operator. 5. Call terminal-only idle OPEN queue. 6. Historical out-of-range WAITING entry may follow normal API call/start/complete without rerouting. |
| Expected response | Invalid requests 409 INVALID_TRANSITION; terminal-only call 409 QUEUE_EMPTY; valid historical lifecycle retains normal 200 transitions. |
| Expected database/state effect | Terminal rows/timestamps/identities unchanged by rejection; historical entry completes in stored queue with unchanged number/size. |
| Expected audit effect | No rejected events; successful historical lifecycle records actual per-step actor. |
| Boundary/invalid case | Completed re-entry, reserved enums and historically routed records. |
| Regression relationship | Preserves TEST-037/042/049 and Issue08 historical retention rule. |

### L7-019: Queue independence and stale-desk recovery across operators

Status: SPECIFIED / NOT EXECUTED.

| Field | Specification |
| --- | --- |
| Requirement reference | L7-FR-07; L7-PR-03/04 |
| Acceptance criteria | L7-AC-11, L7-AC-15 |
| Category | PostgreSQL + UI/E2E |
| Objective | Retain independent queues and actionable shared-session conflict behavior. |
| Preconditions | Both assignments and sessions; R/S each WAITING. Distinct DB connection holds R queue-row lock; pool has free connections. Separate UI scenario: A/B both loaded same CALLED R desk. |
| Test data and inputs | B calls S while R lock held; stale A start after B has started; explicit refresh/switch queue. |
| Detailed steps | 1. Acquire R FOR UPDATE with test connection and signal lock ready. 2. Submit S call and require completion before releasing R (bounded 3-second request deadline within 10-second lock transaction). 3. Release held lock in cleanup. 4. In fresh browser scenario B starts called R; stale A clicks Start before refresh (control network/polling deterministically). 5. Verify 409 handling refreshes A to SERVING; switch S and verify its own state. |
| Expected response | S call 200 while R held; stale A sees safe action-no-longer-valid feedback and authoritative SERVING desk; no duplicate transition; selector/control focus usable. |
| Expected database/state effect | No R change in lock variant; S head alone CALLED. UI variant one STARTED on R; selected queue IDs do not leak into wrong entry action. |
| Expected audit effect | S CALLED by B; R STARTED by B only in UI variant, no loser event. |
| Boundary/invalid case | Global-lock regression; stale cross-operator state and safe error recovery. |
| Regression relationship | Preserves TEST-056 lock-independence and TEST-043/057 plus NFR-15 UI conflict handling. |

### L7-020: Atomic rollback when audit event insertion fails

Status: SPECIFIED / NOT EXECUTED.

| Field | Specification |
| --- | --- |
| Requirement reference | L7-FR-08; L7-PR-04 |
| Acceptance criteria | L7-AC-08, L7-AC-15 |
| Category | PostgreSQL failure injection |
| Objective | Keep audit and lifecycle state atomic under either operator. |
| Preconditions | Disposable DB only; assigned A/B; fresh eligible WAITING/CALLED/SERVING entry for each action; baseline snapshots after fixture setup. |
| Test data and inputs | Test-only failure trigger rejects event insert for acting operator; call/start/complete. |
| Detailed steps | 1. Install scoped test event-failure trigger inside controlled isolated fixture. 2. Snapshot DB. 3. Submit valid call/start/complete in separate fixtures as A then B. 4. Assert safe response and snapshot equality. 5. Remove trigger in finally cleanup. 6. Retry normally and verify exactly one transition/event. |
| Expected response | Injected failure returns 500 INTERNAL_ERROR without internal DB text; subsequent normal valid request 200. |
| Expected database/state effect | Failed action leaves status, timestamps, sequence, counters and all existing events unchanged. |
| Expected audit effect | No partial event/state on failure; later success records actual operator once. |
| Boundary/invalid case | Audit failure must not silently commit lifecycle; no production DB use. |
| Regression relationship | Retains existing operator-workflow audit insert failure rollback test for both newly shared actors. |

## 5. Future RED/GREEN design and evidence sequence

After teammate accepts these contracts, choose a test of the **missing approved setup behavior** against actual prechange code `fc178ed639619e3e74a37724a0373e990839a0e8`. A suitable RED combines L7-017 and L7-001/002: run the old seed successfully with valid environment and real migrated isolated DB, assert that A/B each list both queues and can act in the opposite queue. Expected old behavior is only designated assignments and 403 QUEUE_ACCESS_DENIED for crossed actions. The missing shared assignment policy must cause the assertion failure, not a compile/setup error.

Pre-inserting all four assignments bypasses the missing seed requirement and may make existing generic handoff service tests already succeed; that is useful regression coverage but not evidence of the missing behavior. Likewise, making current seed throw solely because the fixture violates its old policy is insufficient on its own. Assert the approved output from valid setup. Record tested prechange implementation SHA separately from test commit SHA, source assertions, command/env basis and actual failed output. Then make the bounded seed/provisioning change and show the same test GREEN, preserving new tests and unchanged regressions. Never weaken customer/unassigned checks to make seed changes appear successful.

No test code, RED/GREEN output, implementation commit or deployment is part of this task. Test results, documentation review/merge and exact run provenance must be collected honestly in later Issues and embedded in the final PDF.

## Revision history

| Version | Date | Revision | Acceptance |
| --- | --- | --- | --- |
| 1.0.0 | 23 November 2026 | Initial repository-grounded Lab 7.1 revision | PENDING teammate review |
| 1.1.0 | 27 November 2026 | Referenced authoritative SRS and removed redundant criterion-only table; all 20 case specifications retained | PENDING teammate review |
