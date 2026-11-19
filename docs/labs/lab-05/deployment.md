# Lab 5 — CI, First GCP Deployment, and Secure GitHub Integration

## Document scope and verification status

This document preserves the earlier continuous integration (Sections 1–7) and
manual first deployment runbook (Sections 8–17) and adds Lab 5.6 secure GitHub
integration, branch protection, and evidence requirements (Sections 18–31).

The execution history below reflects **reported Cloud Run and Cloud Run Jobs
outputs**, not independent access to the GCP project. Do not mark a step
complete until its actual command, GitHub check, or screenshot confirms success.

| Area | Last confirmed result | Still to verify |
| --- | --- | --- |
| Existing CI | `Build and Test` and `Docker Build` passed on PR #32 | Current Lab 5.6 PR CI run |
| Cloud SQL and Prisma | Migration job succeeded; migrations `0001_foundation` and `0002_immutable_queue_sequence` applied | Application persistence test if not already completed |
| Database seed | Synthetic seed job finished successfully | Demo login and end-to-end queue workflows if not already completed |
| Cloud Run services | `restaurant-api` and `restaurant-web` deployed in `asia-southeast1`; API revision `restaurant-api-00002-vxs` reported serving all traffic | Browser login, operator workflow, evidence capture |
| API reverse proxy | `POST /api/v1/auth/login` returned the expected HTTP 401 for deliberately invalid credentials with a matching Origin | Browser login HTTP 403 investigation, unless independently resolved |
| Lab 5.6 Workload Identity Federation | Not yet confirmed | Provider, identity, IAM binding, GitHub Actions run |
| Lab 5.6 branch protection | Not yet confirmed | `main` and `staging` rulesets and failing PR evidence |

Confirmed service URLs:

- Frontend: <https://restaurant-web-608461234576.asia-southeast1.run.app>
- Backend: <https://restaurant-api-608461234576.asia-southeast1.run.app>

Project: `cpe334-final-project-theme9` (number `608461234576`).
Region: `asia-southeast1`.

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


## 8. Lab 5.5 scope and architecture

This is the reusable manual deployment runbook for issue #37. The earlier
commands have been executed successfully for this project as summarized in the
status table above, but the instructions remain useful for verification and
recovery. **Do not repeat cloud mutations, image pushes, jobs, or cleanup without
an explicit need and the project owner's approval.** Run commands one block at a
time in Bash in the appropriate environment. Build images on a machine with
Docker available; use Cloud Shell for gcloud administration. Stop on errors;
do not paste the entire guide as a script.

```text
Browser --HTTPS--> frontend Cloud Run (Nginx, PORT=8080)
                     / and SPA routes -> built React
                     /api/v1/* and /health --verified HTTPS--> backend Cloud Run
                                                                |
                                         /cloudsql/PROJECT:REGION:INSTANCE
                                                                |
                                                     Cloud SQL PostgreSQL
                                      users, sessions, queues, entries, events
Migration job and seed job use the SAME backend image and Cloud SQL connection.
Secret Manager supplies DATABASE_URL; only the seed job receives demo passwords.
```

The backend remains a separate Express service. Its current Dockerfile already
listens on `PORT`, includes Prisma CLI, tsx, migrations, `prisma/seed.ts` and
`scripts/seed.ts`, and starts only `node dist/index.js`. Do not prune development
dependencies from that image without providing an alternative job image.
No migration or seed runs during API instance startup.

The browser still fetches `/api/v1` with `credentials: same-origin`. Nginx forwards
Cookie, Set-Cookie and the unchanged Origin; it uses the backend hostname for
upstream Host and TLS SNI and verifies its certificate. Cookies have no Domain,
so the browser stores the returned HttpOnly/Secure/SameSite=Lax session cookie
against the **frontend** origin. Set `WEB_ORIGIN` to exactly that HTTPS origin,
without a trailing slash. No CORS changes or cross-site cookies are required.
Do not rewrite Origin to the backend or disable the existing origin checks.

For this minimal Lab 5.5 design both Cloud Run endpoints allow unauthenticated
HTTP invocation. Application authentication and authorization still protect
private API routes. The backend is publicly reachable, including its public board;
Origin checking is CSRF protection, not an IAM access boundary. A private backend
would require an authenticated proxy and is not implemented here.

## 9. Prerequisites, account, project and region

Use the existing approved GCP project, region and budget from Lab 5.1. Confirm
billing/credits and budget alerts in Console before provisioning. Cloud SQL costs
continue when Cloud Run scales to zero. Required local/Cloud Shell tools: Bash,
gcloud, Docker with a running daemon and buildx, Python 3, and curl.

```bash
gcloud auth list --filter=status:ACTIVE --format='value(account)'
export PROJECT_ID='YOUR_PROJECT_ID'
export REGION='YOUR_REGION'
export AR_REPO='YOUR_ARTIFACT_REGISTRY_REPOSITORY'
export SQL_INSTANCE='YOUR_CLOUD_SQL_INSTANCE'
export DB_NAME='YOUR_APPLICATION_DATABASE'
export DB_USER='YOUR_APPLICATION_DATABASE_USER'
export API_SERVICE='YOUR_BACKEND_SERVICE'
export WEB_SERVICE='YOUR_FRONTEND_SERVICE'
export MIGRATE_JOB='YOUR_MIGRATION_JOB'
export SEED_JOB='YOUR_SEED_JOB'
export RUNTIME_SA_NAME='YOUR_BACKEND_RUNTIME_SA_NAME'
export WEB_SA_NAME='YOUR_FRONTEND_RUNTIME_SA_NAME'
export DB_SECRET='YOUR_DATABASE_URL_SECRET'
export CUSTOMER_SECRET='YOUR_CUSTOMER_PASSWORD_SECRET'
export OPERATOR_SECRET='YOUR_OPERATOR_PASSWORD_SECRET'
export RUNTIME_SA="${RUNTIME_SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
export WEB_SA="${WEB_SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
gcloud projects describe "$PROJECT_ID"
git status --short
git rev-parse HEAD
```

