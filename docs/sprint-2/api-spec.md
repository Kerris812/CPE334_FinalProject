# Sprint 2 API specification

[Engineering specification](specification.md) · [Sprint 1 API](../sprint-1/api-spec.md) · Proposed for review

## Common contract

All paths below are relative to `/api/v1`. Private routes use the existing session cookie, role and assignment guards and `Cache-Control: no-store`. POST requires the configured Origin and application/json. Send an empty JSON object for bodyless actions. For new or revised bodies, reject unknown fields and non-object/null/array bodies with 422. UUID path parameters follow existing queue/entry handling. Validate authorization before reporting entry state or conflicts. Resolve entry queue from storage. All timestamps are UTC ISO 8601 strings or explicit null; omit no promised field. No new query parameters. Successful responses use `{"data":...}`. Errors use `{"error":{"code":"INVALID_TRANSITION","message":"This queue entry cannot be moved to that status.","requestId":"<uuid>"}}`. Optional details are allowlisted, as described below.

| HTTP | Codes and conditions |
| --- | --- |
| 400 / 413 / 415 | MALFORMED_JSON / PAYLOAD_TOO_LARGE (existing 16 KiB limit) / UNSUPPORTED_MEDIA_TYPE |
| 401 | UNAUTHENTICATED for missing, expired, revoked or inactive session |
| 403 | FORBIDDEN for wrong role or origin. QUEUE_ACCESS_DENIED for an operator outside target assignment. |
| 404 | QUEUE_NOT_FOUND or ENTRY_NOT_FOUND for malformed/missing path entity, also ENTRY_NOT_FOUND for foreign customer entry. |
| 422 | VALIDATION_ERROR for invalid body. Use `details.fields` keyed by field or form. |
| 409 | Endpoint-specific domain conflicts below. CONCURRENT_UPDATE for a known aborted lock/guard conflict without a more specific domain code. |
| 500 | INTERNAL_ERROR for unexpected or invariant failures. No DB details, reason text or secrets. |

Conflicts have no partial writes. Re-read after a conflict. A lost response can represent a committed write, so refresh before attempting a new action. Clients never auto-replay mutations.

## Customer endpoints

| Method/path | Input and checks | 200 data | Endpoint outcomes |
| --- | --- | --- | --- |
| GET /customer/entries/latest | CUSTOMER, current user's most recent entry by joinedAt DESC then ID DESC | PrivateEntry or null | Standard private read errors |
| GET /customer/entries/:entryId | CUSTOMER, own stored entry | PrivateEntry | Missing or foreign 404 |
| POST /customer/entries/:entryId/cancel | CUSTOMER, own stored entry, `{}` | PrivateEntry in CANCELLED | Foreign/missing 404, non-WAITING 409 INVALID_TRANSITION |

PrivateEntry retains id, queueCode, displayNumber, partySize, status, joinedAt, calledAt, servingAt and completedAt. Add cancelledAt, noShowAt, position and estimatedWaitMinutes (integer or null). Cancellation returns null position and ETA. Keep existing join payload and response unchanged, then refresh latest/detail for position. Counter identity, event actor and reason stay out of customer data. On each customer GET the server calculates position and ETA from one repeatable-read snapshot and a single server as-of time. The browser refreshes after join/cancel, on its visible 10-second poll and on visibility return. Time crossing the no-show threshold does not change persisted occupancy. ETA may change when operators act. Cancel changes state/time and inserts an event together under the lock protocol.

Example own cancellation (path UUID illustrative).

```http
POST /api/v1/customer/entries/10000000-0000-0000-0000-000000000001/cancel
Content-Type: application/json

{}
```

```json
{"data":{"id":"10000000-0000-0000-0000-000000000001","queueCode":"R","displayNumber":"R-0001","partySize":2,"status":"CANCELLED","joinedAt":"2026-11-28T10:00:00.000Z","calledAt":null,"servingAt":null,"completedAt":null,"cancelledAt":"2026-11-28T10:01:00.000Z","noShowAt":null,"position":null,"estimatedWaitMinutes":null}}
```

The same object is returned by both GET routes for this fixture. Before cancellation its timeline fields other than joinedAt are null, with status WAITING, position 1 and estimatedWaitMinutes 0 if a counter is free.

## Operator reads

| Method/path | Input and role | 200 data |
| --- | --- | --- |
| GET /operator/dashboard | OPERATOR, only assigned queues and counters eligible to at least one such queue | Dashboard |
| GET /operator/queues/:queueId/desk | OPERATOR scoped to specified UUID | Existing queue, waitingCount, activeEntry and nextWaiting plus activeEntries. activeEntry is first by ascending sequence or null. |

Dashboard contains `asOf`, `queues` ordered by code and `counters` ordered by code. Queue rows contain id, code, name, state, waitingCount, waitingEntries (FIFO array), activeEntries (ascending sequence), and nextWaitingEstimatedWaitMinutes (int/null). Waiting rows in both views keep the head fields `id,displayNumber,partySize,status`. Active rows use OperatorEntry below. A counter contains id, code, name, eligibleQueueIds (assigned subset ordered by queue code), busy and occupant. Occupant is `{queueId,entryId}` or null for free or out-of-scope occupancy. Both reads are repeatable-read snapshots. Desk denial uses the common queue errors. Existing GET /operator/queues is unchanged.

```http
GET /api/v1/operator/dashboard
GET /api/v1/operator/queues/20000000-0000-0000-0000-000000000001/desk
```

```json
{"data":{"asOf":"2026-11-28T10:00:00.000Z","queues":[],"counters":[]}}
```

An authorized operator with an empty OPEN R sees the following desk response.

