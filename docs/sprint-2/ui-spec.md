# Sprint 2 UI specification

[Engineering specification](specification.md) · [API](api-spec.md) · [Sprint 1 UI](../sprint-1/ui-spec.md) · Proposed for review

## Customer queue

Keep existing join, routing and status presentation. Render the customer's own number, queue, party size and lifecycle status. For WAITING, show “Position 3” and “Estimated wait: about 10 minutes” or “Estimated wait unavailable.” Use “Estimated wait: less than 1 minute” for zero and explain that the estimate can change as operators call, complete or manually mark no-show. The server calculates ETA when it reads the customer’s latest entry or detail. Render the returned value directly and refresh after successful join/cancel, every 10 seconds while visible, and on visibility return. After CALLED, SERVING or a terminal state, replace the wait panel with the current status and relevant timestamp. Show a join action after COMPLETED, CANCELLED or NO_SHOW. Status changes and error recovery always use server data.

For WAITING, “Cancel queue entry” opens a dialog identifying the number and confirming that cancelling loses the current place. Back dismisses and restores focus. Confirm disables resubmission while pending and sends only the entry identifier and empty JSON. On success show CANCELLED and refresh. Handle stale state by refreshing and informing the customer. Operator reason, actor information, and other customer details never appear.

## Unified operator dashboard

Display all assigned queues in one view, on desktop in adjacent sections and on narrow screens as stacked sections. Each queue shows code, state, WAITING count, a FIFO waiting list with party size and Cancel per row, next-waiting ETA, and all CALLED/SERVING entries with their counter. Show a shared counter section with name, availability and occupant number/status when in scope. Display “Occupied” without occupant details for out-of-scope occupancy.

Choose a free compatible counter within the queue section. Disable Call Next if the queue is non-OPEN, has no WAITING head, has no eligible free counter or no selection is valid. Show the current head and chosen counter before submitting. Start and Complete appear on the specific CALLED or SERVING entry with counter context and remain usable by any assigned operator. Availability changes or stale previews clear the selection when invalid and require confirmation before another call.

Cancel prompts for a single-line reason with a 200-code-point maximum and inline errors. Confirm shows the queue number. On success announce the cancelled number and remove it from the waiting list on refresh. For CALLED entries show the earliest no-show time and a disabled action until eligible. Use the server snapshot time plus monotonic time elapsed since receipt for the client countdown. A confirmation dialog identifies the customer number and counter to release. If the server rejects as premature, show the returned eligibility time and refresh. On success announce NO_SHOW and refresh. Time expiry enables the manual action and leaves the counter occupied. No show and Complete affect only their entry and counter.

## Resource and accessibility behavior

| State | Customer and operator behavior |
| --- | --- |
| Initial load | Show descriptive loading state. Controls require a valid snapshot. |
| Empty | Customer sees join form. Operator with no scope sees “No queues assigned.” Empty queues retain their headings and counter availability. |
| Successful action | Announce once, then immediately refresh the authoritative visible resource. Dashboard refresh covers all assigned queues/counters. Customer join/cancel refreshes latest or current detail. |
| Background changes | Reuse visible-only 10-second poll and refresh on visibility return. Use single-flight reads. If an action settles during a poll, queue a fresh post-action read and discard superseded responses. |
| Pending/transport failure | Prevent duplicate submissions. Offer refresh/retry for reads. Late or lost mutation responses require a fresh read before a new action. Preserve current role-scoped data only as visibly stale, with actions disabled until refresh. |
| Conflict | Explain busy counter, changed head, changed entry status or early no-show in context. Refresh before re-enabling actions. Keep cancellation input for correction while target still eligible. |
| Authorization | Clear private state on 401 and present sign-in. On 403 remove affected content, refresh authorized scope or show access denied if the role is invalid. |
| Validation | Place reason errors by the input and preserve text. Render all user text as text. |

Support 320 CSS px without horizontal page scroll and test 1280 CSS px on desktop. Use headings, semantic lists, explicit counter and queue labels, keyboard access and visible focus. State text complements color. Announce results via a polite status region, reserving alerts for actionable errors. Trap focus in confirmation dialogs, restore focus on dismiss, and move focus to the affected section heading when the original control disappears. Polling preserves focus and avoids repetitive announcements. The anonymous board follows the projection described below.

## Anonymous public board

The legacy board displays one active number and service state. While two counters serve the same queue, it shows only the lowest-sequence active entry. The WAITING-only count is independent of that display.

**Proposed, pending approval.** When the API supplies `activeEntries`, render one row per active entry in API order with its display number, counter label and service state. When the array is empty, show the existing empty state. When the array is absent, use the legacy scalar display. Keep the WAITING-only count visible in every state. Only the allowlisted public fields appear, including in accessible text. Customer identities, private IDs, audit actors and reasons are excluded.
