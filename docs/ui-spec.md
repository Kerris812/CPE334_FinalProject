# App-wide visual system

7 November 2026. UI-only application of UI.png. This document supersedes earlier visual-only refinements in `docs/sprint-1/ui-spec.md`; the four Sprint 1 API, authorization, data and workflow contracts remain authoritative. The mockup's outer rounded frame and italic typography are not application requirements.

## Change boundaries and typography freeze

Do not change backend code, API calls, response shapes, routes, polling intervals/gates, authorization, join validation or operator transitions. Preserve existing accessible names, input IDs, aria-describedby links and data-testid attributes. Keep existing safe error behavior and privacy allowlists. Public navigation continues to use the existing public-response discovery; do not add endpoints or return private queue names.

Existing font families, font sizes and font weights are frozen, including route-specific variants already present before this change. Shared visual components retain those typography contexts. In particular, existing public numbers remain 72–120px, customer numbers 40–72px and operator numbers 40–72px, rather than adopting new mockup sizes. Existing public/customer serif wordmarks remain as they are; other wordmarks retain their current system font. The mockup's serif italic face is not copied. A browser typography baseline checks computed family/size/weight at 360 and 1440px.

## Tokens — single source: client/src/styles/tokens.css

| Token | Value | Use |
| --- | --- | --- |
| --burgundy-900 | #3F0B16 | Header gradient, deepest accent |
| --burgundy-700 | #6F0E22 | Primary actions, active segments, key text |
| --burgundy-100 | #EBD3D6 | Card borders and dividers |
| --burgundy-50 | #F6E9EA | Card header bands, hover tint |
| --cream | #FBF3E6 | Page background and inverse text |
| --surface | #FFFCF7 | Card, inactive segments, secondary controls |
| --espresso | #2F2626 | Body text and numbers |
| --taupe | #8A6F5B | Borders only |
| --taupe-text | #6B5444 | Helper and secondary text |
| --gold | #D7B15D | Thin lines/ornaments, primary edge, SERVING background |
| --gold-text | #7A5A12 | Gold-toned text on cream/surface |
| --success | #2E6B4F | COMPLETED background, text on success-bg |
| --success-bg | #E4F0E9 | Success notices |

Spacing tokens: 4/8/12/16/24/32/48px. Radii: 8px inputs/buttons, 12px badges, 16px cards. Shadow: 0 1px 3px rgba(47,38,38,.10). All color literals live only in tokens.css; shadows, gradients, disabled states and overlays derive from tokens. Historical --burgundy aliases --burgundy-700 where needed during migration.

## Shared component contracts

| Component | Presentation contract |
| --- | --- |
| AppShell | Cream canvas; full-width header; centered 1200px content, 560px customer column, 420px login card; 24px padding, 16px at 360px. No screenshot frame. |
| AppHeader | Burgundy-900→700 horizontal gradient, 1px gold bottom line; gold inline hexagon/fork/knife logo, cream wordmark. Signed-in current-user chip with initials/name/uppercase role and quiet cream logout; public board has no identity/actions. Wrap compactly at 360px. No new identity requests. |
| PageHeader | Existing section title typography with 3px burgundy left bar; optional right action. Exactly one H1 per page, keeping current accessible heading names. |
| Tabs | Native navigation links with aria-current=page; active burgundy/cream, inactive surface/burgundy with burgundy-100 border; 44px targets. Assigned-queue selector remains available with its existing label and behavior. |
| BackLink | Arrow and existing accessible text; no solid button chrome; original click/navigation behavior. |
| Card | Surface, 16px corners, burgundy-100 double border via outer ring and 3px surface gap; tinted burgundy-50 header band, 40px circular burgundy badge; 24px body; divided footer. |
| Divider | One burgundy-100 line with a small aria-hidden gold-text four-point star (the dark gold token preserves contrast on light surfaces); at most one per card. |
| Button | Primary burgundy/cream with inset 2px gold bottom edge; secondary surface/burgundy outline; ghost text. 44px targets; 2px focus ring/2px offset; safe disabled/pending gates unchanged. Spinner is decorative and does not replace the accessible label. |
| QueueNumberDisplay | Centered existing label/number typography, tabular numbers, ornament divider and StatusBadge. Atomic polite region; 150ms fade; reduced-motion disables animation. R-10000 remains visible. |
| StatusBadge | Word plus dot/icon. WAITING espresso/surface with taupe border; CALLED cream/burgundy-700; SERVING espresso/gold; COMPLETED cream/success; CANCELLED burgundy-700/burgundy-50 with burgundy-100 border; NO_SHOW gold/burgundy-900. Display variants only; do not implement new transitions. |
| StatBlock | Existing number typography (preserved per route) with taupe-text label beside it. |
| DetailList | Existing label/value typography, aligned rows, thin burgundy-100 dividers. Only already-returned fields. |
| FooterMeta | Decorative clock, existing receipt-time text/typography left; Refresh right, primary by default and secondary on constrained layouts. Local receipt time is not an added API field. |
| EmptyState | Decorative icon, existing medium heading and one helper line, optional existing action. Anonymous board helper: “The next called number will appear here.” |
| ErrorState | Decorative circled !, heading/helper, secondary Retry; role=alert; never raw server errors. Preserve 401 handling and 403 ownership/assignment protections. Public 404: “This queue isn't available”; network/5xx: “We couldn't load this. Please try again.” Existing accessible labels/messages used by tests remain available where required. |
| FormField | Existing label above existing input and ID; 44px target, taupe border, burgundy focus; linked inline error with decorative icon. No role selector. |

