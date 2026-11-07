# CPE334 Restaurant Queue and Service Management System

## File Structure

Key Sprint 1 paths:

```text
docs/
├── ui-spec.md                     # Current app-wide visual system
├── sprint-1/
│   ├── specification.md
│   ├── api-spec.md
│   ├── tests.md
│   ├── ui-spec.md                 # Sprint contract and visual history
│   ├── acceptance-coverage.md
│   └── release-verification.md
└── releases/
    └── v0.1.0.md                  # Draft release notes

server/
├── src/                          # Express API, authentication and queue services
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   └── seed.ts
└── tests/
    ├── unit/
    ├── api/
    └── support/

client/
├── src/
│   ├── components/ui.tsx         # Shared presentation components
│   ├── styles/                   # Tokens, shared styles and frozen typography
│   ├── App.tsx
│   ├── CustomerQueues.tsx
│   ├── PublicQueueBoard.tsx
│   └── OperatorDesk.tsx
└── tests/
    ├── ui/
    └── e2e/

artifacts/evidence/
├── sprint1/
├── app-visual-system/
├── customer-status-refinement/
└── public-board-refinement/
```

## Project Overview

The CPE334 Restaurant Queue and Service Management System manages customer waiting queues and restaurant service. Sprint 1 integrates F01–F05: authenticated Customer and Operator accounts, assignment-based authorization, customer queue joining, private queue status, anonymous public displays and the FIFO operator workflow. PostgreSQL retains queue entries, numbers, sessions and audit history.

## Features

- **Authentication:** Email/password login with Argon2id verification, opaque cookie sessions, restored current identity, eight-hour absolute expiry and logout revocation. Passwords and session tokens are not exposed in JSON or logs.
- **Customer:** Join the matching open queue with a validated party size; view the owned latest entry and historical completed status; refresh and reload persisted information. One active entry per customer applies across both queues.
- **Party-size routing:** Queue R accepts 1–4 guests; Queue S accepts 5–8. Independent counters allocate immutable sequential numbers such as `R-0001` and `S-0001`, including sequences beyond 9999.
- **Operator:** Operator A manages R only; Operator B manages S only. Assigned operators call the FIFO head, start service and complete service. Each queue has one CALLED/SERVING slot, with transactional concurrency protection and atomic audit records.
- **Public display:** Anonymous boards for both queues or an individual queue. Only queue code, called number, service state and aggregate waiting count are displayed, with visibility-aware polling and safe retry states.
- **Interface:** Responsive shared cards, controls and status badges using the restaurant burgundy, cream and gold visual system. Existing typography and accessible labels are preserved.
- **Foundation:** Non-destructive migrations and idempotent synthetic seed data, a health endpoint, database constraints, authorization guards and real PostgreSQL regression tests.

Registration, cancellation, no-shows, notifications, multiple counters per queue and administration remain outside Sprint 1 functionality.

## Technology

| Area | Technologies |
| --- | --- |
| Frontend | React, TypeScript, Vite, shared CSS tokens and components |
| Backend | Node.js, Express, TypeScript, tsx, Argon2id |
| Database / ORM | PostgreSQL, Prisma Client and Prisma migrations |
| Unit / API / UI tests | Vitest, Supertest, React Testing Library, jsdom |
| Browser / E2E tests | Playwright with Chromium |

Dependency ranges are recorded in [client/package.json](client/package.json) and [server/package.json](server/package.json); each package has its own lockfile.

## Running the Application

### Requirements and Initial Setup

Use Node.js 22 or later (tested: 24.14.0), npm, and a running PostgreSQL server (tested: Homebrew PostgreSQL 17.11 on macOS ARM64). Unless a command explicitly changes directory, run it from the repository root. This verification used local PostgreSQL without Docker.

```bash
npm --prefix server ci
npm --prefix client ci
cp server/.env.example server/.env
cp client/.env.example client/.env
```

Create a local database login and two **different** databases using a PostgreSQL administrator connection. Set the password interactively in `psql`:

```sql
CREATE ROLE queue_local LOGIN;
\password queue_local
CREATE DATABASE restaurant_queue OWNER queue_local;
CREATE DATABASE restaurant_queue_test OWNER queue_local;
```

