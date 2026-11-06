# CPE334 Restaurant Queue and Service Management System

Issue02 foundation: React/Vite/TypeScript client, Express/TypeScript API, persistent PostgreSQL with Prisma, Argon2id synthetic seed, Vitest/Supertest and Playwright. Authentication, joining and operator workflows are subsequent issues. Only `GET /health` is implemented as an API endpoint.

## Requirements and installation

Use Node.js 24 LTS (verified with 24.14.0), npm 11, and PostgreSQL 16 (verified with 16.15). Run commands from the repository root. Install/start PostgreSQL using your platform's package manager first. No Docker is required.

```sh
npm --prefix server ci
npm --prefix client ci
cp server/.env.example server/.env
cp client/.env.example client/.env
```

Provision a dedicated local login and **two different databases** using a PostgreSQL administrator connection. In `psql`, use `\password queue_local` to set a local password interactively:

```sql
CREATE ROLE queue_local LOGIN;
\password queue_local
CREATE DATABASE restaurant_queue OWNER queue_local;
CREATE DATABASE restaurant_queue_test OWNER queue_local;
```

Edit ignored `server/.env`: replace `QUEUE_USER` with `queue_local`, `LOCAL_PASSWORD` with the URL-encoded local password, and set the PostgreSQL host/port. Supply generated synthetic values for `DEMO_CUSTOMER_PASSWORD` and `DEMO_OPERATOR_PASSWORD`. For example, this writes random passwords directly to the local file without printing them:

```sh
node --input-type=module -e 'import fs from "node:fs"; import crypto from "node:crypto"; const p="server/.env"; let s=fs.readFileSync(p,"utf8"); for (const k of ["DEMO_CUSTOMER_PASSWORD","DEMO_OPERATOR_PASSWORD"]) s=s.replace(new RegExp("^"+k+"=.*$","m"),k+"="+crypto.randomBytes(24).toString("base64url")); fs.writeFileSync(p,s,{mode:0o600});'
```

The local passwords are synthetic secrets; keep them in the ignored environment file. Never use real personal credentials. `DATABASE_URL` is server-only; never expose it through a `VITE_` variable. Reserved auth settings in the example are for later work and have no authentication behavior yet.

```sh
npm --prefix server run db:generate
npm --prefix server run db:migrate
npm --prefix server run db:seed
```

`db:migrate` uses Prisma migrate deploy; it never resets data. `db:seed` upserts by email/code in a transaction. Fresh data is queue `R` / `Restaurant Waiting Queue` in `OPEN`, Customer A/B (`customer.a@example.test`, `customer.b@example.test`), Operator A/B (`operator.a@example.test`, `operator.b@example.test`), and only Operator A assigned to R. No entries are seeded. Passwords are Argon2id hashes. Rerunning seed preserves existing hashes, account settings, queue state, sequence counters, entries, history and other assignments; it is not a password rotation or assignment reconciliation tool. Conflicting existing account roles cause seed to fail safely.

## Start and build

In separate terminals:

```sh
npm --prefix server run dev
npm --prefix client run dev
```

API: `http://127.0.0.1:3000`; UI: `http://127.0.0.1:5173`. Vite proxies `/api/v1` and `/health` to port 3000. If changing `PORT`, also change both Vite proxy targets and Playwright's backend URL. Startup connects to PostgreSQL before listening; no migrations, seeds or deletions run on startup. Health is a public process health response, not a continuous DB readiness monitor.

```sh
curl --fail http://127.0.0.1:3000/health
# {"status":"ok","service":"restaurant-queue-api"}
npm --prefix server run build
npm --prefix client run build
npm --prefix server start
```

Stop the development API before using `start` on the same port. Frontend production output is `client/dist`; API output is `server/dist`. Production same-origin hosting is a later deployment task.

## Tests

`TEST_DATABASE_URL` must identify a dedicated disposable PostgreSQL database whose name ends in `_test`, different from `DATABASE_URL`. API tests migrate that database automatically, create synthetic fixture entries, and remove only the entries they created. They never truncate tables or reset databases. Use a fresh, empty test database for initial validation; retain the same ignored synthetic passwords across repeat runs. Do not use a shared/production database. Unexpected unrelated records intentionally fail the exact seed-count assertions.

```sh
npm --prefix server run test:unit
npm --prefix server run test:api
npm --prefix client run test:ui
cd client
npx playwright install chromium
cd ..
npm --prefix client run test:e2e
```

Run API tests before E2E. Leave ports 3000, 3001 and 5173 free. Playwright starts/stops its own API and Vite servers; its API uses `TEST_DATABASE_URL`. The smoke test loads React and verifies Vite proxies the real Express health response. It is not the future full queue journey.

Schema uses UUID primary keys, restricted foreign-key deletion, normalized lowercase unique emails, UTC `TIMESTAMPTZ`, bigint sequence counters, party size checks and database partial unique indexes for one active entry per customer and one active service slot per queue. SQL-only constraints are in `server/prisma/migrations/0001_foundation/migration.sql`; preserve them in later migrations rather than replacing migrations with `db push`. Lifecycle values WAITING/CALLED/SERVING/COMPLETED and reserved CANCELLED/NO_SHOW, plus OPEN/PAUSED/CLOSED queue states, are persisted enums. Service transition enforcement, immutable fields and append-only event writes belong to the later queue service; no transition endpoints exist here. Operator role enforcement currently occurs in seed, as specified, and must also be enforced by future assignment services.

TEST-015 support includes durable entry/event tables, sequence-preserving seed and a real process restart test for foundation data. Full entry/event restart verification must be added once join/read APIs exist; it is **not claimed complete**.

Engineering contracts: [specification](docs/sprint-1/specification.md), [API](docs/sprint-1/api-spec.md), [tests](docs/sprint-1/tests.md), [UI](docs/sprint-1/ui-spec.md). Actual foundation validation and limitations: [verification](docs/foundation-verification.md). The baseline docs describe the entire future sprint, not completed functionality.

Implementation and local verification were assisted by Codex; teammate review and release acceptance remain outstanding.
