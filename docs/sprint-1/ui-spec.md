# ui-spec.md — Restaurant Queue User Interface Specification

> **Current app-wide visual system:** [docs/ui-spec.md](../ui-spec.md) supersedes the historical visual refinements below. API, authorization, ownership and workflow contracts remain unchanged; existing typography is frozen.

> **Status:** Engineering baseline dated 6 November 2026, with approved Issue08 scope revision. F01–F05 are implemented and locally verified on the Issue09 working tree on 7 November 2026. See [release verification](release-verification.md) and [acceptance coverage](acceptance-coverage.md). Peer review, branch integration, security risk resolution and publication are not asserted complete. Examples use synthetic data.

> **Current public-board presentation:** The public display uses cream page surfaces, a burgundy serif wordmark with a thin gold divider, white cards with burgundy top borders, segmented active navigation and quiet Back/Refresh controls. This supersedes the earlier full burgundy headers and compact 32–48px real-number presentation. Only actual called numbers use large type; empty/error states use descriptive text. Customer/operator workflows and their presentation remain unchanged by this revision.

> **Companion files:** [specification.md](specification.md) · [api-spec.md](api-spec.md) · [tests.md](tests.md) · [ui-spec.md](ui-spec.md).


## Team-approved Issue 08 scope revision — 7 November 2026

The team explicitly approved party-size routing and two independent queues in Sprint 1. This revision supersedes the original one-queue seed, Operator B's empty assignment list, and the exclusive Sprint 2 allocation of multiple queues. Other baseline decisions retain their existing status; this approval is not a claim that implementation or tests have passed.

| Queue | Accepted party size for new joins | Seed assignment | Service capacity |
| --- | --- | --- | --- |
| R | 1–4 | Operator A only | One CALLED or SERVING entry |
| S | 5–8 | Operator B only | One CALLED or SERVING entry |

Each queue has independent immutable sequence allocation, FIFO and queue-row locking. One active entry per customer across all queues remains mandatory. Existing historical entries, including parties outside the new range for their historical queue, are preserved and may finish the existing lifecycle. No historical rerouting or renumbering is permitted. New queues start OPEN; rerunning seed preserves existing queue state and counters, users, password hashes, sessions, entries and events. Seed inserts missing approved assignments and fails safely on contradictory seeded-operator assignments instead of deleting existing assignments. Multiple counters within a queue remain Sprint 2; registration and administrator management remain excluded.

### Affected requirements and regression map

| Contract area | Affected identifiers/rules | Approved change / regression obligation |
| --- | --- | --- |
| Decisions and scope | D-03, D-20; FR-04–06, FR-08, FR-16; F-02–05 and F-09; Sprint 1/2 scope and traceability | R/S routing is Sprint 1; multiple counters remain Sprint 2. D-01/02/04–09/14/18/26/28 and BR-01–08/11/15–17/26–28 remain enforced per queue or across customers as originally specified. |
| Acceptance and tests | AC/TEST-009–011, 015–024, 028–031, 032–044; TEST-045–049 | Seed two queues/two assignments; cover boundaries 1/4 on R and 5/8 on S; retain role, ownership, FIFO, terminal, audit and concurrency checks on both queues. TEST-039 still checks B forbidden from R and now also A forbidden from S. TEST-043 covers both operator journeys. Historical test evidence remains historical. |
| HTTP | GET /queues; POST /queues/:queueId/entries; GET /operator/queues; desk and three service actions; GET /public/queues/:queueId/board | Preserve paths and envelopes. Validate party-size/queue match on backend; mismatch is 422 VALIDATION_ERROR with details.fields.partySize and no writes. Only R/S accept new joins. Existing queues/history remain stored. A lists R; B lists S; a separately unassigned operator lists []. |
| Customer UI | /queues, QueueJoinForm, /my-queue | Party size determines displayed queue; remove arbitrary selection for new joins, explain both ranges, disable joining if the matching queue is unavailable, preserve status/history/refresh. |
| Operator UI | /operator/desk, Assigned queues, ActiveServiceCard | Show server assignments only, Active: 0/1 or Active: 1/1, independent waiting and service states, existing actions and responsive behavior. |
| Public UI | /board, /board/:queueId, PublicQueueBoard | /board shows R and S using two existing four-field board responses; /board/R and /board/S and UUID links remain supported. No private data or operator controls; independent loading/error/empty/refresh and visibility-aware polling. |
| Verification | NFR-01/04–06/09–10/12–13/15 | Real PostgreSQL simultaneous calls: one winner per queue; R lock cannot block S; success exactly one event per transition, rejection leaves full DB state unchanged. Authentication and existing regression coverage retained. |