Replace every `YOUR_*` placeholder. Use simple lowercase names with permitted
hyphens/underscores; database names/users must be URL encoded if unusual.
Record the reviewed source revision and local diff used for the build. For an
uncommitted review build use a unique manual tag rather than claiming it is a
clean commit image. Do not commit or push Git changes as part of this guide.

The human operator needs the following roles, or narrower custom equivalents,
only for the actions they are approved to perform. Existing organization-managed
permissions may already provide them; request missing access rather than granting
these automatically.

| Principal / scope | Role | Purpose |
| --- | --- | --- |
| Operator / project | roles/serviceusage.serviceUsageAdmin | Enable required APIs |
| Operator / project or registry | roles/artifactregistry.admin | Create repository and push images (writer suffices for an existing repository) |
| Operator / project | roles/cloudsql.admin | Provision SQL instance, database and user |
| Operator / project or selected secrets | roles/secretmanager.admin | Create secrets, versions and per-secret bindings |
| Operator / project | roles/iam.serviceAccountAdmin | Create dedicated runtime accounts |
| Operator / project | roles/resourcemanager.projectIamAdmin | Grant the runtime Cloud SQL Client binding |
| Operator / project | roles/run.admin | Deploy services/jobs and configure public invocation |
| Operator / selected runtime accounts | roles/iam.serviceAccountUser | Act as the backend/frontend SA when deploying |
| Backend SA / project | roles/cloudsql.client | Connect through the Cloud SQL attachment |
| Backend SA / three selected secrets | roles/secretmanager.secretAccessor | Read only this application's pinned credentials |
| Frontend SA | No application-specific grants | Serve static files and proxy public HTTPS backend |

Provisioning privileges belong to the operator, not the application. Do not solve
permission failures by granting Owner to runtime SAs. For same-project images,
Cloud Run's managed service agent handles image pulling; cross-project registries
require an explicit registry-reader grant to that service agent and are outside
this example.

After approval, enable missing APIs:

```bash
gcloud services enable run.googleapis.com sqladmin.googleapis.com   artifactregistry.googleapis.com secretmanager.googleapis.com   iam.googleapis.com --project="$PROJECT_ID"
```

Cloud Build and WIF are unnecessary for this manual Docker build procedure.

## 10. Inventory and provision only missing resources

First inspect Console and these lists. An error is not proof a resource is absent;
check permissions and the selected project before creating anything.

```bash
gcloud artifacts repositories list --location="$REGION" --project="$PROJECT_ID"
gcloud sql instances list --project="$PROJECT_ID"
gcloud iam service-accounts list --project="$PROJECT_ID"
gcloud secrets list --project="$PROJECT_ID"
gcloud run services list --region="$REGION" --project="$PROJECT_ID"
gcloud run jobs list --region="$REGION" --project="$PROJECT_ID"
```

Run only the applicable creation commands after approval; reuse compatible existing
resources and never reset an existing SQL user's password as an initialization step.

```bash
gcloud artifacts repositories create "$AR_REPO" --repository-format=docker \
  --location="$REGION" --project="$PROJECT_ID"
gcloud sql instances create "$SQL_INSTANCE" --database-version=POSTGRES_16 \
  --edition=enterprise --tier=db-f1-micro --region="$REGION" \
  --storage-size=10GB --storage-type=SSD --backup-start-time=03:00 \
  --project="$PROJECT_ID"
gcloud sql databases create "$DB_NAME" --instance="$SQL_INSTANCE" --project="$PROJECT_ID"
gcloud iam service-accounts create "$RUNTIME_SA_NAME" --project="$PROJECT_ID"
gcloud iam service-accounts create "$WEB_SA_NAME" --project="$PROJECT_ID"
```

This small teaching instance uses the Cloud SQL public-IP connector path with a
Cloud Run Unix socket attachment, not direct internet PostgreSQL access. Do not
add `0.0.0.0/0` authorized networks. Confirm the instance has public IP enabled;
a private-IP-only instance requires separate VPC networking outside this runbook.
Review backup retention, region availability, quotas and tier cost in Console.

In **SQL > instance > Users**, create the chosen built-in database user only if
absent, using a strong password kept in a password manager. Use that same password
when preparing the connection secret below. Cloud SQL's built-in user must have
permission to create the application tables and constraints in the selected
application database. Do not point migrations at another application's database.

```bash
export SQL_CONNECTION="$(gcloud sql instances describe "$SQL_INSTANCE" \
  --project="$PROJECT_ID" --format='value(connectionName)')"
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${RUNTIME_SA}" --role=roles/cloudsql.client \
  --condition=None
```

The separate frontend SA receives no database or secret access. The backend SA is
also used for the two explicit initialization jobs for this lab; it has no SQL
admin or provisioning role. No service account JSON keys are needed.

## 11. Secret Manager credentials

Create missing secret containers only:

```bash
for secret in "$DB_SECRET" "$CUSTOMER_SECRET" "$OPERATOR_SECRET"; do
  gcloud secrets create "$secret" --replication-policy=automatic --project="$PROJECT_ID"
done
```

For a **new** database URL secret, this snippet prompts privately for the existing
SQL user's password and streams the URL to Secret Manager without printing it or
writing it into a tracked file. Do not enable shell tracing (`set -x`).

```bash
python3 - <<'PYSECRET'
import getpass, os, subprocess
from urllib.parse import quote
e = os.environ
password = getpass.getpass('Existing Cloud SQL user password: ')
url = ('postgresql://' + quote(e['DB_USER'], safe='') + ':' + quote(password, safe='')
       + '@localhost/' + quote(e['DB_NAME'], safe='') + '?host='
       + quote('/cloudsql/' + e['SQL_CONNECTION'], safe='/')
       + '&schema=public&connection_limit=3')
subprocess.run(['gcloud', 'secrets', 'versions', 'add', e['DB_SECRET'],
                '--project=' + e['PROJECT_ID'], '--data-file=-'],
               input=url.encode(), check=True)
PYSECRET
```

Generate initial demo passwords only when their secrets have no existing approved
values. This app has four demo identities, not an administrator or registration
flow. Never copy the starter's `ADMIN_PASSWORD` or `SEED_DEMO_DATA` variables.