## Per-page layouts and migration order

1. Login: AppHeader + centered 420px Card; existing Email/Password labels, show/hide control, generic auth error, primary Sign in. Preserve submission and identity restore behavior.
2. Customer queues: 560px column; current party-size routing and open queue selection, Card heading/badge, party input and primary Join queue. Preserve the existing current-entry summary and View my queue link. Never add alternate joins/queue selections or change the single-active-entry rule.
3. My queue: 560px column; Card, QueueNumberDisplay, DetailList (queue code, party size, Joined + Bangkok time), FooterMeta, secondary Refresh status, Back to queues, ghost public-board link. Preserve latest historical COMPLETED entries.
4. Public board: full AppHeader with no identity, segmented confirmed queue links left and quiet Back right, PageHeader, two Cards at ≥1024px and stacked below. Empty/called/serving/error/loading and completed-slot empty presentation. Render only queueCode/calledNumber/serviceState/waitingCount; no private metadata.
5. Operator: PageHeader and existing assigned selector; Waiting/Active Service Cards, two columns at ≥1280px, stacked below. Preserve exact existing handlers, permission gates and conflict refresh. Present the legal next action prominently; retain existing disabled action controls and accessible labels rather than removing tests or changing transition logic. Completed service leaves the slot empty, as before.

## Contrast and NFR-10

The values below are measured from tokens.css using WCAG relative luminance. The automated test enforces ≥4.5 for normal text and ≥3.0 for the designated graphical gradient-end logo pair. The exact three-decimal output is in artifacts/evidence/app-visual-system/contrast.json.

| Foreground / background | Measured ratio | Usage |
| --- | ---: | --- |
| Cream / burgundy-900 | 15.00:1 | Header text |
| Gold / burgundy-900 | 8.13:1 | Header logo |
| Cream / burgundy-700 | 10.82:1 | Primary/active text, CALLED |
| Burgundy-700 / cream | 10.82:1 | Links and key text |
| Burgundy-700 / surface | 11.65:1 | Secondary controls |
| Burgundy-700 / burgundy-50 | 10.08:1 | Card accent text |
| Espresso / cream | 13.37:1 | Body |
| Espresso / surface | 14.39:1 | Card body |
| Espresso / burgundy-50 | 12.46:1 | Card titles |
| Espresso / gold | 7.25:1 | SERVING |
| Taupe-text / cream | 6.41:1 | Helper copy |
| Taupe-text / surface | 6.89:1 | Card metadata |
| Taupe-text / burgundy-50 | 5.97:1 | Header metadata |
| Gold-text / cream | 5.78:1 | Optional accent text |
| Gold-text / surface | 6.22:1 | Optional accent text |
| Success / success-bg | 5.38:1 | Success notices |
| Cream / success | 5.72:1 | COMPLETED |
| Gold / burgundy-700 | 5.87:1 | Decorative logo at gradient end only |

Never use raw Gold as text/icons on cream/surface, Taupe as normal text, or Burgundy on Espresso. Header logo stays on the dark header; gold dividers/ornaments are decorative. Status always includes a word.

## Verification and evidence

Preserve route/API/polling logic and existing test IDs/accessibility names. Run client test:ui, test:e2e and build; record real pass/fail/skip counts. Test 360/768/1024/1440px, no horizontal scroll, ≥44px interactive targets, keyboard focus and reduced motion. Capture genuine rendered screenshots at 360/1440px for each applicable empty/loading/error/called/serving/completed state. Login does not have queue lifecycle states; public/operator COMPLETED means an empty slot, not an invented completed public DTO. Deterministic UI fixture screenshots must be labeled as fixtures; real PostgreSQL workflow tests remain separate.

No commits, pushes, merges or tags are authorized by the final instruction. Preserve existing uncommitted work.


## Implementation and verification notes

The pre-migration CSS was saved before implementation. Typography regression checks resolve that snapshot against representative original markup in Chromium, then compare actual migrated pages (font family, size and weight) at 360/1440px. This is a CSS typography reference, not a reconstructed screenshot or an old-app deployment. It covers wordmarks, identity text, headings, controls, inputs/labels, public links and number/status text where those elements exist. Empty/error variants retain their previous context-specific sizes. Typography declarations live separately from the shared visual rules to avoid accidental mockup font adoption.

The header uses a cream backing under the 2px burgundy keyboard-focus ring so the ring remains visible against the dark gradient. The ornament uses gold-text on light surfaces; raw gold is reserved for the dark-header logo, thin edges and SERVING background. Source CSS outside tokens.css has no literal colors. Historical pre-migration CSS snapshots under evidence are test inputs, not product stylesheets.

Implementation order was specification → tokens/base → shared components → login → queues → my-queue → public board → operator. Final instructions prohibit commits and pushes, so no spec/step commits, merges or tags were made. See [visual-system verification](../artifacts/evidence/app-visual-system/verification.md) for actual results and the labeled screenshot matrix.