Edit ignored `server/.env`:

| Variable | Local configuration |
| --- | --- |
| `DATABASE_URL` | Development PostgreSQL URL; replace example username/password/host/database. URL-encode password characters. |
| `TEST_DATABASE_URL` | Separate disposable PostgreSQL database whose name ends in `_test`. Never point it at development or shared data. |
| `DEMO_CUSTOMER_PASSWORD` | Locally chosen synthetic password for both seeded customers. |
| `DEMO_OPERATOR_PASSWORD` | Locally chosen synthetic password for both seeded operators. |
| `PORT` | API port; default `3000`. |
| `WEB_ORIGIN` | Exact browser origin; default `http://127.0.0.1:5173`. |
| `COOKIE_SECURE` | `false` for local HTTP; production always enables Secure cookies. |
| `NODE_ENV` | `development` locally; production requires HTTPS. |
| `TZ` | `UTC`. |

Generate local demo passwords without printing them, **before the first seed**:

```bash
node --input-type=module <<'JS'
import fs from 'node:fs';
import crypto from 'node:crypto';
const path = 'server/.env';
let text = fs.readFileSync(path, 'utf8');
for (const name of ['DEMO_CUSTOMER_PASSWORD', 'DEMO_OPERATOR_PASSWORD']) {
  text = text.replace(new RegExp('^' + name + '=.*$', 'm'), name + '=' + crypto.randomBytes(24).toString('base64url'));
}
fs.writeFileSync(path, text, { mode: 0o600 });
JS
npm --prefix server run db:generate
npm --prefix server run db:migrate
npm --prefix server run db:seed
```

Migrations use `prisma migrate deploy`, without resetting data. Seed is transactional and idempotent: it preserves existing hashes, sessions, counters, queue states, entries and history. Changing the environment password afterward does **not** rotate an existing account's password. Contradictory seeded roles or assignments fail safely without deleting existing data. Do not use real personal credentials or put database secrets in `VITE_` variables.

### Seeded accounts and queues

| Account | Email | Password source | Assignment |
| --- | --- | --- | --- |
| Customer A | `customer.a@example.test` | `DEMO_CUSTOMER_PASSWORD` in local `server/.env` | Customer routes |
| Customer B | `customer.b@example.test` | Same customer password | Customer routes |
| Operator A | `operator.a@example.test` | `DEMO_OPERATOR_PASSWORD` | R only |
| Operator B | `operator.b@example.test` | Same operator password | S only |

Queue R accepts parties 1–4; S accepts 5–8. Both start OPEN with counter zero and no entries. Each has an independent FIFO counter and one CALLED/SERVING slot; one active entry per customer applies across both queues. Existing historical parties retain their original numbers and may finish service. Seed does not renumber or reroute history.

### Starting the Server and Client

**Terminal 1 — Server**

```bash
cd server
npm run dev
```

**Terminal 2 — Client**

```bash
cd client
npm run dev
```