```bash
for secret in "$CUSTOMER_SECRET" "$OPERATOR_SECRET"; do
  python3 -c 'import secrets,sys; sys.stdout.write(secrets.token_urlsafe(32))' |   \
  gcloud secrets versions add "$secret" --data-file=- --project="$PROJECT_ID"
done
for secret in "$DB_SECRET" "$CUSTOMER_SECRET" "$OPERATOR_SECRET"; do
  gcloud secrets add-iam-policy-binding "$secret" --project="$PROJECT_ID"   \
  --member="serviceAccount:${RUNTIME_SA}" --role=roles/secretmanager.secretAccessor
done
```

Inspect version metadata in Secret Manager and set numeric approved versions:

```bash
export DB_SECRET_VERSION='YOUR_NUMERIC_VERSION'
export CUSTOMER_SECRET_VERSION='YOUR_NUMERIC_VERSION'
export OPERATOR_SECRET_VERSION='YOUR_NUMERIC_VERSION'
```

Pin versions for reproducibility. The running API only receives DATABASE_URL.
Demo passwords are injected only into the seed job. Access account passwords
privately through Console for browser verification; do not record them in evidence.
Seed preserves existing passwords and account flags: adding a secret version and
rerunning seed does **not** rotate an existing user's password.

## 12. Build and push the two images manually

Run from the reviewed repository root, using the existing backend Dockerfile and
the additional frontend Cloud Run Dockerfile. Cloud Run requires a compatible
Linux image; explicitly build amd64 on ARM Macs as well.

```bash
export IMAGE_TAG='YOUR_UNIQUE_REVIEWED_BUILD_TAG'
export IMAGE_BASE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${AR_REPO}"
export API_IMAGE="${IMAGE_BASE}/restaurant-api:${IMAGE_TAG}"
export WEB_IMAGE="${IMAGE_BASE}/restaurant-web:${IMAGE_TAG}"
gcloud auth configure-docker "${REGION}-docker.pkg.dev"
docker buildx build --platform linux/amd64 --load -t "$API_IMAGE" -f Dockerfile .
docker buildx build --platform linux/amd64 --load -t "$WEB_IMAGE" -f client/Dockerfile.cloudrun .
docker push "$API_IMAGE"
docker push "$WEB_IMAGE"
export API_DIGEST="$(gcloud artifacts docker images describe "$API_IMAGE" \
  --project="$PROJECT_ID" --format='value(image_summary.digest)')"
export WEB_DIGEST="$(gcloud artifacts docker images describe "$WEB_IMAGE" \
  --project="$PROJECT_ID" --format='value(image_summary.digest)')"
export API_IMAGE="${IMAGE_BASE}/restaurant-api@${API_DIGEST}"
export WEB_IMAGE="${IMAGE_BASE}/restaurant-web@${WEB_DIGEST}"
```

Confirm both digests are nonempty `sha256:...` before continuing. Deploy jobs and
services from those same digest references. No credentials are build arguments.

## 13. Explicit Cloud SQL initialization jobs

Review the target project, SQL connection, database, image and migrations before
executing either job. Back up an existing database first. One task, no automatic
retries, and one execution at a time avoid concurrent initialization.

```bash
gcloud run jobs deploy "$MIGRATE_JOB" --project="$PROJECT_ID" --region="$REGION" \
  --image="$API_IMAGE" --service-account="$RUNTIME_SA" \
  --set-cloudsql-instances="$SQL_CONNECTION" \
  --set-secrets="DATABASE_URL=${DB_SECRET}:${DB_SECRET_VERSION}" \
  --set-env-vars=NODE_ENV=production,TZ=UTC \
  --command=npm --args=run,db:migrate \
  --tasks=1 --parallelism=1 --max-retries=0 --task-timeout=300s
gcloud run jobs execute "$MIGRATE_JOB" --project="$PROJECT_ID" --region="$REGION" --wait
```

Stop if migration fails; inspect Cloud Run Job execution logs. Do not start the
seed or application against an unverified schema. `prisma migrate deploy` applies
the committed migrations without `migrate reset`, `db push`, or development tooling.

```bash
gcloud run jobs deploy "$SEED_JOB" --project="$PROJECT_ID" --region="$REGION" \
  --image="$API_IMAGE" --service-account="$RUNTIME_SA" \
  --set-cloudsql-instances="$SQL_CONNECTION" \
  --set-secrets="DATABASE_URL=${DB_SECRET}:${DB_SECRET_VERSION},DEMO_CUSTOMER_PASSWORD=${CUSTOMER_SECRET}:${CUSTOMER_SECRET_VERSION},DEMO_OPERATOR_PASSWORD=${OPERATOR_SECRET}:${OPERATOR_SECRET_VERSION}" \
  --set-env-vars=NODE_ENV=production,TZ=UTC \
  --command=npm --args=run,db:seed \
  --tasks=1 --parallelism=1 --max-retries=0 --task-timeout=300s
gcloud run jobs execute "$SEED_JOB" --project="$PROJECT_ID" --region="$REGION" --wait
```

Seed uses the existing transaction and upserts: creates queues R/S, four synthetic
users and their operator assignments; preserves history, counters, hashes and
sessions; fails on conflicting roles or assignments. Successful execution must be
recorded, not inferred from `/health`. Do not automatically seed on every revision.

## 14. Deploy backend and frontend, then set the browser origin

First deploy the initialized backend with an intentionally nonmatching placeholder
origin. Login remains blocked until the actual frontend URL is known. For an
existing backend, preserve its known WEB_ORIGIN rather than temporarily blocking it.
The first command below is for a new service.

