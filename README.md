# CPE334 Restaurant Queue and Service Management System

Sprint 1 integrates F01–F05: session authentication, queue assignments, customer joining and private status, anonymous public boards, and FIFO operator service. React/Vite/TypeScript, Express/TypeScript, PostgreSQL/Prisma, Argon2id, Vitest/Supertest and Playwright. The four [engineering contracts](docs/sprint-1/specification.md) include the approved two-queue revision.

## Requirements and installation

Use Node.js 22 or later (tested: 24.14.0), npm, and a running PostgreSQL server (tested: Homebrew PostgreSQL 17.11 on macOS ARM64). Run commands from the repository root. This verification used local PostgreSQL without Docker.

```sh
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

```sh
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

## Run the application

Use separate terminals:

```sh
npm --prefix server run dev
npm --prefix client run dev
```

Open [login](http://127.0.0.1:5173/login). Use the seeded email and corresponding local password above. Customers reach `/queues`, join their party-size queue, then open `/my-queue`; operators reach `/operator/desk`. Operators call the FIFO head, start service, then complete it. Reload restores the session from `/auth/me`.

The **View public board** link is available from the login/home screen and authenticated pages. Anonymous URLs:

- [Both queues](http://127.0.0.1:5173/board)
- [Queue R](http://127.0.0.1:5173/board/R)
- [Queue S](http://127.0.0.1:5173/board/S)

Boards poll every ten seconds while visible and support manual refresh/retry. They show only queue code, called number/state and waiting count. Public boards have no login controls or customer details.

API runs at `http://127.0.0.1:3000`; Vite proxies `/api/v1` and `/health`. Use the same hostname as `WEB_ORIGIN`: `localhost` and `127.0.0.1` are different origins. When changing API port, set client `API_PROXY_TARGET`. Authenticated mutations require the configured Origin and JSON where specified. Sessions use opaque tokens in HttpOnly SameSite=Lax cookies, SHA-256 hashes in PostgreSQL, and an absolute eight-hour lifetime.

```sh
curl --fail http://127.0.0.1:3000/health
npm --prefix server run build
npm --prefix client run build
# After building, with the same server environment configured:
npm --prefix server start
```

Startup connects to PostgreSQL before listening; it does not migrate, seed or delete data. `/health` is process health, not a continuous database readiness monitor. Production hosting must serve the built client with SPA route fallback and proxy the API under the same origin. No deployment is represented as verified.

## Tests

Install Chromium once:

```sh
cd client
npx playwright install chromium
cd ..
```

Use a fresh, disposable `_test` database and configure `TEST_DATABASE_URL` separately from `DATABASE_URL`. Prepare it explicitly; the E2E launcher does not automatically migrate or seed:

```sh
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

## Verification and release status

Latest local run: **161 passed, 0 failed, 0 skipped** (10 unit, 80 API, 53 UI, 18 E2E); both TypeScript/build commands passed. All AC-001–044 and TEST-001–049 have executed traceability. Additional TEST-050–057 protect origins, errors and approved R/S behavior.

- [Acceptance coverage](docs/sprint-1/acceptance-coverage.md)
- [Commands, results, screenshots, restart and security evidence](docs/sprint-1/release-verification.md)
- [Draft v0.1.0 release notes and outstanding release risks](docs/releases/v0.1.0.md)

Server dependency audit reports four high-severity affected packages in the Prisma dependency chain; client audit reports zero. These remain unresolved and require dependency/security review before release. Local passing tests do not establish peer approval, GitHub mergeability, deployment readiness or a published release.

Environment files, dependencies, bundler caches, build outputs and runner output directories are ignored. Curated evidence is intentionally retained under `artifacts/evidence/sprint1`; it contains synthetic workflow data, no credentials. Registration, cancellation, no-shows, notifications, multiple counters per queue, administration and later-sprint features remain outside this implementation.
