# CPE334 Restaurant Queue and Service Management System

React/Vite/TypeScript client, Express/TypeScript API, PostgreSQL with Prisma, Argon2id synthetic seed, Vitest/Supertest and Playwright. F-01 implements login, current identity, logout and database-backed sessions. Queue joining and operator service workflows remain subsequent features.

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

The local passwords are synthetic secrets; keep them in the ignored environment file. Never use real personal credentials. `DATABASE_URL` is server-only; never expose it through a `VITE_` variable. Set `WEB_ORIGIN` to the exact browser origin, including host and port (default `http://127.0.0.1:5173`). Use that same hostname in the browser; `localhost` and `127.0.0.1` are different origins. `COOKIE_SECURE=true` enables HTTPS cookies locally; production always uses Secure even if this setting is false. Sessions expire absolutely after eight hours, with no sliding renewal or configurable TTL.

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

Run API tests before E2E. Leave ports 3000, 3001 and 5173 free. Playwright starts/stops its own API and Vite servers; its API uses `TEST_DATABASE_URL`. The smoke test verifies the real Express health proxy. TEST-001 also exercises customer/operator login, reload identity, 360 px layout and logout through React → Express → PostgreSQL. Run API tests first to seed the test database. It is not the future full queue journey.

Schema uses UUID primary keys, restricted foreign-key deletion, normalized lowercase unique emails, UTC `TIMESTAMPTZ`, bigint sequence counters, party size checks and database partial unique indexes for one active entry per customer and one active service slot per queue. SQL-only constraints are in `server/prisma/migrations/0001_foundation/migration.sql`; preserve them in later migrations rather than replacing migrations with `db push`. Lifecycle values WAITING/CALLED/SERVING/COMPLETED and reserved CANCELLED/NO_SHOW, plus OPEN/PAUSED/CLOSED queue states, are persisted enums. Service transition enforcement, immutable fields and append-only event writes belong to the later queue service; no transition endpoints exist here. Operator role enforcement currently occurs in seed, as specified, and must also be enforced by future assignment services.

TEST-015 support includes durable entry/event tables, sequence-preserving seed and a real process restart test for foundation data. Full entry/event restart verification must be added once join/read APIs exist; it is **not claimed complete**.

Engineering contracts: [specification](docs/sprint-1/specification.md), [API](docs/sprint-1/api-spec.md), [tests](docs/sprint-1/tests.md), [UI](docs/sprint-1/ui-spec.md). Actual foundation validation and limitations: [verification](docs/foundation-verification.md). The baseline docs describe the entire future sprint, not completed functionality.

Implementation and local verification were assisted by Codex; teammate review and release acceptance remain outstanding.

## Login and sessions (F-01)

Open `/login` and use one of the seeded emails above with its ignored local role-specific password. The form has no role selector. Customer login opens `/queues`; operator login opens `/operator/desk`. These are authenticated landing pages; queue and service controls are not implemented yet. Reload uses `GET /api/v1/auth/me` to restore identity. `Log out` revokes the current session in PostgreSQL before clearing its cookie; other sessions remain active.

Auth endpoints: `POST /api/v1/auth/login` (email/password JSON → 200 safe identity and expiry); `GET /api/v1/auth/me` (200 safe identity); `POST /api/v1/auth/logout` (JSON `{}` → 204). Errors follow the engineering API envelope. Missing/expired/revoked sessions return 401; unknown account and wrong password return the same generic 401. Invalid fields return 422; malformed JSON returns 400. Unsafe requests require `application/json` and an exact allowed `Origin` (missing/opaque/foreign origins return 403). Browser fetch supplies Origin automatically. Command-line clients must explicitly supply it.

`qs_session` contains 32 random bytes encoded as base64url and uses HttpOnly, SameSite=Lax, Path=/, and Max-Age=28800. Only its SHA-256 digest persists in the existing sessions table. Authentication checks the session and account activity in PostgreSQL on each protected request. Passwords must use Argon2id. Responses are marked `Cache-Control: no-store`; credentials and internal exceptions are not logged. Private queue API namespaces enforce the session gate, with authenticated queue operations still returning 404 until their feature is implemented.

F-01 test commands, actual RED/GREEN output, counts and limitations: [verification](docs/f01-verification.md). To select a planned test: `npm --prefix server run test:api -- -t TEST-006`. No schema migration is needed for F-01.