## Scope and design principles

A mobile-first customer interface, an operator-oriented responsive desktop interface and a privacy-safe public queue display. Only the current server-authenticated role determines navigation. Screens and components here are contracts, not implemented screenshots.

## UI information architecture and shared behavior

**Mobile first customer:** `/login` → `/queues` → `/my-queue`; persistent account/logout control. Show the queue derived from party size, party-size numeric input (min 1 max 8), clear validation, and a **large queue-number** component (40–72 px responsive, tabular numbers). When latest entry is terminal, show status and permit new join; when active, disable/replace join button with `View my queue`.

**Operator desktop:** `/operator/desk` assigned queue dropdown (only authorized queues), oldest eligible waiting summary, active service card and buttons `Call next`, `Start service`, `Complete`. The current active entry and queue count update after every mutation. Operators on a queue they are not assigned see safe forbidden state. No role selector in login page.

**Public:** `/board/:queueId` uses unauthenticated allowlisted endpoint only; large called number, queue code, safe public state and waiting count. No secret pages or customer full entries.

**Shared states:** loading skeleton/spinner with controls disabled; empty state (no queued entry / no called entry / no assigned queues); retryable connection or 5xx error; per-field inline 422 validation; 401 redirects to sign-in (except public); 403 shows forbidden; 404 shows safe not-found; 409 displays precise safe business conflict and refreshes current authoritative data. All forms have visible labels, keyboard focus and status messages via accessible live regions. No UI-only authorization assumptions.

### Restaurant design tokens, semantic status colors and contrast

| Token | Hex | Intended use |
| --- | --- | --- |
| `--burgundy` | `#6F0E22` | Section headers, primary buttons/frames. |
| `--gold` | `#D7B15D` | Thin decoration, accent on burgundy, selected serving badge background. |
| `--cream` | `#FBF3E6` | Page background. |
| `--espresso` | `#2F2626` | Primary text and numbers, never pure black. |
| `--taupe` | `#8A6F5B` | Borders and large secondary notes only on cream. |

| Status | Text | Background | Text contrast (approx.) | WCAG AA normal text |
| --- | --- | --- | --- | --- |
| WAITING | Espresso | Cream | 13.37:1 | PASS |
| CALLED | Cream | Burgundy | 10.82:1 | PASS |
| SERVING | Espresso | Gold | 7.25:1 | PASS |
| COMPLETED | Cream | Espresso | 13.37:1 | PASS |
| CANCELLED | Burgundy | Cream, Taupe border | 10.82:1 | PASS |
| NO_SHOW | Gold | Burgundy | 5.87:1 | PASS |

**Explicit contrast failures:** Gold on Cream **1.84:1 FAIL** for ordinary text and essential icons; Taupe on Cream **4.23:1 FAIL** for normal-size text (passes large text at ≥3:1); Cream on Taupe **4.23:1 FAIL** for normal-size text; Burgundy on Espresso **1.24:1 FAIL**. Gold on Burgundy **5.87:1 PASS** for normal text. Use Espresso for small helper text instead of Taupe; Taupe can be a non-text border on Cream (4.23 ≥3), or large text. Status is always indicated by a visible word, not color alone. Avoid Gold-only icons on Cream where graphical contrast is required. Exact RGB contrast calculations use WCAG relative luminance.

**Layout and accessibility:** customer tested at 360/768 px, operator at 1280/1440 px, no horizontal overflow at 360, ≥44 px primary tap targets, labeled errors, visible focus, semantic landmarks and clear disabled/empty/error states. Queue number centered in responsive `QueueNumberDisplay`; keep readable when `R-10000` grows beyond four digits.

