# Lab 5 — CI Workflow and Test Commands

## 1. CI Workflow

The Restaurant Queue Management project uses GitHub Actions for continuous integration.

Workflow file: `.github/workflows/ci.yml`

The workflow runs automatically when a pull request targets `staging` or `main`, and when changes are pushed to either branch.

## 2. Build and Test Job

The `Build and Test` job runs on Ubuntu with Node.js 22 and PostgreSQL 16.

The workflow installs dependencies, generates the Prisma Client, builds the server, applies database migrations through the API test runner, and executes automated tests.

The development and test database names are kept separate to prevent tests from modifying development data.

Synthetic customer and operator passwords are supplied through GitHub Actions repository secrets.

## 3. Backend Verification

Run from the `server` directory:

```bash
npm ci
npm run db:generate
npm run build
npm run test:unit
npm run test:api
```

Verified results:

- Backend unit tests: 10 passed.
- Backend API tests: 80 passed.
- Database migrations: No pending migrations.

## 4. Frontend Verification

Run from the `client` directory:

```bash
npm ci
npm run build
npm run test:ui
```

Verified results:

- Frontend production build: Passed.
- Frontend UI tests: 75 passed.

## 5. Docker Build Verification

Run from the repository root:

```bash
docker build -t restaurant-queue-server:ci .
docker build -f client/Dockerfile -t restaurant-queue-client:ci .
```

The CI workflow verifies that both Docker images can be built.

## 6. CI Execution Results

GitHub Actions initially reported failed checks because of incorrect database configuration, Docker build context, and missing synthetic seed credentials.

After correcting these issues, both `Build and Test` and `Docker Build` passed on PR #32.

The project uses pull request reviews before merging into `staging`. Required CI status checks must also be configured in GitHub branch protection to prevent merging when tests fail.

## 7. Verification Evidence

Evidence to include in the Lab 5 report:

- Screenshot of the passing GitHub Actions checks.
- Screenshot of an earlier failed GitHub Actions execution.
- Screenshot of the pull request review requirement.
- Screenshot of required status checks and merge blocking, once verified.
