# Lab 7 SRS Revision: Shared Queue Operators

> Version: 1.1.0 | Date: 27 November 2026 (Asia/Bangkok) | Group: NaiCha, 67070503456 / 67070503479 
## 1. Authority, source and status

Revision L7-SRS 1.1.0, 27 November 2026. Source: `docs/sprint-1/specification.md`, Part A SRS (Functional requirements lines 113–140; Business rules 142–173; NFRs 175–193), Phase 0 decisions and Issue08 approved scope. Exact supersession boundaries are [README §4](README.md#4-contract-supersession-policy). TA change approved; this contract is PROPOSED until teammate acceptance. Normative “shall” clauses below specify behavior; transaction mechanisms belong to the System SDS.

## 2. Original-to-revised requirements

| Original ID/source | Accurate original paraphrase | Revised contractual section |
| --- | --- | --- |
| D-20; FR-04; Part A assumptions; Issue08 table | Seed A only R and B only S; repeat safely | §3 L7-FR-01 replaces exclusive policy; FR-04 retained with shared assignment set |
| D-09; FR-03; BR-11 | Only assigned operators may inspect/change a queue | §3 L7-FR-01/09 restate unchanged enforcement with multiple valid assignments |
| FR-09; BR-01/02 | Assigned operator calls oldest eligible WAITING entry | §3 L7-FR-02; eligible actors expanded by assignment policy |
| FR-10/11; BR-08/26 | Start CALLED, complete SERVING, terminal immutable | §3 L7-FR-03–06; explicit handoff added without changing chain |
| FR-12; BR-17; NFR-13 | Durable lifecycle history includes actor and server time | §3 L7-FR-08 explicitly applies to the actor of each handoff step |
| BR-16; NFR-05; Part E F-05 concurrency | Conflicting calls serialize, guarded transitions prevent repeats | §3 L7-FR-07 extends required verification to distinct operators |
| FR-02; BR-09/13; NFR-01 | Backend identity, roles and assignment protect operator actions | §3 L7-FR-09, no weakening |
| BR-01–07; FR-01/05–08/22–24; other unaffected requirements | FIFO, routing, capacity, privacy, numbering and persistence | §4 preservation clauses; no unrelated supersession |

Original IDs remain stable. The L7 IDs below identify the complete replacement/refinement clauses for this revision, rather than claiming new original Sprint 1 identifiers. Original AC-009–011 and exclusive A/B parts of AC-039 are superseded on acceptance; denial of truly unassigned operators remains.

## 3. Functional and integrity requirements

| Revision ID | Complete mandatory requirement | Acceptance criteria |
| --- | --- | --- |
| L7-FR-01 (FR-03/04, D-20) | The system shall persist valid assignments A→R, A→S, B→R and B→S. Both operators shall list and inspect both queues. Approved setup shall add missing approved assignments idempotently, without deleting existing legitimate records or resetting accounts, passwords, sessions, queue state/counters, entries or events. Other operators shall retain their actual assignment scope. | L7-AC-01, L7-AC-13, L7-AC-15 |
| L7-FR-02 (FR-09) | An authenticated active OPERATOR assigned to the target queue shall be able to call next there. The queue shall be OPEN, have no CALLED/SERVING entry, and contain an eligible WAITING entry; the lowest immutable sequence shall become CALLED. Success shall return the updated entry, set calledAt and append one CALLED event. Otherwise reject with the defined empty/busy/not-open error and no writes. | L7-AC-02, L7-AC-09, L7-AC-11 |
| L7-FR-03 (FR-10) | An authenticated active OPERATOR assigned to the entry's stored queue shall be able to change CALLED to SERVING. Success shall set servingAt and append exactly one STARTED event; all other source states shall be rejected without mutation. | L7-AC-03, L7-AC-06 |
| L7-FR-04 (FR-11) | An authenticated active OPERATOR assigned to the entry's stored queue shall be able to change SERVING to COMPLETED. Success shall set completedAt and append exactly one COMPLETED event, freeing that queue's service slot. All other source states shall be rejected without mutation. | L7-AC-04, L7-AC-06 |
| L7-FR-05 (FR-09–12 clarification; TA approval) | Permission to start or complete shall depend on current identity, target assignment and source status, not identity of the prior acting operator. Any A/B combination of call/start/complete shall be supported on R and S, including A→B→A and B→A→B. | L7-AC-05 |
| L7-FR-06 (BR-08/26) | The service lifecycle shall remain WAITING→CALLED→SERVING→COMPLETED, with only the named action for each edge. Skips, repeats and terminal reopening shall fail 409 INVALID_TRANSITION with unchanged entry timestamps/status and event history. CANCELLED and NO_SHOW enum values shall gain no new actions. Call-next shall never select a terminal entry. | L7-AC-06 |
| L7-FR-07 (BR-16, NFR-05) | Simultaneous conflicting requests shall preserve the single service slot. For two valid same-stage requests on one eligible entry exactly one shall commit and one shall fail with 409 INVALID_TRANSITION. For two calls on an OPEN idle queue with waiting work, exactly one shall commit, selecting the FIFO head, and one shall fail 409 SERVICE_SLOT_BUSY. No duplicate successful transition or event is permitted. Independent queue operations shall remain possible. | L7-AC-07, L7-AC-11 |
| L7-FR-08 (FR-12, BR-17, NFR-13) | Every successful operator action shall durably record the authenticated actor of that request, entry ID, event type, persisted from/to statuses and server occurrence time in the same atomic unit as the entry update. Handoff shall preserve separate actor identities. Rejection or audit-insert failure shall produce no partial entry/event changes. Historical event attribution shall remain unchanged. | L7-AC-08 |
| L7-FR-09 (FR-01–03, BR-09/11/13) | Every protected operator route shall authenticate the session and active account, require OPERATOR role and enforce actual target assignment for desk/actions. Entry actions shall derive queue from stored entry. Anonymous/expired/revoked/inactive requests shall return 401 UNAUTHENTICATED; customers 403 FORBIDDEN; operators missing target assignment 403 QUEUE_ACCESS_DENIED. Forged role, actor and queue input shall not grant permission. An operator without assignments shall receive an empty assigned list. | L7-AC-12, L7-AC-13, L7-AC-14 |

## 4. Explicitly preserved requirements

| ID | Complete preserved obligation | Original source | Acceptance |
| --- | --- | --- | --- |
| L7-PR-01 | FIFO shall remain ascending immutable per-queue sequence. Only WAITING is callable; queue must be OPEN and idle. Operator choice shall not change priority or numbering. | D-01/02/05/06; BR-01/02/05 | L7-AC-02, L7-AC-09 |
| L7-PR-02 | New joins shall accept numeric integer partySize 1–8 inclusive: 1–4 only R; 5–8 only S. Other values/types, wrong queue and unknown join properties shall be rejected with 422 VALIDATION_ERROR; a failed join shall not advance the counter or create entries/events. Existing historical entries shall not be rerouted or renumbered. | D-03; BR-03; Issue08 scope | L7-AC-10, L7-AC-15 |
| L7-PR-03 | A queue shall contain at most one entry in the combined set CALLED/SERVING. Occupied calls shall fail 409 SERVICE_SLOT_BUSY. This limit shall apply independently to R and S, regardless of number of assigned operators. | D-07/26; BR-07 | L7-AC-07, L7-AC-11 |
| L7-PR-04 | All unaffected Sprint 1 requirements shall remain valid: one WAITING/CALLED/SERVING entry per customer across queues; immutable unique numbers; own-entry privacy/foreign 404; exact public board allowlist; protected sessions/roles/origin; durable restart and non-destructive setup; accessible UI and safe conflict refresh. Only explicit exclusive assignment assumptions are replaced. No new cancellation, no-show, counter, priority or administration behavior is authorized. | FR-01/05–08/22–24; BR-04/05/10/12–15/26–28; NFR-01–07/09–13/15; Issue08 | L7-AC-15 |

## 5. Acceptance criteria

This section is the authoritative source for L7-AC-01–15. Definitions and identifiers are retained from the initial approved-change documentation; other documents reference these criteria without duplicating their complete definitions. TA change approval is recorded in [README §1](README.md#1-project-and-approved-change). Engineering contract acceptance remains PENDING.

| Identifier | Requirement | Expected observable behavior | Related SRS requirement | STS coverage |
| --- | --- | --- | --- | --- |
| L7-AC-01 | Shared assignments | A and B each have valid assignments to both R and S. The assigned-queue list and desk permit both; repeated approved setup produces four distinct A/B×R/S rows without resetting existing data. | FR-03/04; L7-FR-01 | L7-001, L7-002, L7-017 |
| L7-AC-02 | Call either queue | For each A/B×R/S combination, an OPEN idle queue with WAITING entries returns 200 and calls exactly its smallest-sequence WAITING entry. | FR-09; L7-FR-02 | L7-001, L7-002, L7-013 |
| L7-AC-03 | Start either queue | Either assigned operator starts a CALLED entry in either queue: 200 SERVING, one serving timestamp and one STARTED event. | FR-10; L7-FR-03 | L7-003, L7-005 |
| L7-AC-04 | Complete either queue | Either assigned operator completes a SERVING entry in either queue: 200 COMPLETED, one completion timestamp and one COMPLETED event. | FR-11; L7-FR-04 | L7-004, L7-005 |
| L7-AC-05 | Handoff | Every A/B choice for call/start/complete is permitted on both queues when each actor is assigned and the persisted source state is valid; prior actor identity does not confer ownership of service. | L7-FR-05 | L7-005 |
| L7-AC-06 | Transition enforcement | Only WAITING→CALLED through call-next, CALLED→SERVING through start-service and SERVING→COMPLETED through complete are allowed; skipping, repeating and reopening terminal states returns 409 INVALID_TRANSITION without writes. | BR-08/26; L7-FR-06 | L7-005, L7-008, L7-009, L7-018 |
| L7-AC-07 | Conflicting requests | Two authorized operators racing the same start or same complete produce exactly one 200 and one 409 INVALID_TRANSITION, one state change and one event for that stage. Racing calls produce one 200 and one 409 SERVICE_SLOT_BUSY on a nonempty idle queue. | BR-16; NFR-05; L7-FR-07 | L7-010, L7-011 |
| L7-AC-08 | Audit identity | Each successful call/start/complete records the authenticated actor for that request with entry, type, from/to status and server time in the same transaction; failures create no transition event or partial state. | FR-12; NFR-13; L7-FR-08 | L7-012, L7-020 |
| L7-AC-09 | FIFO | Each queue selects by immutable sequence ascending independently of insertion time, browser sort order or which operator acts. | BR-01/02; L7-PR-01 | L7-013 |
| L7-AC-10 | Party routing | New parties of integer size 1/4 join R; 5/8 join S; mismatches and invalid sizes return 422 VALIDATION_ERROR without state/counter/event change. All integer sizes 1–8 follow these ranges. | BR-03; L7-PR-02 | L7-014 |
| L7-AC-11 | Single active service | CALLED and SERVING share one slot per queue. Further calls in that queue return 409 SERVICE_SLOT_BUSY; the other queue remains independently usable. | BR-07; L7-PR-03 | L7-011, L7-015, L7-019 |
| L7-AC-12 | Customers denied | Customers receive 403 FORBIDDEN for list/desk/call/start/complete via direct HTTP, including forged role/actor/queue claims; no private queue data or service writes. | FR-02; BR-09; L7-FR-09 | L7-006 |
| L7-AC-13 | Unassigned operators denied | An active OPERATOR without target-queue assignment receives 403 QUEUE_ACCESS_DENIED for desk/call/start/complete; an operator with no assignments lists []; forged queue/actor claims cannot grant scope. | FR-03; BR-11; L7-FR-09 | L7-007 |
| L7-AC-14 | Authentication retained | Anonymous, expired/revoked-session or inactive-account requests to all protected operator routes return 401 UNAUTHENTICATED without operational data or service writes. | FR-01/02; BR-13; L7-FR-09 | L7-016 |
| L7-AC-15 | Sprint 1 compatibility | Unaffected authentication, customer privacy/ownership, duplicate-active-customer prevention, numbering, public DTO, persistence/restart, UI access and error recovery remain covered; revise only explicitly superseded exclusive-assignment expectations. | L7-PR-04 | L7-016, L7-017, L7-018, L7-019, L7-020 |

[STS §2](sts-revision.md#2-requirementacceptancetest-traceability) maps requirements and criteria to the detailed future test cases. The Feature and System SDS describe how to realize this contract; they may not relax these clauses.

## 6. Scope and boundary interpretation

This revision covers shared assignment/setup, queue selection, call/start/complete, handoff, audit and concurrency obligations. It does not authorize extra service capacity, multiple counters, administrator assignment UI, customer role expansion, priority, cancellation/no-show actions, queue-state administration, notifications, historical audit rewriting or unrelated later-sprint work. Issue 7.1 remains documentation only.

Protected entry actions on malformed or missing IDs return 404 ENTRY_NOT_FOUND without private disclosure. An OPEN idle queue with no WAITING entry returns 409 QUEUE_EMPTY; an occupied queue returns 409 SERVICE_SLOT_BUSY; a non-OPEN queue rejects new calls with 409 QUEUE_NOT_OPEN. Finishing valid active service in a non-OPEN queue remains permitted by the existing start/complete policy. See [Feature SDS §2](feature-sds-revision.md#2-common-api-and-workflow-contract) and §§4–9 for full request and error contracts.

The one-winner rule concerns conflicting attempts at the same transition. Different-stage requests may serialize into successive valid transitions if each observes its required persisted source state. No terminal entry is eligible for call-next; invalid start/complete sources remain governed by L7-FR-06.

## Revision history

| Version | Date | Revision | Acceptance |
| --- | --- | --- | --- |
| 1.0.0 | 23 November 2026 | Initial repository-grounded Lab 7.1 revision | PENDING teammate review |
| 1.1.0 | 27 November 2026 | Consolidated all 15 acceptance criteria and change boundaries into the authoritative SRS | PENDING teammate review |