## Shared component contracts

| Component | Required behavior | Accessibility |
| --- | --- | --- |
| `QueueNumberDisplay` | Display `R-0001` or longer, status label, next action; responsive 40–72px queue number, tabular figures | Text label always accompanies color, accessible heading or polite live update |
| `StatusBadge` | Exact semantic states WAITING, CALLED, SERVING, COMPLETED, CANCELLED, NO_SHOW | Contrast-checked text/background; never color-only |
| `AppHeader` | Trust `/auth/me`, show role and logout, no role-switch input | Keyboard reachable actions, visible focus |
| `QueueJoinForm` | Numeric party size 1–8, no customer-ID input, authoritative 201 response | Label, min/max, field-linked error |
| `OperatorActionCard` | Display current entry and next legal action only | Focusable real buttons, pending state, errors announced |
| `PublicQueueBoard` | Show only queue code, called number, service state and waiting count | Large readable numbers, sufficient contrast, non-private labels |
| `ErrorState` | 401 sign in; 403 forbidden; 404 safe not found; 409 actionable refresh; network retry | Focus to heading, proper alert/live region |

All screens distinguish loading, empty, error, success and in-flight states. Polling every 10 seconds while visible is a view refresh only, not a consistency mechanism.

## F-01 Login, logout and current user UI contract

**Requirement trace:** FR-01; BR-13, BR-14; NFR-01, NFR-02, NFR-03, NFR-11; D-12, D-13, D-22, D-23.

## UI contract

| Screen/component | Fields/controls | States and navigation |
| --- | --- | --- |
| `/login` | Email input, password input with show/hide toggle, `Sign in` submit; no role selector. | Validating, submitting disabled, 422 field errors, generic 401 invalid credentials, retry 5xx; links to app based on server role after success. |
| Header/account | Current user's display name, role text, `Log out` button. | Initial loading `/me`, signed-out state, logout submitting, 401 returns to `/login`, error retry. |
| Route guard | No input. | 401 or no cookie redirects protected pages to login; role mismatch renders forbidden message; public board remains accessible anonymously. |

Use Cream page, Burgundy primary action, Espresso text. Password field label and error association; mobile width 360 px without scroll; keyboard Enter submits; loading announced to assistive tech.

## F-02 Role and queue authorization UI contract

**Requirement trace:** FR-02, FR-03, FR-04, FR-23, FR-24; BR-09–BR-11, BR-27–BR-28; NFR-01, NFR-06, NFR-07, NFR-11; D-09, D-10, D-20, D-25.

## UI contract

| Component | Behavior | Edge states |
| --- | --- | --- |
| Operator `Assigned queues` selector | Options from `GET /operator/queues`; only authorized queues shown; A sees only R; B sees only S. | Loading indicator; empty `No assigned queues`; 401 sign-in; 403 forbidden; 5xx retry. |
| `/operator/desk` scope guard | Shows only current operator's queues. | Typing another queue ID into URL cannot yield data; backend returns 403. |
| Customer queue discovery | Customer sees public names of open queues from `/queues`; R/S selection is derived from party size. | Loading, empty, network retry; Operators cannot join via role spoof. |
| Common error/access screen | Clear status message with `Back` link; focus goes to heading. | Does not repeat private entry identifiers/details. |

## F-03 Join queue UI contract

**Requirement trace:** FR-05, FR-06; BR-03–BR-06, BR-15, BR-27; NFR-05, NFR-06, NFR-09, NFR-15; D-01–D-08, D-20, D-27.

## UI contract

| Screen/component | Fields/buttons | States |
| --- | --- | --- |
| `/queues` | Queue card derived from party size (1–4 → R; 5–8 → S), no arbitrary queue selector, number input labelled `Party size` (1–8), `Join queue` button, `View my queue` link after success. | Loading queue list, no queues, invalid field, sending/disabled button, conflict banner with link to latest entry, network retry. |
| `QueueNumberDisplay` (shared with F-04) | Large text `R-0001`, label `Your queue number`, status WAITING, aria-live polite on update. | Reflows at 360 px without truncation or horizontal scroll; handles R-10000. |
| Auth/role UI | Only Customer sees join page/button; backend still rejects Operator and anonymous direct POST. | 401 sign-in redirect; 403 forbidden route. |