```bash
gcloud run deploy "$API_SERVICE" --project="$PROJECT_ID" --region="$REGION" \
  --image="$API_IMAGE" --service-account="$RUNTIME_SA" \
  --execution-environment=gen2 --port=3000 --allow-unauthenticated \
  --set-cloudsql-instances="$SQL_CONNECTION" \
  --set-secrets="DATABASE_URL=${DB_SECRET}:${DB_SECRET_VERSION}" \
  --set-env-vars=NODE_ENV=production,TZ=UTC,COOKIE_SECURE=true,WEB_ORIGIN=https://unconfigured.invalid \
  --min-instances=0 --max-instances=2 --concurrency=20 --memory=512Mi --cpu=1
export API_URL="$(gcloud run services describe "$API_SERVICE" --project="$PROJECT_ID" \
  --region="$REGION" --format='value(status.url)')"
export BACKEND_HOST="${API_URL#https://}"
gcloud run deploy "$WEB_SERVICE" --project="$PROJECT_ID" --region="$REGION" \
  --image="$WEB_IMAGE" --service-account="$WEB_SA" --port=8080 \
  --allow-unauthenticated --set-env-vars="BACKEND_HOST=${BACKEND_HOST}" \
  --min-instances=0 --max-instances=2 --concurrency=40 --memory=256Mi --cpu=1
export WEB_URL="$(gcloud run services describe "$WEB_SERVICE" --project="$PROJECT_ID" \
  --region="$REGION" --format='value(status.url)')"
gcloud run services update "$API_SERVICE" --project="$PROJECT_ID" --region="$REGION" \
  --update-env-vars="WEB_ORIGIN=${WEB_URL}"
```

Cloud Run sets PORT; do not set it with `--set-env-vars`. Frontend BACKEND_HOST is
only a hostname, with no scheme/path/trailing slash. Cloud Run terminates browser
TLS; Nginx then establishes a separate verified TLS connection to the backend.
Public access must be permitted by your organization. If it is blocked, stop and
consult the owner/TA; do not alter organization policies or bypass IAM controls.
The frontend service URL is stable across revisions. Use that origin for the lab;
a new custom domain requires updating WEB_ORIGIN and repeating auth verification.

## 15. Environment reference (actual implementation)

| Variable | Consumer / purpose | Default or required | Sensitive? |
| --- | --- | --- | --- |
| DATABASE_URL | Prisma API and jobs; Cloud SQL socket URL | Required; Secret Manager | Yes |
| PORT | API listener / cloud frontend Nginx | API 3000; frontend 8080; Cloud Run injects selected port | No |
| NODE_ENV | API secure-cookie policy / runtime | Set production; production always forces Secure | No |
| WEB_ORIGIN | API login and mutation Origin allowlist | Local default http://127.0.0.1:5173; cloud must equal WEB_URL | No |
| COOKIE_SECURE | API cookie flag outside production | Only literal true enables; production overrides false | No |
| TZ | Node runtime timezone | Set UTC consistently | No |
| DEMO_CUSTOMER_PASSWORD | Seed only, both synthetic customers | Required by seed; Secret Manager | Yes |
| DEMO_OPERATOR_PASSWORD | Seed only, both synthetic operators | Required by seed; Secret Manager | Yes |
| BACKEND_HOST | Cloud frontend template; upstream HTTPS hostname | Required; cloudrun-check.sh validates basic syntax | No |
| NGINX_ENVSUBST_FILTER | Cloud frontend official Nginx entrypoint | Image sets only PORT and BACKEND_HOST substitution | No |
| API_PROXY_TARGET | Local Vite dev proxy only | http://127.0.0.1:3000 | No |
| TEST_DATABASE_URL | API/E2E runners only | Explicit disposable database ending _test | Yes; never set on deployed service |
| E2E_API_PORT / E2E_WEB_PORT | Playwright local test servers | 3000 / 5173 | No |
| POSTGRES_PASSWORD | Local Compose DB and API URL only | Required by Compose | Yes |

`VITE_API_BASE_URL` was unused and removed from the example. Production browser
requests remain same-origin; there is no frontend build-time API environment
variable. Root/server/client `.env` files remain ignored. Never put passwords,
service account keys, tokens or database URLs in frontend files or screenshots.
Session lifetime remains eight hours absolute; sessions are stored in Cloud SQL,
not memory, Nginx, container files, or sticky instance state.

## 16. Verification and persistence evidence

These commands are GET-only and require no credentials:

```bash
curl --fail --show-error "$WEB_URL/health"
curl --fail --show-error "$WEB_URL/api/v1/public/queues/R/board"
curl --fail --show-error "$WEB_URL/api/v1/public/queues/S/board"
curl --fail --show-error "$WEB_URL/queues"
curl --fail --show-error "$WEB_URL/api/v1/auth/me"
```

Expect safe health JSON, board JSON containing the R/S queue codes, HTML for
`/queues`, and **401** for anonymous `/auth/me` (curl's nonzero exit is expected
only for that last negative check). Health alone is liveness: startup SELECT 1
and `/health` do not prove migrations, seeded records or a complete journey.
The board reads query application tables and seeded queue records.

After approval to create lab data, verify in two separate browser profiles:

1. Open WEB_URL; sign in as `customer.a@example.test` using the approved customer
   secret privately. Refresh `/queues` and confirm login survives the refresh.
2. Join party size 1–4 in R; note the entry/display number. An additional join
   while active must be rejected. This is queue joining, not creating a new queue;
   R/S are seeded and the app has no queue-administration endpoint.
3. Sign in separately as `operator.a@example.test`; call next, start service,
   complete service. Customer and public R board should reflect transitions.
4. Repeat with customer B / operator B and party size 5–8 in S. Invalid party
   size 0 or 9 must be rejected; operators must not access each other's queue.
5. Check DevTools privately: API URLs use WEB_URL, session cookie is Secure,
   HttpOnly, SameSite=Lax and Path=/, with no Domain; no token is exposed to JS.
   Login/logout and mutations succeed with exact Origin; wrong origins fail 403.
6. With an authenticated customer session and an entry recorded, create a new
   backend revision using the *same* image, database secret and WEB_ORIGIN after
   approval. For example, explicitly select a new revision suffix below. Do not re-seed.

```bash
gcloud run services update "$API_SERVICE" --project="$PROJECT_ID" --region="$REGION" \
  --image="$API_IMAGE" --revision-suffix="persist-$(date -u +%Y%m%d%H%M%S)"
```

Wait for the new revision, then refresh in the same browser profile within eight
hours. Session identity, entry status/number and history must persist. Confirm
Cloud SQL records/audit events privately if needed. This demonstrates revision
persistence; simply refreshing the page does not demonstrate container replacement.
Logout should revoke the session and return protected screens to sign-in.

