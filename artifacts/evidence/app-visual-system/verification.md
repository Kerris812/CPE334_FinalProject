# App-wide visual-system verification

Executed 7 November 2026 (Asia/Bangkok), working tree based on `4055a963b345dc1182b90ee8ab93e74145dbcaa1` plus existing uncommitted work. No commit, push, merge or tag. The final no-commit instruction supersedes the earlier requested per-step commits. Specification was updated first, then tokens/base, shared components and the requested page order.

| Actual command | Result | Output |
| --- | --- | --- |
| `npm --prefix client run test:ui` | 74 passed, 0 failed, 0 skipped, 10 files | [ui.txt](ui.txt) |
| `npm --prefix client run test:e2e` with isolated local environment launcher | 30 passed, 0 failed, 0 skipped | [e2e.txt](e2e.txt) |
| `npm --prefix client run build` | TypeScript + Vite passed | [build.txt](build.txt) |

The actual browser invocation was `node .local/run-verification.mjs test npm --prefix client run test:e2e`. This ignored launcher provides the separately created `_test` PostgreSQL URL and ports 3100/5273, without recording secrets. Existing workflow cases still exercise real PostgreSQL. Ten added fixture-driven visual cases are separately identifiable in runner output; screenshots are not deployment, review or production evidence.

## Deliverables and boundaries

- [Current UI specification](../../../docs/ui-spec.md): tokens, component contracts, five page layouts, measured contrast and typography freeze.
- `client/src/styles/tokens.css`: all application color literals and layout tokens.
- `client/src/styles/typography.css`: preserved existing typography, including route-specific family/size/weight variants.
- `client/src/styles/shared.css` and `client/src/components/ui.tsx`: shared layout, cards, header bands, action variants, states, badges, tabs, stat/detail rows and footer metadata.
- `AppHeader.tsx`, `App.tsx`, customer/public/operator UI and shared QueueNumberDisplay migrated to the visual system.
- Old per-page CSS consolidated; exact pre-change CSS snapshots retained here only as verification inputs.

`git diff --exit-code -- server/src client/src/api-client.ts client/src/auth-api.ts client/src/queue-api.ts client/src/useQueueResource.ts client/src/board-navigation.ts` returned zero. API calls, routes, response shapes, ownership, sessions, validation, polling and transition handlers were retained. Existing field IDs, accessible control names and aria-describedby links remain. No data-testid attributes existed in the application source before this migration.

## Typography and contrast

The saved pre-migration CSS is resolved with representative original markup in Chromium and compared to actual rendered new pages at 360/1440px. Per-page `typography-*.json` files record expected/actual families, sizes and weights. The initial runtime-metrics file was overwritten by a diagnostic probe; it is not used as evidence. Typography checks use the original CSS snapshots instead. No italic mockup font was adopted. New decorative elements do not replace existing text.

Eighteen NFR-10 unit cases compute WCAG ratios directly from token hex values. [contrast.json](contrast.json) records measured values; normal pairs exceed 4.5 and the designated graphical gradient-end logo pair exceeds 3. Gold-text, rather than raw gold, colors ornaments on light surfaces. Header focus uses a cream backing to keep the burgundy ring visible. Reduced-motion and polite live regions remain verified by the browser suite.

## Screenshots

[Machine-readable matrix](screenshots.json): **56 genuine rendered screenshots**, 360 and 1440px. Controlled synthetic API responses make loading/errors/lifecycle states deterministic. Existing database-backed journeys separately verify integrated behavior. All pages also have overflow/tap-target checks at 768/1024px. At least one H1 is asserted as exactly one per page.

| Page | Captured states | 360px example | 1440px example |
| --- | --- | --- | --- |
| Login | Empty/ready, submitting/loading, generic authentication error | [Ready](login-empty-360.png) | [Ready](login-empty-1440.png) |
| Join | Open form, active called/serving, completed history with rejoin form, empty/no-open, loading, error | [Form](queues-form-360.png) | [Form](queues-form-1440.png) |
| My queue | Empty, called, serving, completed, loading, error | [Called](my-queue-called-360.png) | [Called](my-queue-called-1440.png) |
| Public board | Empty, called, serving, completed-slot empty, loading, error | [Called](board-called-360.png) | [Empty](board-empty-1440.png) |
| Operator | Empty desk, called, serving, completed-slot empty, loading, error | [Called](operator-called-360.png) | [Called](operator-called-1440.png) |

Login has no queue lifecycle states. Public COMPLETED means null called number/state, not an invented public completed status. Operator completion clears the service slot. Public screenshots use anonymous identity responses and only four public board fields. No private metadata or raw diagnostics are rendered. No outer rounded screenshot frame was added.

## Limits

Chromium local verification only; no deployment or external review is claimed. Backend unit/API suites were not rerun for a UI-only migration; existing end-to-end workflow, authorization, privacy and concurrency regression coverage remains intact. Disabled operator controls retain their labels/gates, with only the legal next action emphasized; no new transition is enabled. Historical verification logs elsewhere describe their own earlier runs.