Use Burgundy button, Cream page, Espresso text and validated field error under input. Minimum 44×44 touch target. No notification or booking controls.

## F-04 My queue and public board UI contract

**Requirement trace:** FR-07, FR-08, FR-22; BR-10, BR-12; NFR-01, NFR-04, NFR-09, NFR-10, NFR-15; D-10–D-11, D-24–D-25.

## UI contract

| Screen/component | Contents and actions | States |
| --- | --- | --- |
| `/my-queue` | `QueueNumberDisplay` large 40–72 px, queue name/code, status text, party size and joined timestamp (private), refresh action, `Back to queues`, logout. | Loading skeleton, no entry empty CTA, 401 login, 404 safe missing, server/network error with Retry. Poll 10 s while visible. |
| `/board/:queueId` | Public header, queue code, large currently called number or `No one called`, public state label and waiting count. | Anonymous, loading, no current call, invalid queue 404, offline Retry; poll 10 s while visible; no sensitive data. |
| Shared status badge | Palette-compliant word labels for WAITING, CALLED, SERVING, COMPLETED, CANCELLED, NO_SHOW. | Accessible live announcement; never color-only. |

Use Espresso small text on Cream, Burgundy highlights; do not use Taupe normal-sized text on Cream because 4.23:1 fails AA. Public number uses tabular digits and remains legible on larger display.

## F-05 Call next, start and complete UI contract

**Requirement trace:** FR-09–FR-12; BR-01, BR-02, BR-07–BR-09, BR-11, BR-16, BR-17, BR-26, BR-28; NFR-01, NFR-05, NFR-12, NFR-13, NFR-15; D-01, D-02, D-07–D-09, D-14, D-18, D-26.

## UI contract

| Screen/component | Actions/fields | States |
| --- | --- | --- |
| `/operator/desk` | Assigned queue selector, count WAITING, Active: 0/1 or Active: 1/1, current active number/state, `Call Next`, `Start Service`, `Complete Service`, refresh. | Loading/empty assigned list; no waiting entry; active slot busy explanation; action submitting/disabled; success toast/status; 401/403 safe access messages; retry on network failure. |
| `ActiveServiceCard` | Large queue number in Espresso/Burgundy compliant contrast, party size (operator only), stage and action for exact allowed next transition. | CALLED shows `Start Service`, SERVING shows `Complete Service`, COMPLETED/empty shows no action. |
| Public/customer reflection | F-04 boards show called number and updated own status on next poll or manual refresh. | Never leak internal operator IDs or customer private fields on public display. |

At 1280/1440 px, desk uses two-column layout (`Waiting` and `Active Service`) with responsive collapse on narrower widths. Do not create dead empty whitespace; make conflict state informative. Buttons must not create duplicate requests if double clicked, but backend guards are essential.

## Proposed routes and responsive viewports

| Route | Audience | Small screen rule | Large screen rule |
| --- | --- | --- | --- |
| `/login` | Anonymous | Single stacked form at 360px | Centered form |
| `/queues` | Customer | Single queue list card and join form | Bounded content column |
| `/my-queue` | Customer | Large full-width number and status, no overflow | Centered detail card |
| `/operator/desk` | Operator | Stacked waiting and active cards | Two columns at ≥1280px |
| `/board/:queueId` | Public | Large called number and waiting count | Readable from distance |

`/my-queue` and `/operator/desk` require valid session; `/board/:queueId` must be anonymous. A hidden control does not constitute API authorization.

## Future sprint UI allocation