```json
{"data":{"queue":{"id":"20000000-0000-0000-0000-000000000001","code":"R","name":"Queue R","state":"OPEN"},"waitingCount":0,"activeEntry":null,"nextWaiting":null,"activeEntries":[]}}
```

## Operator mutations

| Method/path | Body, validation and permissions | 200 and transaction | Conflict / rejection |
| --- | --- | --- | --- |
| POST /operator/queues/:queueId/call-next | Assigned OPEN queue. New UI sends `counterId` and `expectedEntryId` UUIDs together. Also accept just counterId or legacy `{}`, including absent body under the existing JSON content-type requirement. expectedEntryId alone is invalid. | OperatorEntry CALLED. Reserve explicit counter or lowest free eligible counter. Re-read FIFO head, update state/counter and event atomically. | 403 COUNTER_ACCESS_DENIED for nonexistent/ineligible well-formed counter. 409 QUEUE_NOT_OPEN, SERVICE_SLOT_BUSY if selected counter is occupied or none free, QUEUE_EMPTY without a preview and no head, QUEUE_HEAD_CHANGED if expected head differs or disappeared. |
| POST /operator/entries/:entryId/start-service | `{}`, assigned stored queue, CALLED | OperatorEntry SERVING, retain counter, STARTED event | 409 INVALID_TRANSITION |
| POST /operator/entries/:entryId/complete | `{}`, assigned stored queue, SERVING | OperatorEntry COMPLETED, clear counter, COMPLETED event | 409 INVALID_TRANSITION |
| POST /operator/entries/:entryId/cancel | `{"reason":"Customer requested cancellation"}`, assigned stored queue, WAITING. Apply BR-18 validation. | OperatorEntry CANCELLED, cancelledAt and event with reason, counter remains null | 422 VALIDATION_ERROR or 409 INVALID_TRANSITION |
| POST /operator/entries/:entryId/no-show | `{}`, assigned stored queue, CALLED with calledAt, eligible at action time | OperatorEntry NO_SHOW, noShowAt and event, clear counter | 409 INVALID_TRANSITION for wrong state/missing calledAt or NO_SHOW_TOO_EARLY before threshold. Early conflict includes `details.eligibleAt`. |

OperatorEntry retains `id, displayNumber, partySize, status, calledAt, servingAt, completedAt` and adds `counterId, cancelledAt, noShowAt`. CounterId represents current occupancy and is null on terminal responses. Audit retains the pre-release counter and actual actor. Domain checks for call run OPEN → counter eligibility/availability → FIFO head match/empty. Entry status is checked before elapsed time. Locks/guards and event insertion are as specified in [Part C](specification.md#part-c--system-level-sds).

```http
POST /api/v1/operator/queues/20000000-0000-0000-0000-000000000001/call-next
Content-Type: application/json

{"counterId":"30000000-0000-0000-0000-000000000001","expectedEntryId":"10000000-0000-0000-0000-000000000001"}
```

```json
{"data":{"id":"10000000-0000-0000-0000-000000000001","displayNumber":"R-0001","partySize":2,"status":"CALLED","counterId":"30000000-0000-0000-0000-000000000001","calledAt":"2026-11-28T10:00:00.000Z","servingAt":null,"completedAt":null,"cancelledAt":null,"noShowAt":null}}
```

For entry mutations use the same entry UUID under `/operator/entries/`, appending the action from the table. Example data changes to the response above, starting each example at its required source state:

| Request | Response field values that differ from the example |
| --- | --- |
| POST start-service `{}` | `status: "SERVING", servingAt: "2026-11-28T10:01:00.000Z"` |
| POST complete `{}` | `status: "COMPLETED", counterId: null, servingAt: "2026-11-28T10:01:00.000Z", completedAt: "2026-11-28T10:04:00.000Z"` |
| POST cancel with reason above, from WAITING | `status: "CANCELLED", counterId: null, calledAt: null, cancelledAt: "2026-11-28T10:01:00.000Z"` |
| POST no-show `{}`, at threshold | `status: "NO_SHOW", counterId: null, noShowAt: "2026-11-28T10:05:00.000Z"` |

```json
{"error":{"code":"NO_SHOW_TOO_EARLY","message":"This entry is not eligible for no-show yet.","requestId":"<uuid>","details":{"eligibleAt":"2026-11-28T10:05:00.000Z"}}}
```

## Public compatibility projection

`GET /public/queues/:queueId/board` is anonymous and accepts R/S or a queue UUID, with 404 QUEUE_NOT_FOUND otherwise. Count WAITING only. In one read snapshot pick the smallest sequence CALLED or SERVING, or return null for both scalar fields if none. The legacy response has exactly the four fields shown below and represents only one active number even when two counters serve the queue.

```http
GET /api/v1/public/queues/R/board
```

```json
{"data":{"queueCode":"R","calledNumber":"R-0001","serviceState":"SERVING","waitingCount":2}}
```

### Proposed additive projection — approval pending

If approved, the same endpoint also returns `activeEntries`, an array ordered by ascending queue sequence from the same snapshot as the scalar fields and count. Return `[]` when no entry is active. Each item has exactly `displayNumber` (string), `counterLabel` (configured public counter name, string) and `serviceState` (`CALLED` or `SERVING`). Include only entries in the requested queue. The scalar fields still represent the first item or are both null when empty. Neither projection exposes customer identities, private IDs (including entry, queue and counter IDs), audit actors, reasons or private timestamps.

```json
{"data":{"queueCode":"R","calledNumber":"R-0001","serviceState":"SERVING","waitingCount":2,"activeEntries":[{"displayNumber":"R-0001","counterLabel":"Counter 1","serviceState":"SERVING"},{"displayNumber":"R-0002","counterLabel":"Counter 2","serviceState":"CALLED"}]}}
```