## 17. Troubleshooting, cost and cleanup

| Symptom | Check / action |
| --- | --- |
| Container fails to listen | API --port=3000 / frontend --port=8080; injected PORT and startup logs; do not bind loopback |
| Frontend startup rejects config | BACKEND_HOST must be hostname only; PORT 1–65535 |
| Nginx 502 / TLS failure | Backend URL, upstream Host/SNI, public invocation, DNS and trusted CA; do not disable TLS verification |
| Login 403 | WEB_ORIGIN must exactly match frontend HTTPS Origin; proxy must preserve Origin |
| Login succeeds then session lost | Cookie flags, HTTPS, same-origin requests, Cloud SQL session row; no in-memory session workaround |
| Cloud SQL P1001 | SQL attachment, connectionName, public-IP connector path, cloudsql.client role and DB secret version |
| Missing relation / board 500 | Correct database, migration job success, Prisma migrations table; do not use health as readiness |
| Board 404 | Seed job success and R/S records in the same DB used by the API |
| Seed fails / password unchanged | Both seed secrets, role/assignment conflicts, existing hashes intentionally retained |
| Secret access denied | Per-secret secretAccessor on runtime SA and enabled pinned versions |
| Permission propagation / public access denied | Confirm project/account and policy; wait if appropriate, never broaden roles blindly |
| Image architecture error | Rebuild linux/amd64 and deploy actual digest |

Inspect Cloud Run service/job logs in Console, redacting errors before sharing.
Keep min instances at zero and small maximum counts; a pool limit of three per API
instance caps steady-state app connections (allow headroom for jobs and revision
overlap). Budget alerts notify; they do not cap spending. Check current GCP pricing
and estimates before approving SQL. Backups, image storage and logs can also cost.

Cleanup is a separate owner-approved action: inventory resources, export any needed
SQL data and evidence, then remove only lab-owned services/jobs/images/secrets/SAs
and finally the SQL instance if its data is no longer needed. Deletion protection
and backup retention must be reviewed explicitly. Never delete shared resources,
the project, billing configuration, or use the starter teardown script blindly.
No automatic teardown is included.

## 18. Lab 5.6 purpose, separation of responsibilities, and acceptance criteria

Issue: <https://github.com/Kerris812/CPE334_FinalProject/issues/38>

Issue #38 requires (1) Workload Identity Federation, (2) a deployment service
account with appropriate IAM permissions, (3) GitHub Actions configuration,
(4) branch rulesets and required CI checks for `main` and `staging`, (5) teammate
review, and (6) a temporary failing Pull Request whose merge is blocked and
which is closed without merging. Evidence includes the Workload Identity setup,
branch rulesets, failing PR link, and blocked merge screenshot.

Lab 5.6 is about **authentication and merge protection**, not creating a second
manual Cloud Run deployment. Lab 5.7 will add automated deployment. Keep the
existing `.github/workflows/ci.yml` unchanged. Its current status check names
are exactly `Build and Test` and `Docker Build`.

| Action | Principal / location | Scope |
| --- | --- | --- |
| Enable APIs and configure identity | Human administrator / Google Cloud Shell | GCP project |
| Authenticate to GCP | GitHub Actions OIDC token | Only the authorized repository and permitted branches |
| Deploy images in a future lab | `restaurant-queue-deployer` service account | Cloud Run and the selected Artifact Registry repository |
| Serve backend traffic | `restaurant-queue-api` service account | Cloud SQL and selected runtime database secret |
| Serve frontend traffic | `restaurant-queue-web` service account | No database credentials |
| Enforce merges | GitHub repository rulesets | `staging` and `main` |

Do not create a JSON service account key or add database passwords to GitHub
repository variables. The GitHub deployment identity should not inherit the
backend runtime account's permissions to read database secrets.

## 19. Prepare the Git branch and check prerequisites

**Mac Terminal, repository root.** First ensure Lab 5.5 has been merged into
`staging` or consciously base your changes on the current `staging`. Never
switch branches with uncommitted changes that may be lost.

```bash
git status
git fetch origin
git switch staging
git pull --ff-only origin staging
git switch -c feature/lab5.6-gcp-auth-branch-protection
```

If local `staging` does not exist, replace `git switch staging` with
`git switch --track origin/staging`. Check `git status` first. The new branch
will contain the authentication workflow, `.gitignore` / `.dockerignore`
updates, and this documentation. GCP IAM changes and GitHub ruleset settings
are console configuration, not Git commits.

Before proceeding, verify the operator can administer IAM, service accounts,
Workload Identity Pools, Artifact Registry IAM and GitHub repository settings.
The project also needs billing/credits and a configured budget because Lab 5.5
Cloud SQL continues to incur costs even if Cloud Run scales to zero.

## 20. Configure the GitHub Workload Identity Pool and OIDC provider

**Google Cloud Shell.** Check the project and enable required APIs. Use the
project's actual number rather than a project ID in IAM principal set strings.

```bash
export PROJECT_ID='cpe334-final-project-theme9'
export REGION='asia-southeast1'
export GITHUB_REPO='Kerris812/CPE334_FinalProject'
export POOL_ID='github-actions'
export PROVIDER_ID='github'
export DEPLOY_SA_NAME='restaurant-queue-deployer'
export DEPLOY_SA="${DEPLOY_SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
gcloud config set project "$PROJECT_ID"
export PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
printf 'Project number: %s\n' "$PROJECT_NUMBER"
```

The confirmed project number is `608461234576`. Stop if the command reports a
different value. Enable the APIs only if you have authorization:

```bash
gcloud services enable \
  iam.googleapis.com \
  iamcredentials.googleapis.com \
  sts.googleapis.com \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  --project="$PROJECT_ID"
```

Inspect existing pools before creating resources:

```bash
gcloud iam workload-identity-pools list \
  --project="$PROJECT_ID" \
  --location=global
```

Create pool `github-actions` only if it is absent:

```bash
gcloud iam workload-identity-pools create "$POOL_ID" \
  --project="$PROJECT_ID" \
  --location=global \
  --display-name='GitHub Actions'
```

Inspect existing providers:

```bash
gcloud iam workload-identity-pools providers list \
  --project="$PROJECT_ID" \
  --location=global \
  --workload-identity-pool="$POOL_ID"
```

Create `github` only if absent. The exact GitHub repository and two branch
references are intentionally part of the acceptance condition:

```bash
gcloud iam workload-identity-pools providers create-oidc "$PROVIDER_ID" \
  --project="$PROJECT_ID" \
  --location=global \
  --workload-identity-pool="$POOL_ID" \
  --display-name='GitHub Actions OIDC' \
  --issuer-uri='https://token.actions.githubusercontent.com/' \
  --attribute-mapping='google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.ref=assertion.ref' \
  --attribute-condition="assertion.repository=='Kerris812/CPE334_FinalProject' && (assertion.ref=='refs/heads/staging' || assertion.ref=='refs/heads/main')"
```

Inspect the actual configuration rather than assuming an existing provider
matches the desired policy:

```bash
gcloud iam workload-identity-pools providers describe "$PROVIDER_ID" \
  --project="$PROJECT_ID" \
  --location=global \
  --workload-identity-pool="$POOL_ID"
```

Expected issuer:
`https://token.actions.githubusercontent.com/`.
Expected mapped claims:
`google.subject`, `attribute.repository`, and `attribute.ref`.
Expected condition: exact repository and `refs/heads/staging` or
`refs/heads/main`.

A Pull Request workflow normally has a `refs/pull/...` reference and will not
satisfy this provider condition. For Lab 5.6, the GCP authentication check runs
**after the feature PR merges into `staging`**. The existing CI workflow still
runs on the feature PR without acquiring GCP credentials.

Evidence: screenshot from
<https://console.cloud.google.com/iam-admin/workload-identity-pools?project=cpe334-final-project-theme9>
showing the trusted GitHub provider and attribute condition.

## 21. Create and grant access to the deployment service account

**Google Cloud Shell.** Inspect service accounts first:

```bash
gcloud iam service-accounts list --project="$PROJECT_ID"
```

If the dedicated account does not already exist:

```bash
gcloud iam service-accounts create "$DEPLOY_SA_NAME" \
  --project="$PROJECT_ID" \
  --display-name='Restaurant Queue GitHub Deployer'
```

Allow identities accepted by the provider and mapped to this repository to
impersonate only this deployment service account:

```bash
gcloud iam service-accounts add-iam-policy-binding "$DEPLOY_SA" \
  --project="$PROJECT_ID" \
  --role='roles/iam.workloadIdentityUser' \
  --member="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL_ID}/attribute.repository/${GITHUB_REPO}"
```

Grant permission to push container images **only to the existing registry**:

```bash
gcloud artifacts repositories add-iam-policy-binding restaurant-queue \
  --project="$PROJECT_ID" \
  --location="$REGION" \
  --member="serviceAccount:${DEPLOY_SA}" \
  --role='roles/artifactregistry.writer'
```

Grant Cloud Run developer permissions for Lab 5.7:

```bash
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${DEPLOY_SA}" \
  --role='roles/run.developer' \
  --condition=None
```

Allow it to deploy services using only the two approved runtime accounts:

```bash
for account in restaurant-queue-api restaurant-queue-web; do
  gcloud iam service-accounts add-iam-policy-binding \
    "${account}@${PROJECT_ID}.iam.gserviceaccount.com" \
    --project="$PROJECT_ID" \
    --member="serviceAccount:${DEPLOY_SA}" \
    --role='roles/iam.serviceAccountUser'
done
```

Verify the impersonation policy, project role and registry access:

```bash
gcloud iam service-accounts get-iam-policy "$DEPLOY_SA" \
  --project="$PROJECT_ID"
gcloud projects get-iam-policy "$PROJECT_ID" \
  --flatten='bindings[].members' \
  --filter="bindings.members:serviceAccount:${DEPLOY_SA}" \
  --format='table(bindings.role)'
gcloud artifacts repositories get-iam-policy restaurant-queue \
  --project="$PROJECT_ID" \
  --location="$REGION"
```

Expected grants:

| Target | Role | Reason |
| --- | --- | --- |
| Deployment service account | `roles/iam.workloadIdentityUser` | Allow the trusted GitHub principal set to impersonate it |
| Selected Artifact Registry repository | `roles/artifactregistry.writer` | Push images in Lab 5.7 |
| Project | `roles/run.developer` | Read and update Cloud Run services |
| Backend and frontend runtime accounts | `roles/iam.serviceAccountUser` | Attach those identities to Cloud Run revisions |

Project Owner, Project Editor, `roles/secretmanager.admin` and
`roles/cloudsql.admin` are not required by this authentication verification.
If later automation needs additional privileges, review the exact operation and
add the narrowest applicable permission instead of granting broad access.

## 22. Add GitHub Actions repository variables

**Google Cloud Shell:** obtain the provider's full resource name:

```bash
gcloud iam workload-identity-pools providers describe "$PROVIDER_ID" \
  --project="$PROJECT_ID" \
  --location=global \
  --workload-identity-pool="$POOL_ID" \
  --format='value(name)'
```

Expected output:

```text
projects/608461234576/locations/global/workloadIdentityPools/github-actions/providers/github
```

**GitHub website:** navigate to
<https://github.com/Kerris812/CPE334_FinalProject/settings/variables/actions>
and create the following **repository variables** under
Settings > Secrets and variables > Actions > Variables.

| Name | Value |
| --- | --- |
| `GCP_PROJECT_ID` | `cpe334-final-project-theme9` |
| `GCP_REGION` | `asia-southeast1` |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | `projects/608461234576/locations/global/workloadIdentityPools/github-actions/providers/github` |
| `GCP_DEPLOY_SERVICE_ACCOUNT` | `restaurant-queue-deployer@cpe334-final-project-theme9.iam.gserviceaccount.com` |

Do not use a JSON key secret such as `GCP_CREDENTIALS`. Existing CI credentials
`CI_DEMO_CUSTOMER_PASSWORD` and `CI_DEMO_OPERATOR_PASSWORD` are unrelated to
this GCP identity and should remain configured according to `ci.yml`.