| Sprint | Feature | UI contract reserved |
| --- | --- | --- |
| 2 | F-06 Cancel | Customer cancellation action only from WAITING; authorized operator cancellation with required reason |
| 2 | F-07 No show | Operator button enabled only after five-minute CALLED threshold |
| 2 | F-08 Dashboard | Authorized counts, refreshed summaries, queue action clarity |
| 2 | F-09 Multiple queues/counters | Queue/counter selector respecting assignments and capacity |
| 2 | F-10 ETA | Explicitly labelled estimate and non-guarantee disclaimer |
| 3 | F-11 Priority | Display policy/order without implying FIFO still always governs |
| 3 | F-12 Open/pause/close | Scoped controls with confirm/rejection states |
| 3 | F-13 Reports | Authorized summary tables with filters and empty/loading/error |
| 3 | F-14 Notification placeholder | Clearly simulated status with no real external message |

These are allocation notes, not frozen later-sprint feature contracts.

## UI acceptance and evidence

Use AC-007, AC-016–018, AC-025, AC-028–031 and AC-043 for UI paths; verify full customer/operator journey with TEST-043 and small-screen usability with TEST-030. Capture actual 360px customer screenshots and 1280/1440px operator screenshots after implementation. Never claim pass from visual mockups.

## Approved two-queue screen behavior

Customer party-size help always explains both ranges. Render the form even when the selected range has no available queue; show “Queue R/S is not open for joining.” and disable Join queue. Do not offer the other queue as a fallback. Preserve retry/empty/session handling and show the authoritative returned number and queue code. Existing completed tickets remain readable and allow a new eligible join.

The primary public-display navigation opens `/board`, a responsive overview of R and S using the existing per-queue boards. Individual `/board/R`, `/board/S` and UUID routes remain usable and provide links to both queues. Each board retains its own ten-second visibility-aware polling, error/empty state and manual refresh. At narrow widths stack cards without overflow; desktop may show them side by side. No operator controls or private fields are added.

The operator desk retains the assigned queue selector and lifecycle controls, with capacity visibly stated as Active: 0/1 or Active: 1/1. One queue being busy must not disable the other operator's queue. Preserve ≥44px controls, visible focus, accessible live feedback and existing status colors.


## Public board visual refinement — 7 November 2026

This UI-only revision preserves anonymous endpoints, the exact four-field public DTO, ten-second visibility-aware polling, refresh gating, and customer/operator workflows. `--surface: #FFFFFF` is the optional derived white card token; all public CSS colors reference the existing palette variables or this token. The shadow derives from Espresso at 10% opacity. Taupe is used only for 1px borders; gold only for divider/ring ornaments and the SERVING badge background. Status always includes CALLED or SERVING as text.

| Text / background | Contrast ratio | Usage |
| --- | ---: | --- |
| Espresso / Cream | 13.37:1 | Page headings, local update text outside cards when present, quiet disabled Back text |
| Espresso / Surface (white) | 14.73:1 | Card headings, empty/helper/error copy, waiting count/label and receipt time |
| Burgundy / Cream | 10.82:1 | Wordmark, inactive tabs and Back |
| Burgundy / Surface | 11.92:1 | Real called number, outline Refresh/Retry |
| Cream / Burgundy | 10.82:1 | Active tab, queue-code badge and CALLED status |
| Espresso / Gold | 7.25:1 | SERVING status |

Ratios use WCAG relative luminance calculated from the token sRGB values; every normal-text pair exceeds 4.5:1. Disabled outline controls use Espresso on Cream. No gold text/icons appear on cream/white; no normal-size Taupe text is used. The subtle 150ms real-number fade is disabled for `prefers-reduced-motion: reduce`; empty copy does not animate or take the real-number font size.

Layout: 1200px maximum page width, centered; 8px spacing scale with 24/32px primary gaps. Cards have a white surface, 16px radius, soft Espresso shadow and 4px Burgundy top border, without full-color header bars or an outer wrapper card. At 1024px and above, the overview has equal-height columns; smaller widths stack. Called numbers are 72–120px, tabular, within a polite live region. Empty titles are 28–32px. The waiting count is 48px, beside a 16px label below a 1px gold divider. Footer receipt time is 14px and Refresh is a 44px-minimum secondary outline control. Visible focus rings are 2px Burgundy with 4px offset. Navigation uses native links with `aria-current="page"`, styled as segmented tabs, plus a quiet Back action with its existing behavior.

