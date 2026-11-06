# Issue02 foundation verification — 6 November 2026

Local environment: macOS arm64, Node 24.14.0, npm 11.9.0, PostgreSQL 16.15. Isolated persistent cluster under ignored `.local/postgres`, localhost port 55432; separate `restaurant_queue` and `restaurant_queue_test` databases. Ignored `server/.env` holds generated synthetic passwords. These paths are local verification setup, not required deployment paths. No mock/in-memory persistence was used. No commit or push was made.

Failing-first execution before implementation: `npm --prefix server run test:unit` and `cd server && npx vitest run tests/api/health.test.ts` each failed to import their not-yet-created implementation module (`test-database.js` / `app.js`); no assertions ran at that stage. Then implementations were added and the suites passed. This records the limited scaffold-level RED evidence accurately; no RED commit exists because committing was prohibited. Database tests were executed against real PostgreSQL after migration implementation.

| Command | Actual result |
| --- | --- |
| `npm --prefix server install` | Installed; initial sandbox network failure resolved with approved execution |
| `npm --prefix client install` | Installed |
| `npm --prefix server run db:generate` | Passed; approved execution required access to Prisma engine cache |
| `npm --prefix server run db:migrate` twice | First applied `0001_foundation`; second had no pending migrations |
| `npm --prefix server run db:seed` twice | Both passed against development DB |
| `npm --prefix server run test:unit` | 1 passed |
| `npm --prefix server run test:api` | 4 passed across 3 files using actual PostgreSQL |
| `npm --prefix server run build` | Passed |
| `npm --prefix client run build` | Passed |
| `npm --prefix client run test:ui` | 1 passed |
| `npm --prefix client run test:e2e` | 1 passed (Chromium, real API/Vite, 3.0s) |
| `npm --prefix server run test:api` repeated on existing test DB | 4 passed; no pending migrations |
| `git diff --check` | Passed; ignored env, DB files and build output confirmed |

API coverage: TEST-009 repeated migration/seed, exact seed identities/counts/assignment, hash verification, stable IDs/hashes and preservation of changed counter/state; TEST-014 safe anonymous health; database constraints for duplicate active customers/service slots, party-size bounds, sequence uniqueness and foreign keys; seeded data unchanged across two actual API processes. Fixtures restore their own temporary queue edits and remove their own entry. The disposable test database was explicitly recreated once during test development; normal scripts never recreate databases.

TEST-015 is deferred: no join/read API exists yet. Foundation restart coverage is not evidence that the future entry/event HTTP persistence journey works.

Dependencies were audited; compatible fixes applied and Vitest upgraded to 5.1.0 to remove its critical advisories. Frontend audit reports zero vulnerabilities. Backend retains four high advisories in Prisma 6 tooling (`@prisma/config`, `effect`, `deepmerge-ts`, `prisma`); npm proposes a breaking Prisma 7 upgrade. `npm --prefix server audit --omit=dev` also reports these four highs because Prisma tooling is present in the resolved dependency graph; do not interpret them as excluded from the installed production tree. The command exits 1. Prisma 7 configuration migration is a remaining maintenance dependency; no forced major upgrade was applied.