## 23. Create the authentication verification workflow

**Mac Terminal, feature branch:** create `.github/workflows/gcp-auth-check.yml`.
Keep the existing CI workflow unchanged. The proposed complete new workflow is:

```yaml
name: Lab 5 GCP Authentication Check

on:
  push:
    branches: [staging, main]
  workflow_dispatch:

permissions:
  contents: read

jobs:
  verify-gcp-auth:
    name: Verify GCP Authentication
    runs-on: ubuntu-latest
    permissions:
      contents: read
      id-token: write
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
      - name: Authenticate to Google Cloud
        uses: google-github-actions/auth@v3
        with:
          workload_identity_provider: ${{ vars.GCP_WORKLOAD_IDENTITY_PROVIDER }}
          service_account: ${{ vars.GCP_DEPLOY_SERVICE_ACCOUNT }}
          project_id: ${{ vars.GCP_PROJECT_ID }}
      - name: Set up Google Cloud CLI
        uses: google-github-actions/setup-gcloud@v3
      - name: Verify access to existing Cloud Run services
        run: |
          gcloud run services describe restaurant-api \
            --project="${{ vars.GCP_PROJECT_ID }}" \
            --region="${{ vars.GCP_REGION }}" \
            --format='value(metadata.name)'
          gcloud run services describe restaurant-web \
            --project="${{ vars.GCP_PROJECT_ID }}" \
            --region="${{ vars.GCP_REGION }}" \
            --format='value(metadata.name)'
```

**GitHub Actions detail:** `id-token: write` is mandatory for GitHub OIDC token
issuance. The WIF provider only accepts the `staging` and `main` branch refs;
therefore, run this verification using a push to an authorized branch. Because
`workflow_dispatch` is usually listed only for workflows present on the default
branch, the `push` trigger allows testing as soon as the feature PR is merged
into `staging` without deploying anything. Do not make this push-only workflow
a required Pull Request status check.

**Local repository:** ignore generated authentication artifacts:

```bash
grep -qxF 'gha-creds-*.json' .gitignore || printf '\ngha-creds-*.json\n' >> .gitignore
grep -qxF 'gha-creds-*.json' .dockerignore || printf '\ngha-creds-*.json\n' >> .dockerignore
```

The root `.dockerignore` exists in the current repository. Keep these temporary
credentials out of Git commits and Docker build contexts. Treat them as sensitive
if they ever appear in logs or the working directory.

## 24. Review, commit, and open the Lab 5.6 PR

**Mac Terminal:** confirm expected file changes. Do not stage unrelated files.

```bash
git branch --show-current
git status
git diff --check
git add .github/workflows/gcp-auth-check.yml
git add .gitignore .dockerignore
git add docs/labs/lab-05/deployment.md
git diff --cached --check
git commit -m 'feat(lab5.6): configure GitHub GCP authentication'
git push -u origin feature/lab5.6-gcp-auth-branch-protection
```

Open a Pull Request from
`feature/lab5.6-gcp-auth-branch-protection` to `staging`.
Review the existing CI (`Build and Test` and `Docker Build`). Obtain approval
from the teammate. At this stage, only the identity and workflow configuration
have been committed. The cloud IAM and GitHub branch settings live outside Git.

PR title: `feat(lab5.6): GitHub GCP Authentication and Merge Protection`.
In the PR body, use `Refs #38` while the remaining acceptance criteria are
pending; do not prematurely use `Closes #38` if the failing PR demonstration
and protection evidence are still unfinished.

## 25. Verify GitHub Actions federation from staging

**GitHub website:** after the feature PR is merged into `staging`, open
<https://github.com/Kerris812/CPE334_FinalProject/actions>.
Find `Lab 5 GCP Authentication Check` and select the run from the `staging`
push. The job `Verify GCP Authentication` should show successful checkout,
OIDC authentication, Cloud CLI setup, and read-only Cloud Run verification.
The output should include:

```text
restaurant-api
restaurant-web
```

This result proves the configured GitHub identity can authenticate to GCP
and access both services. It does **not** prove the application was redeployed
or that automated continuous deployment is working.

If no run appears, verify the workflow was merged into `staging` and has the
`push` trigger. Do not assume a manual `workflow_dispatch` is available until
the workflow has also been added to the default branch. Save the successful
workflow run URL and screenshot.

| Failure | Inspect | Preferred remedy |
| --- | --- | --- |
| Provider not found or invalid target | Full provider resource string, project number | Correct `GCP_WORKLOAD_IDENTITY_PROVIDER` |
| Repository / branch attribute condition rejected | GitHub `repository` and `ref` claims | Use a normal push on `staging` or `main`; confirm the exact provider condition |
| Cannot impersonate service account | WIF principal set binding on `restaurant-queue-deployer` | Repair `roles/iam.workloadIdentityUser` binding |
| Cloud Run permission denied | Deployment service account project roles | Check `roles/run.developer` |
| Cloud Run service not found | Project, region, service name | Correct the identifier; do not create a duplicate service |
| Required variable empty | GitHub Actions repository variables | Create or correct the matching variable |

Do not add service account JSON keys or grant Owner as a troubleshooting
shortcut. Check error details and use minimal IAM changes.

## 26. Protect staging and main with GitHub rulesets

**GitHub website:** navigate to
<https://github.com/Kerris812/CPE334_FinalProject/settings/rules>.
Repository admin permission is required. Create two **active branch rulesets**.
The rulesets are configured through GitHub Settings, not in `deployment.md`.

| Setting | Protect staging | Protect main |
| --- | --- | --- |
| Target branch | Exact `staging` | Exact `main` |
| Enforcement status | Active | Active |
| Require a Pull Request before merging | Enabled | Enabled |
| Required approving reviews | 1 teammate | 1 teammate |
| Require status checks before merging | Enabled | Enabled |
| Required status check 1 | `Build and Test` | `Build and Test` |
| Required status check 2 | `Docker Build` | `Docker Build` |
| Block force pushes | Enabled | Enabled |
| Restrict deletions | Enabled | Enabled |
| Bypass list | Empty unless course requires otherwise | Empty unless course requires otherwise |