Privacy and discovery: the API has no anonymous queue-list/name endpoint. The UI confirms the approved R/S destinations through existing four-field anonymous board responses; unsuccessful probes do not create queue tabs. A successfully loaded direct queue URL can also confirm its own tab. Headings derive only from `queueCode` (for example “Queue R”); private queue names are not fetched. The displayed “Updated HH:mm:ss” is local successful-response receipt time, not an API/database timestamp. No customer names, email, IDs, party sizes, private entry IDs or nested API metadata are rendered. Both-mode missing queues retain an explicit friendly error card with Retry rather than advertising an unconfirmed queue tab.

404 copy: “This queue isn't available”. Network/5xx copy: “We couldn't load this queue”. Both include a decorative icon, `role="alert"`, safe helper copy and Retry, without raw exception text. Successful retry restores normal content; shared polling/session/backend services are unchanged.

## Customer status visual refinement — 7 November 2026

This revision is scoped to the authenticated CUSTOMER `/my-queue` presentation. The existing latest-entry API, ownership restrictions, join validation, session/logout behavior, refresh gate and visibility-aware ten-second polling are unchanged. It uses only fields already returned by the current identity/owned-entry APIs. Queue details show the returned `queueCode` as “Queue R/S”; no queue-name metadata or other customer's records are fetched. No private entry ID, email, password/hash, or session value is displayed.

`AppHeader` presents a 24–28px burgundy Georgia/system-serif wordmark (not a competing page H1), a compact initials/name/uppercase-role chip and quiet public-board/logout actions. On narrow screens the chip wraps below the wordmark and remains right-aligned. The page uses 24px top padding, 16px side padding, a centered 560px maximum column and a 2px gold divider. The main card's only large heading is “My queue” at 24px; the white `--surface` card has a 16px radius, 4px burgundy top border and a 10%-Espresso soft shadow.

The number panel uses Cream, a 1px Taupe border, 12px radius, a 14px Espresso label, and a Burgundy tabular number (40px minimum at 360px; 56–72px on larger screens). Gold is a 1px line under the number. Status is a 14px uppercase word plus a decorative dot: WAITING Espresso/Cream with a Taupe border; CALLED Cream/Burgundy; SERVING Espresso/Gold; COMPLETED Cream/Espresso. Number and status share an atomic polite live region. Their 150ms fade respects reduced-motion preferences.

Details use a definition list: 14px Espresso labels left, 16px semibold Espresso values right, Taupe 1px row dividers. Rows are Queue, Party size and Joined. Joined remains formatted in `Asia/Bangkok`, for example “7 Nov 2026, 11:55”, with an explicit “Bangkok time” note. The footer's “Updated HH:mm:ss” is local response receipt time, not an additional API/database field. Refresh status is secondary outline, full-width at 360px and auto-width on larger screens; Back to queues is a plain Burgundy arrow link. Tap targets are at least 44px and focus rings are 2px Burgundy with offset. Loading skeleton, empty, safe role-alert errors with Retry and current/historical statuses remain available.

| Text / background | Contrast ratio | Customer usage |
| --- | ---: | --- |
| Espresso / Cream | 13.37:1 | Number label, WAITING, loading/empty/error copy, disabled controls and identity text |
| Espresso / Surface | 14.73:1 | My queue heading, definition-list labels/values and update footer |
| Burgundy / Cream | 10.82:1 | Serif wordmark, header text link, logout, number |
| Burgundy / Surface | 11.92:1 | Outline Refresh/Retry and Back link |
| Cream / Burgundy | 10.82:1 | Initials and CALLED |
| Espresso / Gold | 7.25:1 | SERVING |
| Cream / Espresso | 13.37:1 | COMPLETED |

Ratios use WCAG relative luminance of the palette tokens; all normal-text pairs exceed 4.5:1. Taupe is only a 1px border/divider, never normal text. Gold is only a thin line or SERVING background, never text on white/cream. All customer-status colors reference CSS variables, including `--surface`; no off-palette panel/badge grey is used. Other pages retain their existing UI and behavior.