Open [login](http://127.0.0.1:5173/login). Use the seeded email and corresponding local password above. Customers reach `/queues`, join their party-size queue, then open `/my-queue`; operators reach `/operator/desk`. Operators call the FIFO head, start service, then complete it. Reload restores the session from `/auth/me`.

The **View public board** link is available from the login/home screen and authenticated pages. Anonymous URLs:

- [Both queues](http://127.0.0.1:5173/board)
- [Queue R](http://127.0.0.1:5173/board/R)
- [Queue S](http://127.0.0.1:5173/board/S)

Boards poll every ten seconds while visible and support manual refresh/retry. They show only queue code, called number/state and waiting count. Public boards have no login controls or customer details.

API runs at `http://127.0.0.1:3000`; Vite proxies `/api/v1` and `/health`. Use the same hostname as `WEB_ORIGIN`: `localhost` and `127.0.0.1` are different origins. When changing API port, set client `API_PROXY_TARGET`. Authenticated mutations require the configured Origin and JSON where specified. Sessions use opaque tokens in HttpOnly SameSite=Lax cookies, SHA-256 hashes in PostgreSQL, and an absolute eight-hour lifetime.

From the repository root, check health and build both packages:

```bash
curl --fail http://127.0.0.1:3000/health
npm --prefix server run build
npm --prefix client run build
# After building, with the same server environment configured:
npm --prefix server start
```

Startup connects to PostgreSQL before listening; it does not migrate, seed or delete data. `/health` is process health, not a continuous database readiness monitor. Production hosting must serve the built client with SPA route fallback and proxy the API under the same origin. No deployment is represented as verified.

## Running Tests

Install Chromium once:

```bash
cd client
npx playwright install chromium
cd ..
```

Use a fresh, disposable `_test` database and configure `TEST_DATABASE_URL` separately from `DATABASE_URL`. Prepare it explicitly; the E2E launcher does not automatically migrate or seed:

```bash
# This subprocess overrides DATABASE_URL only for migrating/seeding TEST_DATABASE_URL.
node --input-type=module <<'JS'
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
const require = createRequire(new URL('./server/package.json', import.meta.url));
require('dotenv').config({ path: 'server/.env', quiet: true });
const { testDatabaseUrl } = await import('./server/src/infrastructure/test-database.ts');
const databaseUrl = testDatabaseUrl(process.env.TEST_DATABASE_URL, process.env.DATABASE_URL);
for (const task of ['db:migrate', 'db:seed']) {
  const result = spawnSync('npm', ['--prefix', 'server', 'run', task], {
    env: { ...process.env, DATABASE_URL: databaseUrl }, stdio: 'inherit',
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
JS
npm --prefix server run test:unit -- --reporter=verbose
npm --prefix server run test:api -- --reporter=verbose
npm --prefix client run test:ui -- --reporter=verbose
E2E_API_PORT=3100 E2E_WEB_PORT=5273 npm --prefix client run test:e2e
npm --prefix server run build
npm --prefix client run build
```

The preparation snippet uses Node's TypeScript support (Node 22.18+ or Node 24). The database guard refuses missing URLs, names without `_test`, and matching development/test database names. API tests deploy migrations and use real PostgreSQL fixtures. Run API and E2E suites **sequentially** because they share the test database. Reserve ports 3302/3310 for restart tests and 3100/5273 for the example E2E servers. Stop other servers on configured ports; Playwright does not reuse an existing server.

The release journey requires a clean seeded fixture: both counters zero and no queue entries. It asserts this instead of clearing unknown data to manufacture `R-0001`. Fixtures clean their own synthetic data; these commands are unsuitable for a shared database. To rerun against a database containing other entries, provision a new disposable `_test` database and update the URL. Test fixture cleanup can restore test counters; application workflows never reset counters or delete audit history.

## Sprint 1 Documentation and Verification

- [Specification](docs/sprint-1/specification.md) — requirements, business rules, authorization, queue lifecycle and approved R/S scope.
- [API specification](docs/sprint-1/api-spec.md) — endpoints, response envelopes, status codes and privacy contracts.
- [Test specification](docs/sprint-1/tests.md) — planned test IDs, traceability and recorded execution status.
- [UI specification](docs/ui-spec.md) — current app-wide tokens, shared components, page layouts, typography preservation and measured contrast.
- [Sprint UI contract](docs/sprint-1/ui-spec.md) — interaction/accessibility requirements and historical visual refinements.
- [Acceptance coverage](docs/sprint-1/acceptance-coverage.md) — AC-001–044 and TEST-001–049 mappings to executed cases.
- [Integration and release verification](docs/sprint-1/release-verification.md) — executed commands, tested working-tree provenance, persistence, privacy and known release risks.
- [App-wide visual verification](artifacts/evidence/app-visual-system/verification.md) — typography/contrast checks and labeled screenshots of applicable page states.
- [Draft v0.1.0 release notes](docs/releases/v0.1.0.md) — included features, operation notes and outstanding release gates.

Each verification report describes its own executed commands and tested revision; earlier counts are historical, not a fresh test run for this README edit. The recorded server dependency audit identified four high-severity affected packages in the Prisma chain; dependency/security review remains an unresolved release item. Passing local checks do not establish teammate approval, branch integration, production deployment or a published release.

Environment files, dependencies, caches, build outputs and runner output directories are ignored. Curated synthetic evidence is intentionally retained under `artifacts/evidence`; credentials must remain in ignored local configuration.