For each target branch, use an exact branch selector and confirm that the rules
apply to the intended branch. In the status check picker, choose the exact
check names reported by recent GitHub Actions runs and GitHub Actions as the
expected source if GitHub offers that choice. If checks are not listed, inspect
successful workflow runs and their check names before saving the ruleset.

Do **not** require the `Verify GCP Authentication` check on feature PRs because
this workflow is configured to execute on pushes to authorized branches, not on
`pull_request` events. The GitHub WIF provider also intentionally blocks
ordinary PR refs.

The PR author cannot approve their own PR. With a two-person team, one person
opens the PR and the other approves it. Avoid admin bypass allowances when
verifying enforcement. Capture a screenshot of the two active rulesets and the
required review/check settings.

## 27. Demonstrate blocked merging using a temporary failing PR

**Mac Terminal:** after the Lab 5.6 workflow PR has merged and branch protection
is active, create a separate disposable branch from the latest `staging`:

```bash
git status
git fetch origin
git switch staging
git pull --ff-only origin staging
git switch -c test/lab5.6-merge-protection
mkdir -p server/tests/unit
```

Create `server/tests/unit/lab5-merge-protection.test.ts` on the disposable branch:

```typescript
import { expect, test } from 'vitest';

test('Lab 5.6 merge protection verification', () => {
  expect(1).toBe(2);
});
```

The repository's current server script is
`"test:unit": "vitest run tests/unit"`, so the `Build and Test` job should
execute this test and fail. Do not run this test against production services.

```bash
git add server/tests/unit/lab5-merge-protection.test.ts
git commit -m 'test(lab5.6): demonstrate blocked merge'
git push -u origin test/lab5.6-merge-protection
```

Open the PR from `test/lab5.6-merge-protection` to `staging`.
Suggested title: `test(lab5.6): Verify Failing CI Blocks Merge`.

Verify the following *on the actual Pull Request*:

1. `Build and Test` fails because the deliberately incorrect assertion runs.
2. `Docker Build` normally succeeds if the build is otherwise healthy.
3. GitHub states that a required status check has failed and **blocks merge**.
4. Teammate approval is required separately.

The critical evidence is a blocked merge specifically due to a failing required
check, not merely a disabled merge button due to missing review. Take a
screenshot of the failing check and blocked merge, and record the PR URL.

After evidence is captured, click **Close pull request** without merging.
Delete the disposable branch if desired. Do not cherry-pick or merge the
intentionally failing test into `staging` or `main`.

To clean up the local branch after closing the PR:

```bash
git switch staging
git branch -D test/lab5.6-merge-protection
```

## 28. Evidence inventory and final reporting

Issue #38 expects these concrete artifacts:

| Evidence | Content required | Status |
| --- | --- | --- |
| WIF provider screenshot | GitHub issuer, attribute mapping and repository/branch condition | Pending verification |
| GitHub Actions authentication run | Green `Verify GCP Authentication` run and Cloud Run service names | Pending verification |
| Rulesets screenshot | Active `main` and `staging` rules, required checks and review | Pending verification |
| Failing PR link | URL to the temporary PR that ran a failing test | Pending verification |
| Blocked merge screenshot | GitHub's failed required check and blocked merge message | Pending verification |
| Closed PR confirmation | Temporary test PR closed unmerged | Pending verification |

Keep the screenshots in the designated lab evidence folder if the team chooses
to store them in the repository. Otherwise attach them directly to Issue #38
and link them here. Never include secret values, passwords, session cookies,
GitHub tokens or generated `gha-creds-*.json` files in screenshots or commits.

Record completion details only after the checks pass:

| Result | Record |
| --- | --- |
| WIF pool and provider | `github-actions` / `github` |
| Deployment identity | `restaurant-queue-deployer@cpe334-final-project-theme9.iam.gserviceaccount.com` |
| Auth verification run URL | Pending |
| Staging ruleset screenshot | Pending |
| Main ruleset screenshot | Pending |
| Failing PR URL | Pending |
| Blocked merge evidence | Pending |
| Reviewer approval evidence | Pending |
| Lab 5.6 PR URL | Pending |

## 29. Lab 5.6 completion criteria

The issue can be marked complete when all applicable items are verified:

- [ ] WIF Pool and OIDC provider exist with the correct attribute condition.
- [ ] A separate GitHub deployment service account exists with scoped access.
- [ ] `roles/iam.workloadIdentityUser` permits the intended GitHub principal set.
- [ ] Artifact Registry, Cloud Run, and runtime account permissions are correct.
- [ ] Required GitHub Actions variables are configured; no JSON key is stored.
- [ ] A workflow push on `staging` successfully authenticates to GCP.
- [ ] Active rulesets protect `staging` and `main`.
- [ ] Both branches require `Build and Test`, `Docker Build`, and one approval.
- [ ] The deliberately failing PR is blocked by a failed required check.
- [ ] The deliberately failing PR is closed without merging.
- [ ] Evidence links and nonsecret screenshots are attached to Issue #38.

After completion, close Issue #38. Future automated deployments belong to
Lab 5.7 / Issue #39; do not mix their implementation into this task.

## 30. Security and recovery notes

- Treat `WEB_ORIGIN` and forwarded `Origin` as application CSRF controls, not as
  proof that a GCP deployment identity has been authenticated.
- The GitHub OIDC provider condition and service account WIF policy both matter.
  Do not rely on a repo variable or branch ruleset alone for GCP authorization.
- Avoid key downloads. A service account key permits long-lived access until
  revoked and is unnecessary for this workflow.
- If a feature PR is required to authenticate before merging in a future lab,
  design a separate constrained identity and explicit PR trust policy. Do not
  remove the branch condition from this deployment provider without a review.
- Required GitHub checks are selected by the check name, not necessarily by
  the workflow filename or workflow display title.
- Rulesets change who can merge. Configure them deliberately with the teammate
  available to approve so the two-person team is not accidentally locked out.
- Google Cloud IAM mutations are persistent across branches; Git reverts do not
  automatically undo Workload Identity Pools, IAM grants or GitHub rulesets.
- Continue to monitor the Cloud SQL budget independently of CI and WIF setup.