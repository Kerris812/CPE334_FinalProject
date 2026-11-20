# Lab 5 — Deployment, Secure GitHub Integration, and Persistence Verification

## Document scope and verification status

Project: **Restaurant Queue and Service Management System**.
Reviewed against the current repository on **20 November 2026 (Asia/Bangkok)**.
Sections 1–7 cover CI; 8–17 retain the first-deployment and recovery runbook;
18–30 describe secure GitHub integration and merge protection; 31 records the
implemented CD pipeline and release; 32 defines persistence and recovery tests.

Repository implementation, verified GitHub results, reported first-deployment
results, and unexecuted manual tests are distinguished below. A passing health
check or deployment workflow does not establish authenticated browser behavior
or session/data persistence across revisions. No cloud mutation or Git publishing
was performed during this documentation review.

| Area | Evidence available | Remaining evidence |
| --- | --- | --- |
| CI | [Main CI run](https://github.com/Kerris812/CPE334_FinalProject/actions/runs/44569135676) passed | Preserve run links/screenshots for submission |
| First deployment | [PR #42](https://github.com/Kerris812/CPE334_FinalProject/pull/42) records successful SQL migration, seed and service deployment | Original job execution IDs/screenshots remain to be attached |
| GCP federation | [Main authentication run](https://github.com/Kerris812/CPE334_FinalProject/actions/runs/44569135641) passed | Provider/IAM screenshots for the evidence package |
| Merge protection | Active main/staging rulesets require both CI checks and one review; [PR #44](https://github.com/Kerris812/CPE334_FinalProject/pull/44) failed CI and closed unmerged | Blocked-merge screenshot |
| Production CD | [Release run](https://github.com/Kerris812/CPE334_FinalProject/actions/runs/44569135629) passed CI, WIF, both image builds/pushes, migrations, service updates and smoke tests | Export the logged revision names/image digests and collect browser evidence |
| Public deployment | On 20 November: health and R/S boards returned 200, `/queues` returned HTML with 200, anonymous `/auth/me` returned 401 | Authenticated customer/operator regression |
| Lab 5.8 persistence | Procedures are defined in Section 32 | Before/after records, session continuity, rollback/recovery results and screenshots are not supplied |

Project: `cpe334-final-project-theme9` (number `608461234576`).
Region: `asia-southeast1`.

- Frontend: <https://restaurant-web-608461234576.asia-southeast1.run.app>
- Backend: <https://restaurant-api-608461234576.asia-southeast1.run.app>

The verified production release SHA is
`fc178ed639619e3e74a37724a0373e990839a0e8` ([release PR #46](https://github.com/Kerris812/CPE334_FinalProject/pull/46)).
The local source reviewed is `d9744228974df1fdf1d2a71cb3ae57a12c30a7e3`
(the staging merge of PR #45), plus this uncommitted documentation update.
Do not confuse the staging commit with the production merge SHA.

## Navigation

- [CI and builds](#1-ci-workflow)
- [First deployment and recovery runbook](#8-lab-55-scope-and-architecture)
- [Environment reference](#15-environment-reference-actual-implementation)
- [Secure GitHub integration](#18-lab-56-purpose-separation-of-responsibilities-and-acceptance-criteria)
- [Verified CD release](#31-lab-57-automated-cd-and-release-record)
- [Persistence and recovery tests](#32-lab-58-persistence-verification-and-release-validation)

## 1. CI Workflow

The Restaurant Queue and Service Management System uses GitHub Actions for continuous integration.

Workflow file: `.github/workflows/ci.yml`

The workflow runs automatically when a pull request targets `staging` or `main`,
when changes are pushed to either branch, and through `workflow_call` from the
CD pipeline. CD waits for the reusable CI jobs to pass.

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

Historical local verification recorded during Lab 5.4 (not rerun during this documentation-only review):

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

Historical local verification recorded during Lab 5.4 (not rerun during this documentation-only review):

- Frontend production build: Passed.
- Frontend UI tests: 75 passed.

## 5. Docker Build Verification

Run from the repository root:

```bash
docker build -t restaurant-queue-server:ci .
docker build -f client/Dockerfile -t restaurant-queue-client:ci .
```

The CI workflow builds the backend and **local** frontend images. The CD workflow
separately builds `client/Dockerfile.cloudrun` for the deployed frontend. Both
workflows passed for the production release recorded above.

## 6. CI Execution Results

GitHub Actions initially reported failed checks because of incorrect database configuration, Docker build context, and missing synthetic seed credentials.

After correcting these issues, both `Build and Test` and `Docker Build` passed on PR #32.

The project uses pull request reviews before merging into `staging`. The active main/staging rulesets require `Build and Test`, `Docker Build`,
and one approving review. See Section 26 for verified settings.

## 7. Verification Evidence

Evidence to include in the Lab 5 report:

- Screenshot of the passing GitHub Actions checks.
- Screenshot of an earlier failed GitHub Actions execution.
- Screenshot of the pull request review requirement.
- Screenshot of required status checks and merge blocking, once verified.

## 8. Lab 5.5 scope and architecture

This is the reusable manual deployment runbook for issue #37. The
first deployment is reported in PR #42, and the later CD execution is linked in
the status table above. These instructions remain useful for verification and
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

Implementation references:
[backend image](../../../Dockerfile),
[Cloud Run frontend image](../../../client/Dockerfile.cloudrun),
[Nginx template](../../../client/nginx.cloudrun.conf.template),
[API startup](../../../server/src/index.ts),
[authentication](../../../server/src/auth/auth.ts),
[database sessions](../../../server/src/auth/session.ts),
[Prisma schema](../../../server/prisma/schema.prisma), and
[seed](../../../server/prisma/seed.ts).

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
gcloud services enable run.googleapis.com sqladmin.googleapis.com \
  artifactregistry.googleapis.com secretmanager.googleapis.com \
  iam.googleapis.com --project="$PROJECT_ID"
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
  python3 -c 'import secrets,sys; sys.stdout.write(secrets.token_urlsafe(32))' | \
    gcloud secrets versions add "$secret" --data-file=- --project="$PROJECT_ID"
done
for secret in "$DB_SECRET" "$CUSTOMER_SECRET" "$OPERATOR_SECRET"; do
  gcloud secrets add-iam-policy-binding "$secret" --project="$PROJECT_ID" \
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
AUTH_STATUS="$(curl --silent --show-error --output /dev/null \
  --write-out '%{http_code}' "$WEB_URL/api/v1/auth/me")"
test "$AUTH_STATUS" = 401
```

Expect safe health JSON, board JSON containing the R/S queue codes, HTML for
`/queues`, and **401** for anonymous `/auth/me` (the last assertion checks that expected
negative result explicitly). Health alone is liveness: startup SELECT 1
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
manual Cloud Run deployment. Lab 5.7 now supplies automated deployment in `.github/workflows/deploy.yml`.
The existing CI workflow supports reuse through `workflow_call`. Its PR check names
are exactly `Build and Test` and `Docker Build`.

| Action | Principal / location | Scope |
| --- | --- | --- |
| Enable APIs and configure identity | Human administrator / Google Cloud Shell | GCP project |
| Authenticate to GCP | GitHub Actions OIDC token | Only the authorized repository and permitted branches |
| Deploy approved main releases | `restaurant-queue-deployer` service account | Cloud Run and the selected Artifact Registry repository |
| Serve backend traffic | `restaurant-queue-api` service account | Cloud SQL and selected runtime database secret |
| Serve frontend traffic | `restaurant-queue-web` service account | No database credentials |
| Enforce merges | GitHub repository rulesets | `staging` and `main` |

Do not create a JSON service account key or add database passwords to GitHub
repository variables. The GitHub deployment identity should not inherit the
backend runtime account's permissions to read database secrets.

## 19. Existing implementation and prerequisites

The Lab 5.6 changes were merged through [PR #43](https://github.com/Kerris812/CPE334_FinalProject/pull/43).
The current repository already contains `.github/workflows/gcp-auth-check.yml`
and ignores `gha-creds-*.json` in `.gitignore`. Do not recreate these files or
repeat the old feature-branch setup as part of submission preparation.

GCP IAM and GitHub rulesets exist outside Git and must be inspected in their
respective consoles. Sections 20–22 are administrative reference instructions,
not a request to recreate the existing pool/provider, accounts or variables.
Use existing resources; any IAM, deployment or billing change requires owner
approval. Cloud SQL continues to incur costs independently of CI activity.

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
satisfy this provider condition. The GCP authentication check runs on pushes to `staging`/`main`, while PR CI
runs without acquiring GCP credentials. The Lab 5.6 integration has already merged.

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

For the existing CD identity, the documented baseline is Cloud Run Developer.
This reference binding covers service/job updates and execution; do not repeat it
unless the inspected policy is missing the approved grant:

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
If an operation needs additional privileges, review the exact operation and
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
and inspect the following existing **repository variables** under
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

## 23. Authentication verification workflow

The implemented workflow is [gcp-auth-check.yml](../../../.github/workflows/gcp-auth-check.yml).
It runs on pushes to `staging` and `main`, with `workflow_dispatch` available for
an authorized branch. Job `verify-gcp-auth` is named `Verify GCP Authentication`.
It grants `id-token: write`, uses `google-github-actions/auth@v3` and
`setup-gcloud@v3`, then reads both existing Cloud Run services. It deploys nothing.

The exact repository variables are listed in Section 22. PR refs do not match the
documented WIF branch condition, so this push-only job is not a required PR check.
The existing main authentication run is linked in Section 25.

Generated `gha-creds-*.json` files are ignored by `.gitignore`. The current root
`.dockerignore` does **not** exclude that pattern. Current Dockerfiles use explicit
COPY paths that do not copy those generated files into images, but the ignore rule
is still a build-context hardening gap. No other files were changed by this review.
Never retain or publish generated credentials in evidence.

## 24. Lab 5.6 integration record

[PR #43](https://github.com/Kerris812/CPE334_FinalProject/pull/43) merged the
Lab 5.6 implementation into `staging` on 19 November 2026. Its code is already
present in this checkout. Review and merge evidence should be linked from that
PR rather than recreating its commits or opening a duplicate PR.

The submission process does not require rerunning Git publishing commands.
Do not commit, push, force-push or merge during documentation review.

## 25. Verified GitHub Actions federation

The [staging authentication run](https://github.com/Kerris812/CPE334_FinalProject/actions/runs/44543128218)
and [main authentication run](https://github.com/Kerris812/CPE334_FinalProject/actions/runs/44569135641)
completed successfully. The production CD run also successfully authenticated
through WIF before updating the existing resources.

These runs demonstrate working short-lived federation and read access to the
services. The authentication-check workflow itself does not redeploy the app.
Archive the run links and non-sensitive screenshots; inspect the live provider
and IAM policies separately before changing access.

| Failure | Inspect |
| --- | --- |
| Provider not found | Full resource name and numeric project number |
| Attribute condition rejected | Exact repository and authorized branch ref |
| Impersonation denied | `roles/iam.workloadIdentityUser` binding |
| Cloud Run access denied | Deployment account permissions and resource identifiers |
| Empty workflow input | The four GitHub repository variables in Section 22 |

Do not add a service account JSON key or grant Owner to bypass an error.

## 26. Protect staging and main with GitHub rulesets

**GitHub website:** navigate to
<https://github.com/Kerris812/CPE334_FinalProject/settings/rules>.
The active [Protect main](https://github.com/Kerris812/CPE334_FinalProject/rules/27646194)
and [Protect staging](https://github.com/Kerris812/CPE334_FinalProject/rules/27645966)
rulesets were inspected through the GitHub API on 20 November 2026.
Repository admin permission is required to change them; do not create duplicates.
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
| Configured bypass actors | None returned by the ruleset API | None returned by the ruleset API |
| Require branch up to date | Enabled | Disabled |

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

## 27. Failing-PR merge-protection evidence

[PR #44](https://github.com/Kerris812/CPE334_FinalProject/pull/44), from
`test/lab5.6-merge-protection`, is closed without merging. Its
[CI run](https://github.com/Kerris812/CPE334_FinalProject/actions/runs/44546852020)
failed. The active staging ruleset requires the `Build and Test` check, so a failing
required check blocks merging independently of the reviewer-approval requirement.
Retain the original blocked-merge screenshot to document the observed UI behavior.

The intentionally failing `server/tests/unit/lab5-merge-protection.test.ts` belongs
to that disposable PR and is **absent from this checkout**. It must not be restored,
merged or included in the submission branch. No new failing test or publishing
operation is needed to reuse the existing evidence.

## 28. Lab 5.6 evidence inventory

| Evidence | Verified reference / remaining artifact |
| --- | --- |
| Integration PR | [PR #43](https://github.com/Kerris812/CPE334_FinalProject/pull/43), merged |
| Authentication | [Successful main run](https://github.com/Kerris812/CPE334_FinalProject/actions/runs/44569135641) |
| Active main ruleset | [Protect main](https://github.com/Kerris812/CPE334_FinalProject/rules/27646194) |
| Active staging ruleset | [Protect staging](https://github.com/Kerris812/CPE334_FinalProject/rules/27645966) |
| Deliberately failing CI | [Failed run](https://github.com/Kerris812/CPE334_FinalProject/actions/runs/44546852020) |
| Closed unmerged test PR | [PR #44](https://github.com/Kerris812/CPE334_FinalProject/pull/44) |
| Provider/IAM, approval and blocked-merge screenshots | Not supplied in this document; attach existing evidence |

Keep screenshots free of passwords, cookies, tokens and generated credential files.
A PR body claiming completion does not replace the associated run or screenshot.

## 29. Lab 5.6 assessment

Working WIF authentication, the integrated verification workflow, active rulesets
requiring both checks and one approval, and a failed closed/unmerged test PR are
supported by the linked evidence. Exact current provider/IAM policy screenshots
and the original blocked-merge screenshot remain submission artifacts to attach.
Issue closure is a separate reviewer decision; this document does not close issues.

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

## 31. Lab 5.7: Automated CD and release record

Related issue: [#39](https://github.com/Kerris812/CPE334_FinalProject/issues/39).
The implemented workflow is [deploy.yml](../../../.github/workflows/deploy.yml),
named `Lab 5 CD`. Normal releases now use this workflow rather than repeating
the first-deployment provisioning commands.

### 31.1 Release triggers and gates

A push to `main` starts CD. Feature PRs integrate through `staging`; staging
pushes run CI and authentication checks but do not deploy production. There is no
manual `workflow_dispatch` or automated rollback trigger in `deploy.yml`.

Job `verify-ci` calls the existing `ci.yml` with `secrets: inherit` and is named
`Verify Release CI`. The deploy job depends on it. Deployment has
`contents: read` and `id-token: write`; the concurrency group is
`lab5-production-deployment` with `cancel-in-progress: false`. Deployments are
serialized instead of cancelling an active migration/deployment.

The separate push-triggered CI workflow may also run on main. Inside CD, reusable
checks are displayed as `Verify Release CI / Build and Test` and
`Verify Release CI / Docker Build`; PR rulesets require the ordinary CI contexts
`Build and Test` and `Docker Build`.

### 31.2 Actual deployment sequence

1. Run both reusable CI jobs successfully.
2. Authenticate via WIF using the four repository variables in Section 22.
3. Verify the existing migration job and both Cloud Run services exist.
4. Configure Artifact Registry Docker authentication.
5. Build Linux amd64 backend with `Dockerfile` and frontend with `client/Dockerfile.cloudrun`.
6. Push both images tagged with the triggering full `${{ github.sha }}`.
7. Update only the image of `restaurant-migrate`; preserve its command, SQL attachment,
   secret references and runtime service account.
8. Execute the migration job with `--wait`; failure stops deployment.
9. Update the image and `commit-sha` label on `restaurant-api`, then `restaurant-web`.
   Existing environment, Secret Manager, SQL and service-account settings are retained.
10. Run curl smoke checks against `/`, `/health`, and both public R/S board endpoints.
11. Print the release SHA, image references and latest ready revision names.

The workflow does not provision infrastructure or execute `restaurant-seed`.
The migration job must already use `npm run db:migrate`, which invokes
`prisma migrate deploy`. These configuration dependencies must be confirmed before
changing the job or deploying into another environment.

Image references use the region/project variables and fixed repository/image names:

```text
REGION-docker.pkg.dev/PROJECT_ID/restaurant-queue/restaurant-api:RELEASE_SHA
REGION-docker.pkg.dev/PROJECT_ID/restaurant-queue/restaurant-web:RELEASE_SHA
```

CD deploys SHA-tagged references, not explicit `@sha256` digests. Cloud Run resolves
an image for each revision; retain the resolved digest as evidence. This differs
from the optional digest-pinned manual first-deployment procedure in Section 12.

### 31.3 Verified production release

The GitHub API confirms these records as of 20 November 2026:

| Record | Verified value |
| --- | --- |
| Feature PR | [#45](https://github.com/Kerris812/CPE334_FinalProject/pull/45), merged into staging |
| Staging merge SHA | `d9744228974df1fdf1d2a71cb3ae57a12c30a7e3` |
| Release PR | [#46](https://github.com/Kerris812/CPE334_FinalProject/pull/46), merged into main |
| Production release SHA | `fc178ed639619e3e74a37724a0373e990839a0e8` |
| CD run | [44569135629](https://github.com/Kerris812/CPE334_FinalProject/actions/runs/44569135629), success |
| Reusable CI jobs | Both succeeded: server/client builds, unit/API/UI tests and local Docker builds |
| Cloud deployment job | Authentication, cloud image builds/pushes, migration, both service updates and smoke tests succeeded |
| Backend/frontend revision names and resolved digests | Available in the run/Cloud Run; not transcribed here without inspecting those outputs |
| Visible release marker | `Lab 5.7 cloud release` exists in `client/src/App.tsx`; browser screenshot still required |

The feature commit and staging merge are not the SHA deployed by the main release.
Use the production SHA above for the two Artifact Registry release tags.

### 31.4 Smoke-test coverage and limitations

On 20 November 2026, read-only requests to the frontend returned:

| Endpoint | Observed result |
| --- | --- |
| `/health` | HTTP 200; `status: ok`, service `restaurant-queue-api` |
| `/api/v1/public/queues/R/board` | HTTP 200; `data.queueCode: R` |
| `/api/v1/public/queues/S/board` | HTTP 200; `data.queueCode: S` |
| `/queues` | HTTP 200, SPA HTML |
| `/api/v1/auth/me` without cookie | HTTP 401, expected authentication guard |

The workflow smoke checks only HTTP success using curl (with retries), not JSON
schema, browser rendering, release text, role permissions or session continuity.
Do not describe them as a complete customer/operator end-to-end test. Section 32
records the remaining manual and persistence checks.

Historical local counts were 10 backend unit and 75 frontend UI tests; the linked
release CI additionally passed API tests. No application tests or dependency audit
were rerun for this documentation-only review. An earlier report of four high
severity dependency findings is historical, not a current audit result. Review a
current production dependency audit separately before asserting vulnerabilities
are resolved.

### 31.5 Failure handling and recovery

A failed required step stops subsequent steps. Deployment is sequential, not atomic:
if the backend update succeeds and the frontend update fails, the backend may
already be serving the new release. A smoke failure reports failure but does not
automatically roll back. Completed migrations remain applied.

A revision name being latest/ready does not establish its traffic percentage.
Inspect `status.traffic` and resolved image digests for both services. After manual
rollback pins traffic, the current CD workflow does not explicitly restore
`--to-latest`; review routing before assuming a later image update serves users.
Section 32 provides owner-approved traffic and recovery checks. Do not reverse
Prisma migrations or reseed to simulate a rollback.

### 31.6 Submission evidence

Retain PR #45/#46, the successful CD/authentication/CI links, release SHA, migration
execution ID, resolved image digests, serving revision names/traffic, and a
screenshot of the visible release marker. Add authenticated customer/operator
and persistence evidence from Section 32. Successful automated deployment is
verified; completion of every manual acceptance criterion is not inferred.

## 32. Lab 5.8: Persistence Verification and Release Validation

### 32.1 Objective

**Execution status: NOT VERIFIED.** These are retained test procedures and
evidence fields, not completed tests. The successful CD run in Section 31 proves
a deployment occurred, but contains no before/after customer entry or session
comparison. Do not mark persistence or rollback PASS without that evidence.
Any revision replacement, release, traffic change or test-data mutation requires
owner approval; none was executed during this review.

Verify that the Restaurant Queue and Service Management System preserves its application data and remains functional after Cloud Run revision replacement, automated CD redeployment, and rollback and recovery operations.

Related GitHub issue: [#40](https://github.com/Kerris812/CPE334_FinalProject/issues/40)

### 32.2 Deployment Environment

| Component | Configuration |
| --- | --- |
| GCP Project | `cpe334-final-project-theme9` |
| Region | `asia-southeast1` |
| Frontend Service | `restaurant-web` |
| Backend Service | `restaurant-api` |
| Database | Cloud SQL PostgreSQL |
| Migration Job | `restaurant-migrate` |
| Deployment Pipeline | GitHub Actions `Lab 5 CD` |
| Frontend URL | https://restaurant-web-608461234576.asia-southeast1.run.app |
| Backend URL | https://restaurant-api-608461234576.asia-southeast1.run.app |

### 32.3 Test 1: Database Persistence After Backend Revision Replacement

**Purpose:** Confirm that an existing queue entry remains stored in Cloud SQL when the backend is replaced with a new Cloud Run revision.

**Procedure:**

1. Open the deployed frontend.
2. Log in using the seeded Customer A account.
3. Join Queue R with party size 3, or identify an existing queue entry.
4. Record the entry ID, queue number (`displayNumber`), status, party size and
   `joinedAt`. Keep the same browser session for the continuity check.
5. Record the backend revision actually receiving traffic, its resolved image
   digest and `status.traffic`; latest ready is not necessarily the serving revision.
6. Create a new Cloud Run backend revision without changing the database.
7. Confirm that the new revision receives production traffic.
8. Refresh the customer page and inspect the original queue entry.
9. Compare the data before and after revision replacement.

**Cloud Shell commands:**

```bash
export PROJECT_ID="cpe334-final-project-theme9"
export REGION="asia-southeast1"

# Record traffic as well as latest-ready revision before proceeding.
gcloud run services describe restaurant-api \
  --project="$PROJECT_ID" --region="$REGION" --format='yaml(status.traffic)'

export API_REV_BEFORE="$(gcloud run services describe restaurant-api \
  --project="$PROJECT_ID" \
  --region="$REGION" \
  --format='value(status.latestReadyRevisionName)')"

gcloud run services update restaurant-api \
  --project="$PROJECT_ID" \
  --region="$REGION" \
  --update-env-vars="LAB58_RESTART_ID=$(date -u +%Y%m%d%H%M%S)"

export API_REV_AFTER="$(gcloud run services describe restaurant-api \
  --project="$PROJECT_ID" \
  --region="$REGION" \
  --format='value(status.latestReadyRevisionName)')"

echo "Before: $API_REV_BEFORE"
echo "After: $API_REV_AFTER"
test "$API_REV_BEFORE" != "$API_REV_AFTER"
gcloud run services describe restaurant-api \
  --project="$PROJECT_ID" --region="$REGION" --format='yaml(status.traffic)'
```

**Results:**

| Verification Item | Before | After |
| --- | --- | --- |
| Backend Revision | Not recorded | Not recorded |
| Customer | Customer A | Customer A |
| Queue | R | R |
| Queue Number | Not recorded | Not recorded |
| Party Size | Not recorded | Not recorded |
| Queue Status | Not recorded | Not recorded |
| Joined Timestamp | Not recorded | Not recorded |
| Customer Session | Not recorded | Not recorded |

**Expected Result:** The serving backend revision changes, while the same entry ID,
queue number, party size, status and joined timestamp remain. The same authenticated
browser session remains valid within its eight-hour lifetime. Do not advance service
status during the comparison. If traffic remains pinned to the old revision, the
replacement test has not reached the new container; resolve routing only with approval.

**Actual Result:** Not recorded; no persistence/rollback execution is claimed.

**Test Status:** NOT VERIFIED — execution evidence not supplied.

**Evidence:**

1. Screenshot of queue entry before replacement — evidence not attached.
2. Screenshot of new Cloud Run revision — evidence not attached.
3. Screenshot of queue entry after replacement — evidence not attached.

### 32.4 Test 2: Database Persistence After Automated CD Redeployment

**Purpose:** Verify that the GitHub Actions CD pipeline can deploy a new application release without deleting existing database records.

**Procedure:**

1. Record the original backend and frontend revisions.
2. Record the existing customer queue entry.
3. Use an approved release with a recorded before-state, or propose a new change
   for owner approval. Do not create a redundant release solely for this document.
4. Open a Pull Request targeting `staging`.
5. Confirm that the required CI checks pass.
6. Obtain teammate approval and merge into `staging`.
7. Create a release Pull Request from `staging` into `main`.
8. Confirm CI and reviewer approval.
9. Merge the release PR into `main`.
10. Verify that `Lab 5 CD` runs successfully.
11. Record the new Cloud Run revisions and release commit SHA.
12. Refresh the deployed application and verify the original queue entry remains available.

**Expected CD sequence (for an owner-approved new release):**

1. Execute required CI checks.
2. Authenticate to GCP using Workload Identity Federation.
3. Build backend and frontend Docker images.
4. Push images to Artifact Registry with the commit SHA.
5. Execute Prisma migrations.
6. Deploy the backend to Cloud Run.
7. Deploy the frontend to Cloud Run.
8. Execute production smoke tests.

**Results:**

| Verification Item | Recorded Value |
| --- | --- |
| Feature PR | Existing release: [#45](https://github.com/Kerris812/CPE334_FinalProject/pull/45); no persistence before-state supplied |
| Release PR | Existing release: [#46](https://github.com/Kerris812/CPE334_FinalProject/pull/46) |
| GitHub Actions Run | [44569135629](https://github.com/Kerris812/CPE334_FinalProject/actions/runs/44569135629), deployment passed; persistence comparison missing |
| Release Commit SHA | `fc178ed639619e3e74a37724a0373e990839a0e8` |
| Backend Revision Before CD | Not recorded |
| Backend Revision After CD | Not recorded |
| Frontend Revision Before CD | Not recorded |
| Frontend Revision After CD | Not recorded |
| Original Queue Number | Not recorded |
| Queue Number After CD | Not recorded |
| Database Persistence | Not recorded |
| Smoke Test Result | Passed in existing CD run; not an authenticated persistence check |

**Expected Result:** CD succeeds, the new revisions receive traffic, and the same
entry ID, number, party size, status, joined timestamp and browser session survive.
The successful release run `44569135629` is deployment evidence only; without a
before-state it cannot retrospectively prove this persistence test.

**Actual Result:** Not recorded; no persistence/rollback execution is claimed.

**Test Status:** NOT VERIFIED — execution evidence not supplied.

**Evidence:**

1. Feature PR URL — evidence not attached.
2. Release PR URL — evidence not attached.
3. Successful CD workflow screenshot — evidence not attached.
4. Cloud Run revision screenshot — evidence not attached.
5. Queue entry after redeployment screenshot — evidence not attached.

### 32.5 Test 3: Cloud Run Rollback and Recovery

**Purpose:** Verify that application traffic can be redirected to a previous compatible backend revision and restored to the latest release without losing database records.

**Prerequisites:**

1. A previous working backend revision is available.
2. The previous revision is compatible with the current database schema.
3. Both previous and latest revision names have been recorded.

**Procedure:**

1. Record the latest active backend revision.
2. Route backend traffic to the previous compatible revision.
3. Verify that the health endpoint and public queue board work.
4. Log in and confirm the original queue entry still exists.
5. Restore traffic to the latest backend revision.
6. Repeat the health and persistence checks.

**Rollback command:**

```bash
gcloud run services update-traffic restaurant-api \
  --project="$PROJECT_ID" \
  --region="$REGION" \
  --to-revisions="PREVIOUS_REVISION_NAME=100"
```

**Recovery command (restore the recorded revision for comparison):**

```bash
gcloud run services update-traffic restaurant-api \
  --project="$PROJECT_ID" \
  --region="$REGION" \
  --to-revisions="LATEST_REVISION_NAME=100"
```

Replace `PREVIOUS_REVISION_NAME` and `LATEST_REVISION_NAME` with recorded compatible
revision names, not the literal placeholders. Inspect `status.traffic` after each
command. Restoring a named revision pins routing to it. After verifying recovery,
restore normal latest-revision routing only with owner approval:

```bash
gcloud run services update-traffic restaurant-api \
  --project="$PROJECT_ID" --region="$REGION" --to-latest
gcloud run services describe restaurant-api \
  --project="$PROJECT_ID" --region="$REGION" --format='yaml(status.traffic)'
```

If the original routing was intentionally split rather than 100% latest, restore
that recorded split instead. Never infer the serving revision from latest-ready alone.

**Results:**

| Verification Item | Result |
| --- | --- |
| Previous Revision | Not recorded |
| Latest Revision | Not recorded |
| Rollback Traffic Assignment | Not recorded |
| Health Check After Rollback | Not recorded |
| Queue Data After Rollback | Not recorded |
| Recovery Traffic Assignment | Not recorded |
| Health Check After Recovery | Not recorded |
| Queue Data After Recovery | Not recorded |

**Expected Result:** The application remains accessible and retains its database records during rollback and recovery.

**Actual Result:** Not recorded; no persistence/rollback execution is claimed.

**Test Status:** NOT VERIFIED — execution evidence not supplied.

**Note:** Cloud Run revision rollback does not reverse database migrations. Only perform this test when the previous application revision is compatible with the current database schema. If rollback is not practical, document the reason instead of reporting a successful result.

### 32.6 Final Functional Verification

After the latest release is restored, verify the complete Restaurant Queue workflow.

| Test Case | Expected Result | Actual Result | Status |
| --- | --- | --- | --- |
| Frontend SPA route | `/queues` returns HTML | HTTP 200 on 20 November; browser rendering not checked | HTTP check passed |
| Backend health through frontend | HTTP 200 | HTTP 200 on 20 November | HTTP check passed |
| Customer login | Authentication successful | Not recorded | Not recorded |
| Operator login | Authentication successful | Not recorded | Not recorded |
| Join Queue R | Queue number assigned | Not recorded | Not recorded |
| View queue status | Correct entry displayed | Not recorded | Not recorded |
| Operator calls next | Status becomes CALLED | Not recorded | Not recorded |
| Operator starts service | Status becomes SERVING | Not recorded | Not recorded |
| Operator completes service | Status becomes COMPLETED | Not recorded | Not recorded |
| Public queue boards | R/S API responses available | HTTP 200 and correct queue codes on 20 November; UI not checked | API check passed |
| Queue S functionality | Queue operations successful | Not recorded | Not recorded |
| Database persistence | Existing records preserved | Not recorded | Not recorded |

### 32.7 Evidence Summary

| Evidence ID | Description | Reference |
| --- | --- | --- |
| E01 | Original queue entry | Not recorded |
| E02 | Original Cloud Run revision | Not recorded |
| E03 | New backend revision | Not recorded |
| E04 | Queue entry after revision replacement | Not recorded |
| E05 | Successful automated CD workflow | [Run 44569135629](https://github.com/Kerris812/CPE334_FinalProject/actions/runs/44569135629) |
| E06 | New Cloud Run revisions and commit SHA | Release SHA in Section 31.3; serving revision/digest evidence not transcribed |
| E07 | Queue entry after CD redeployment | Not recorded |
| E08 | Rollback traffic configuration | Not recorded |
| E09 | Recovery traffic configuration | Not recorded |
| E10 | Final functional verification | Not recorded |
| E11 | Final Lab 5 PDF evidence index | Not recorded |

### 32.8 Final Assessment

The Lab 5.8 verification will be considered complete when:

1. Application data survives Cloud Run backend revision replacement.
2. Application data survives automated CD redeployment.
3. The deployment workflow succeeds with the expected release commit SHA.
4. Customer, operator, and public queue functionality remain operational.
5. Rollback and recovery are verified when practical, or the limitation is documented.
6. Test results and supporting evidence are included in the deployment documentation.
7. The final Lab 5 PDF evidence index is prepared.

**Overall Verification Result:** INCOMPLETE — persistence, authenticated regression, and recovery evidence remain outstanding.

**Documentation review date:** 20 November 2026 (Asia/Bangkok). Cloud persistence test execution date: not recorded.

**GitHub Issue:** [#40](https://github.com/Kerris812/CPE334_FinalProject/issues/40)
