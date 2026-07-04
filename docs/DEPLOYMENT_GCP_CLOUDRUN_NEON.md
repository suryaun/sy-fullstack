# Seere Yaana — Production Deployment Guide
## Google Cloud Run (web + api) + Neon (PostgreSQL)

> **App:** `suryaun-sy-fs` — monorepo (`apps/web` Next.js 15 + `apps/api` Express/Prisma)
> **Domain:** already purchased at **GoDaddy**
> **Goal:** stable, low-cost (~$0–5/mo) production deployment
> **Target reader:** you, starting from zero cloud accounts

---

## 0. Architecture (what we are building)

```
                         ┌──────────────────────────┐
   GoDaddy domain  ──►   │  Cloudflare (free CDN)    │  (optional but recommended)
   yourdomain.com        │  DNS + TLS + DDoS shield  │
                         └────────────┬──────────────┘
                                      │
            ┌─────────────────────────┴───────────────────────────┐
            │ www.yourdomain.com                 api.yourdomain.com│
            ▼                                                      ▼
   ┌────────────────────┐                            ┌────────────────────┐
   │ Cloud Run: WEB     │  ── server-to-server ──►   │ Cloud Run: API     │
   │ Next.js 15 (SSR)   │   (API_INTERNAL_URL)       │ Express + Prisma   │
   │ next-auth v5       │                            │ Razorpay/ImageKit  │
   └────────────────────┘                            └─────────┬──────────┘
                                                               │ DATABASE_URL (pooled, TLS)
                                                               ▼
                                                     ┌────────────────────┐
                                                     │  Neon PostgreSQL   │
                                                     │  (serverless)      │
                                                     └────────────────────┘

   External SaaS already used by the app:
   • ImageKit  (product image storage/CDN)
   • Razorpay  (payments + webhooks)
   • Delhivery (courier/shipping)
   • Google / Facebook / Apple OAuth (next-auth)
```

---

## Phase 0 — Testing / Staging FIRST (do this before anything "production")

> You are validating the app before go-live, so use **test credentials and a
> throwaway database**. Every command in Phases 1–8 is identical — only the *values*
> change. Recommended order: **(a) local docker-compose → (b) Cloud Run test services →
> (c) production**.

### 0.1 Use TEST values, not production
| Variable | Production | **Testing value** |
|----------|-----------|-------------------|
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` | `rzp_live_…` | **`rzp_test_…`** (no real money) |
| `NEXT_PUBLIC_RAZORPAY_KEY_ID` | live key | **test key** |
| `RAZORPAY_WEBHOOK_SECRET` | prod webhook secret | **test webhook secret** |
| `DELHIVERY_USE_STAGING` | `false` | **`true`** |
| `DELHIVERY_API_BASE_URL` | `https://track.delhivery.com` | **`https://staging-express.delhivery.com`** |
| `DELHIVERY_API_TOKEN` | prod token | **staging token** |
| `MOBILE_OTP_BYPASS` | `false` | **`true`** (skip real OTP while testing) |
| `AUTH_URL` / `NEXT_PUBLIC_API_URL` | real domain | **`https://test.seereyaana.com`** / **`https://api.test.seereyaana.com`** |
| Neon | prod project | **separate `seere-yaana-test` project or DB branch** |

Razorpay test cards (e.g. `4111 1111 1111 1111`, any future expiry/CVV) let you complete
checkout flows without spending money.

### 0.2 Step (a): validate locally first — zero cloud cost
Your repo already has `docker-compose.yaml`. Put **test** keys in `.env` and run:
```bash
docker compose up --build
# web → http://localhost:3445   api → http://localhost:4000/health
```
Fix everything here before touching the cloud.

### 0.3 Step (b): deploy a TEST environment on Cloud Run
Deploy isolated `-test` services so prod is never affected:
```bash
# test DB: create a Neon branch (free, instant) or a second project
#   Neon console → Branches → "test" → copy its POOLED connection string

# reuse Phases 3–4, but name secrets with a _TEST suffix, e.g. DATABASE_URL_TEST
gcloud run deploy seere-yaana-api-test  --image=...:test --region=asia-south1 \
  --allow-unauthenticated --port=4000 --min-instances=0 \
  --set-env-vars="NODE_ENV=production,DELHIVERY_USE_STAGING=true,MOBILE_OTP_BYPASS=true,..." \
  --set-secrets="DATABASE_URL=DATABASE_URL_TEST:latest,RAZORPAY_KEY_ID=RAZORPAY_KEY_ID_TEST:latest,..."

gcloud run deploy seere-yaana-web-test  --image=...:test --region=asia-south1 \
  --allow-unauthenticated --port=3000 --min-instances=0 \
  --set-env-vars="AUTH_URL=https://test.seereyaana.com,NEXT_PUBLIC_API_URL=https://api.test.seereyaana.com,..."
```

Map the test domains to the services (web → `test.seereyaana.com`, api → `api.test.seereyaana.com`):
```bash
gcloud beta run domain-mappings create --service=seere-yaana-web-test \
  --domain=test.seereyaana.com --region=asia-south1
gcloud beta run domain-mappings create --service=seere-yaana-api-test \
  --domain=api.test.seereyaana.com --region=asia-south1
```
Then add these records at **GoDaddy** (seereyaana.com → DNS):
| Type | Name | Value |
|------|------|-------|
| CNAME | `test` | `ghs.googlehosted.com` |
| CNAME | `api.test` | `ghs.googlehosted.com` |
(Use the exact records `gcloud ... domain-mappings describe` prints if Google returns A/AAAA instead.) TLS is issued free & automatically once DNS resolves.

- **`NEXT_PUBLIC_API_URL` is baked at web build time** — rebuild the web image with
  `--build-arg NEXT_PUBLIC_API_URL=https://api.test.seereyaana.com` (and `AUTH_URL=https://test.seereyaana.com`).
- For OAuth in test, add `https://test.seereyaana.com/api/auth/callback/{provider}` to the
  Google/Facebook/Apple consoles, **or** rely on `MOBILE_OTP_BYPASS=true` and test mobile login without OAuth.
- For Razorpay test webhooks, point the webhook at `https://api.test.seereyaana.com/...`.

### 0.4 Step (c): promote to production
Once the test environment passes the Phase 11 checklist with test keys:
1. Swap test values → production (live Razorpay keys, Delhivery prod token,
   `MOBILE_OTP_BYPASS=false`, `DELHIVERY_USE_STAGING=false`).
2. Deploy the non-`-test` services (Phases 5–6).
3. Attach the GoDaddy domain (Phase 7) and update OAuth/webhook URLs (Phase 8).

> Tip: keep prod and test fully separate (different Neon DB + different secrets) so test
> orders, OTP bypass, and broken experiments can never touch real customer data.

**Two Cloud Run services** (web + api) + **one Neon database**. Everything else
(ImageKit, Razorpay, Delhivery, OAuth providers) are external accounts you already
have or will create keys for — they only need environment variables.

---

## Phase 1 — Accounts & prerequisites

### 1.1 Local tools to install (on your Mac)
```bash
# Google Cloud CLI
brew install --cask google-cloud-sdk

# Docker Desktop (to build container images)
brew install --cask docker
# launch Docker Desktop once so the daemon is running

# (already have) git, gh
gcloud version
docker version
```

### 1.2 Create a Google Cloud account
1. Go to https://console.cloud.google.com
2. Sign in with a Google account → accept terms.
3. **Activate the $300 / 90-day free trial** when prompted (needs a card; Google
   does **not** auto-charge after trial unless you manually upgrade).
4. Create a **billing account** (required even on free tier).

### 1.3 Create a Neon account
1. Go to https://neon.tech → **Sign up** (GitHub login is easiest).
2. Free tier is enough to launch (0.5 GB storage, scale-to-zero compute).

### 1.4 Create a Cloudflare account (optional, recommended)
1. https://dash.cloudflare.com/sign-up
2. Free plan. We use it for CDN + TLS + DDoS in front of the domain.

### 1.5 Gather your existing SaaS credentials
You will need production keys for these (from your `.env.example`):
- **Razorpay**: `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`
- **ImageKit**: `IMAGEKIT_PUBLIC_KEY`, `IMAGEKIT_PRIVATE_KEY`, `IMAGEKIT_URL_ENDPOINT`
- **OAuth**: Google / Facebook / Apple client IDs + secrets
- **Delhivery**: `DELHIVERY_API_TOKEN`, `DELHIVERY_PICKUP_LOCATION_NAME`
- Generated secrets: `JWT_SECRET`, `AUTH_SECRET`, `ADMIN_PROXY_SHARED_SECRET`

Generate the three random secrets now:
```bash
openssl rand -base64 48   # run 3x → JWT_SECRET, AUTH_SECRET, ADMIN_PROXY_SHARED_SECRET
```

---

## Phase 2 — Database on Neon

### 2.1 Create the project & database
1. Neon console → **New Project**.
2. Name: `seere-yaana-prod`. Region: pick closest to your users (e.g. `AWS ap-south-1 / Mumbai` for India).
3. Postgres version: 16. Database name: `seere_yaana_db`.

### 2.2 Get the connection string
Neon shows **two** connection strings — use the **Pooled** one for the app:
```
postgresql://<user>:<password>@<endpoint>-pooler.<region>.aws.neon.tech/seere_yaana_db?sslmode=require
```
- Use **`-pooler`** host → essential for serverless/Cloud Run (avoids connection exhaustion).
- Keep `sslmode=require`.
- This becomes your `DATABASE_URL`.

### 2.3 Push the schema
Your repo has **no migrations folder** — the API uses `prisma db push` (schema sync).
You have two choices:

**Option A — keep `db push` (simplest, matches current code).**
Push the schema once from your laptop before first deploy:
```bash
cd apps/api
DATABASE_URL="<your-neon-pooled-url>" npx prisma db push
```

**Option B — adopt real migrations (recommended for a payment app).**
Generates a versioned, reviewable history and avoids accidental data loss:
```bash
cd apps/api
DATABASE_URL="<neon-url>" npx prisma migrate dev --name init   # creates prisma/migrations
# then change the API Dockerfile CMD from `prisma db push` to `prisma migrate deploy`
```
> ⚠️ Recommendation: move to **Option B** before go-live. `db push` can drop columns
> on schema drift; `migrate deploy` is safe and auditable. See Phase 6.2.

---

## Phase 3 — Configure the GCP project

### 3.1 Create project & enable APIs
```bash
gcloud auth login
gcloud projects create seere-yaana-prod --name="Seere Yaana"
gcloud config set project seere-yaana-prod

# link billing (find your billing account id)
gcloud billing accounts list
gcloud billing projects link seere-yaana-prod --billing-account=XXXXXX-XXXXXX-XXXXXX

# enable the services we need
gcloud services enable \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  secretmanager.googleapis.com
```

### 3.2 Pick a region
Use one region for everything. For India:
```bash
gcloud config set run/region asia-south1   # Mumbai
```

### 3.3 Create an Artifact Registry (Docker image store)
```bash
gcloud artifacts repositories create seere-yaana \
  --repository-format=docker \
  --location=asia-south1 \
  --description="Seere Yaana container images"

# allow docker to push to it
gcloud auth configure-docker asia-south1-docker.pkg.dev
```

---

## Phase 4 — Store secrets in Secret Manager

Never bake secrets into images or pass them as plain `--set-env-vars`. Use Secret Manager.

```bash
# helper: create a secret from a literal value
create_secret () { printf "%s" "$2" | gcloud secrets create "$1" --data-file=- ; }

create_secret DATABASE_URL              "postgresql://...neon-pooler.../seere_yaana_db?sslmode=require"
create_secret JWT_SECRET                "<openssl-output-1>"
create_secret AUTH_SECRET               "<openssl-output-2>"
create_secret ADMIN_PROXY_SHARED_SECRET "<openssl-output-3>"

create_secret RAZORPAY_KEY_ID           "rzp_live_xxx"
create_secret RAZORPAY_KEY_SECRET       "xxx"
create_secret RAZORPAY_WEBHOOK_SECRET   "xxx"

create_secret IMAGEKIT_PUBLIC_KEY       "xxx"
create_secret IMAGEKIT_PRIVATE_KEY      "xxx"

create_secret GOOGLE_CLIENT_SECRET      "xxx"
create_secret FACEBOOK_CLIENT_SECRET    "xxx"
create_secret AUTH_APPLE_SECRET         "xxx"
create_secret DELHIVERY_API_TOKEN       "xxx"
```
Non-secret config (URLs, public keys, flags) can be passed as plain env vars at deploy time.

Grant Cloud Run's runtime service account access to secrets:
```bash
PROJECT_NUMBER=$(gcloud projects describe seere-yaana-prod --format='value(projectNumber)')
SA="$PROJECT_NUMBER-compute@developer.gserviceaccount.com"
for S in DATABASE_URL JWT_SECRET AUTH_SECRET ADMIN_PROXY_SHARED_SECRET \
         RAZORPAY_KEY_ID RAZORPAY_KEY_SECRET RAZORPAY_WEBHOOK_SECRET \
         IMAGEKIT_PUBLIC_KEY IMAGEKIT_PRIVATE_KEY GOOGLE_CLIENT_SECRET \
         FACEBOOK_CLIENT_SECRET AUTH_APPLE_SECRET DELHIVERY_API_TOKEN; do
  gcloud secrets add-iam-policy-binding "$S" \
    --member="serviceAccount:$SA" \
    --role="roles/secretmanager.secretAccessor"
done
```

---

## Phase 5 — Deploy the API service

### 5.1 Pre-deploy code hardening (small but important)
Your `apps/api/src/server.ts` currently uses `app.use(cors())` (open to all origins).
Lock it to your web domain before go-live:
```ts
const allowed = (process.env.CORS_ORIGINS ?? "").split(",").filter(Boolean);
app.use(cors({ origin: allowed.length ? allowed : true, credentials: true }));
```
(Set `CORS_ORIGINS=https://www.yourdomain.com` as an env var.)

### 5.2 Build & push the API image
Build from the **repo root** with the api Dockerfile context (the Dockerfile expects
the `apps/api` folder as context):
```bash
cd apps/api
IMAGE=asia-south1-docker.pkg.dev/seere-yaana-prod/seere-yaana/api:v1

# build for linux/amd64 (Cloud Run requirement; important on Apple Silicon)
docker build --platform linux/amd64 -t "$IMAGE" .
docker push "$IMAGE"
```

### 5.3 Deploy API to Cloud Run
```bash
gcloud run deploy seere-yaana-api \
  --image=asia-south1-docker.pkg.dev/seere-yaana-prod/seere-yaana/api:v1 \
  --region=asia-south1 \
  --platform=managed \
  --allow-unauthenticated \
  --port=4000 \
  --cpu=1 --memory=512Mi \
  --min-instances=0 --max-instances=4 \
  --concurrency=80 \
  --set-env-vars="NODE_ENV=production,IMAGEKIT_URL_ENDPOINT=https://ik.imagekit.io/your_id,IMAGEKIT_FOLDER=/seere-yaana/products,COURIER_PROVIDER=DELHIVERY,DELHIVERY_USE_STAGING=false,DELHIVERY_API_BASE_URL=https://track.delhivery.com,DELHIVERY_PICKUP_LOCATION_NAME=YourWarehouse,BUSINESS_NAME=Seere Yaana,BUSINESS_PINCODE=560001,CORS_ORIGINS=https://www.yourdomain.com" \
  --set-secrets="DATABASE_URL=DATABASE_URL:latest,JWT_SECRET=JWT_SECRET:latest,RAZORPAY_KEY_ID=RAZORPAY_KEY_ID:latest,RAZORPAY_KEY_SECRET=RAZORPAY_KEY_SECRET:latest,RAZORPAY_WEBHOOK_SECRET=RAZORPAY_WEBHOOK_SECRET:latest,IMAGEKIT_PUBLIC_KEY=IMAGEKIT_PUBLIC_KEY:latest,IMAGEKIT_PRIVATE_KEY=IMAGEKIT_PRIVATE_KEY:latest,ADMIN_PROXY_SHARED_SECRET=ADMIN_PROXY_SHARED_SECRET:latest,DELHIVERY_API_TOKEN=DELHIVERY_API_TOKEN:latest"
```
Note the **API service URL** it prints (e.g. `https://seere-yaana-api-xxxx.a.run.app`).

### 5.4 Verify
```bash
curl https://seere-yaana-api-xxxx.a.run.app/health   # expect 200 OK
```

> **Prisma on Cloud Run:** the API Dockerfile CMD runs `prisma db push` on every cold
> start. That's risky in prod. Switch CMD to `prisma migrate deploy` (Option B above)
> or remove DB mutation from startup entirely and run migrations manually in CI.

---

## Phase 6 — Deploy the Web service

### 6.1 Important: Next.js bakes public env at BUILD time
Your `apps/web/Dockerfile` accepts build args for `NEXT_PUBLIC_*`, `AUTH_*`, OAuth ids.
These must be passed at `docker build`, not just at deploy. Use **placeholder domains
first**, then rebuild once the final domain/API URL is known (or just build with the
real values directly if you already know your domain).

### 6.2 Build & push the web image
```bash
cd apps/web
WEB_IMAGE=asia-south1-docker.pkg.dev/seere-yaana-prod/seere-yaana/web:v1

docker build --platform linux/amd64 -t "$WEB_IMAGE" \
  --build-arg AUTH_URL="https://www.yourdomain.com" \
  --build-arg AUTH_SECRET="<auth-secret>" \
  --build-arg NEXT_PUBLIC_API_URL="https://api.yourdomain.com" \
  --build-arg API_INTERNAL_URL="https://seere-yaana-api-xxxx.a.run.app" \
  --build-arg GOOGLE_CLIENT_ID="xxx" \
  --build-arg GOOGLE_CLIENT_SECRET="xxx" \
  --build-arg FACEBOOK_CLIENT_ID="xxx" \
  --build-arg FACEBOOK_CLIENT_SECRET="xxx" \
  --build-arg AUTH_APPLE_ID="xxx" \
  --build-arg AUTH_APPLE_SECRET="xxx" \
  .
docker push "$WEB_IMAGE"
```

### 6.3 Deploy Web to Cloud Run
```bash
gcloud run deploy seere-yaana-web \
  --image=asia-south1-docker.pkg.dev/seere-yaana-prod/seere-yaana/web:v1 \
  --region=asia-south1 \
  --allow-unauthenticated \
  --port=3000 \
  --cpu=1 --memory=512Mi \
  --min-instances=0 --max-instances=4 \
  --concurrency=80 \
  --set-env-vars="NODE_ENV=production,NEXT_PUBLIC_API_URL=https://api.yourdomain.com,API_INTERNAL_URL=https://seere-yaana-api-xxxx.a.run.app,ADMIN_API_INTERNAL_URL=https://seere-yaana-api-xxxx.a.run.app,AUTH_URL=https://www.yourdomain.com,NEXT_PUBLIC_RAZORPAY_KEY_ID=rzp_live_xxx,NEXT_PUBLIC_BRAND_LOGO=https://ik.imagekit.io/your_id/logo.png" \
  --set-secrets="AUTH_SECRET=AUTH_SECRET:latest,ADMIN_PROXY_SHARED_SECRET=ADMIN_PROXY_SHARED_SECRET:latest"
```
Note the **web service URL**.

---

## Phase 7 — Domain, DNS & TLS

### 7.1 Map custom domains in Cloud Run
```bash
gcloud beta run domain-mappings create --service=seere-yaana-web --domain=www.yourdomain.com --region=asia-south1
gcloud beta run domain-mappings create --service=seere-yaana-api --domain=api.yourdomain.com --region=asia-south1
```
Each prints DNS records (usually `CNAME` to `ghs.googlehosted.com` or A/AAAA records).

### 7.2 Point GoDaddy at those records
**Option A — DNS stays at GoDaddy:**
GoDaddy → *My Products* → your domain → **DNS** → add:
| Type | Name | Value |
|------|------|-------|
| CNAME | `www` | `ghs.googlehosted.com` |
| CNAME | `api` | `ghs.googlehosted.com` |
| (apex redirect) | `@` | forward to `https://www.yourdomain.com` |

**Option B — move DNS to Cloudflare (recommended):**
1. Cloudflare → add site → copy its 2 nameservers.
2. GoDaddy → domain → **Nameservers → Change → Enter my own** → paste Cloudflare's.
3. In Cloudflare add the same `www` and `api` CNAME records.
4. Set Cloudflare SSL mode to **Full (strict)**.
5. For Cloud Run domain validation, set the records to **DNS-only (grey cloud)** until
   Google issues the cert, then optionally enable the orange proxy.

TLS certificates are **issued automatically and free** by Cloud Run (and/or Cloudflare).
Propagation: a few minutes to a few hours.

---

## Phase 8 — Wire up external services to the live domain

These break if left on `localhost` — update each provider's dashboard:

1. **Google OAuth** (console.cloud.google.com → Credentials):
   Authorized redirect URI → `https://www.yourdomain.com/api/auth/callback/google`
2. **Facebook Login**: Valid OAuth Redirect URI → `https://www.yourdomain.com/api/auth/callback/facebook`
3. **Apple**: Return URL → `https://www.yourdomain.com/api/auth/callback/apple`
4. **Razorpay Dashboard → Webhooks**: add
   `https://api.yourdomain.com/api/payments/razorpay/...` (your webhook route),
   set the secret = `RAZORPAY_WEBHOOK_SECRET`. Subscribe to `payment.captured`, `order.paid`.
5. **ImageKit**: confirm `IMAGEKIT_URL_ENDPOINT` matches your account; allowed origins include your domain.
6. **Delhivery**: switch `DELHIVERY_USE_STAGING=false` + production token + base URL `https://track.delhivery.com`.

---

## Phase 9 — Cost controls (keep it ~$0–5/mo)

| Lever | Setting | Effect |
|-------|---------|--------|
| Scale to zero | `--min-instances=0` (both services) | $0 compute when idle |
| Right-size | `--cpu=1 --memory=512Mi` | minimal billable units |
| Concurrency | `--concurrency=80` | fewer instances for same traffic |
| Cap spend | `--max-instances=4` | bounds worst-case bill |
| DB | Neon free tier (scale-to-zero) | $0 database |
| CDN | Cloudflare free + ImageKit | no GCP egress/CDN charges |
| Images | ImageKit (already used) | no GCS storage cost |

**Set a budget alert:** Billing → Budgets & alerts → create budget (e.g. ₹500 / $6) with
email alerts at 50/90/100%.

**Trade-off:** `min-instances=0` causes a ~1–2 s cold start after idle. If you want the
storefront always warm, set the **web** service to `--min-instances=1` (~$5–8/mo) and keep
the API at 0.

**Estimated monthly bill**
| Scenario | Cost |
|----------|------|
| Both scale-to-zero + Neon free + Cloudflare | **~$0–5** |
| Web warm (min=1) + API zero + Neon free | **~$6–10** |
| First 90 days with $300 credit | **effectively $0** |

---

## Phase 10 — CI/CD (now that manual deploy works)

This repo now includes two GitHub Actions workflows:
- `.github/workflows/ci.yml`: build/type-check on `main`, `staging`, and PRs
- `.github/workflows/deploy.yml`: deploy to Cloud Run from GitHub Actions

### 10.1 Branch to environment mapping
- Push to `test` → deploys the GitHub `test` environment
- Push to `main` → deploys the GitHub `prod` environment
- Manual run (`workflow_dispatch`) → lets you choose `test` or `prod`

### 10.2 Configure GitHub Actions
Create one repository variable:
```text
DEPLOY_ENABLED=true
```

Then create two GitHub environments: `test` and `prod`.

In **each** environment, add these variables:
```text
GCP_PROJECT_ID
GCP_REGION
GCP_WIF_PROVIDER
GCP_DEPLOY_SA
AR_REPO
API_SERVICE
WEB_SERVICE
API_RUNTIME_ENV_VARS
API_RUNTIME_SECRETS
WEB_NEXT_PUBLIC_BRAND_LOGO
WEB_RUNTIME_ENV_VARS
WEB_RUNTIME_SECRETS
```

Optional environment variables:
```text
WEB_API_INTERNAL_URL
WEB_ADMIN_API_INTERNAL_URL
```

In **each** environment, add these GitHub secrets used at web image build/deploy time:
```text
WEB_AUTH_URL
WEB_NEXT_PUBLIC_API_URL
WEB_NEXT_PUBLIC_RZP_KEY
WEB_AUTH_SECRET
```

### 10.3 Recommended values
Example `test` environment values:
```text
GCP_PROJECT_ID=seere-yaana-prod
GCP_REGION=asia-south1
AR_REPO=seere-yaana
API_SERVICE=seere-yaana-api-test
WEB_SERVICE=seere-yaana-web-test
WEB_NEXT_PUBLIC_BRAND_LOGO=https://ik.imagekit.io/your_id/logo.png
API_RUNTIME_ENV_VARS=CORS_ORIGINS=https://test.seereyaana.com,IMAGEKIT_URL_ENDPOINT=https://ik.imagekit.io/your_id,IMAGEKIT_FOLDER=/seere-yaana/products,COURIER_PROVIDER=DELHIVERY,DELHIVERY_USE_STAGING=true,DELHIVERY_API_BASE_URL=https://staging-express.delhivery.com,DELHIVERY_PICKUP_LOCATION_NAME=YourWarehouse,BUSINESS_NAME=Seere Yaana,BUSINESS_PINCODE=560001,MOBILE_OTP_BYPASS=true
API_RUNTIME_SECRETS=DATABASE_URL=DATABASE_URL_TEST:latest,JWT_SECRET=JWT_SECRET_TEST:latest,RAZORPAY_KEY_ID=RAZORPAY_KEY_ID_TEST:latest,RAZORPAY_KEY_SECRET=RAZORPAY_KEY_SECRET_TEST:latest,RAZORPAY_WEBHOOK_SECRET=RAZORPAY_WEBHOOK_SECRET_TEST:latest,IMAGEKIT_PUBLIC_KEY=IMAGEKIT_PUBLIC_KEY:latest,IMAGEKIT_PRIVATE_KEY=IMAGEKIT_PRIVATE_KEY:latest,ADMIN_PROXY_SHARED_SECRET=ADMIN_PROXY_SHARED_SECRET_TEST:latest,DELHIVERY_API_TOKEN=DELHIVERY_API_TOKEN_TEST:latest
WEB_RUNTIME_ENV_VARS=MOBILE_OTP_BYPASS=true
WEB_RUNTIME_SECRETS=AUTH_SECRET=AUTH_SECRET_TEST:latest,ADMIN_PROXY_SHARED_SECRET=ADMIN_PROXY_SHARED_SECRET_TEST:latest,JWT_SECRET=JWT_SECRET_TEST:latest,ADMIN_MOBILE_NUMBERS=ADMIN_MOBILE_NUMBERS_TEST:latest
```

Example `test` environment secrets:
```text
WEB_AUTH_URL=https://test.seereyaana.com
WEB_NEXT_PUBLIC_API_URL=https://api.test.seereyaana.com
WEB_NEXT_PUBLIC_RZP_KEY=rzp_test_xxx
WEB_AUTH_SECRET=<test auth secret>
```

Add OAuth provider credentials to GCP Secret Manager instead, and reference them from `WEB_RUNTIME_SECRETS`, for example:
```text
WEB_RUNTIME_SECRETS=AUTH_SECRET=AUTH_SECRET_TEST:latest,ADMIN_PROXY_SHARED_SECRET=ADMIN_PROXY_SHARED_SECRET_TEST:latest,JWT_SECRET=JWT_SECRET_TEST:latest,ADMIN_MOBILE_NUMBERS=ADMIN_MOBILE_NUMBERS_TEST:latest,GOOGLE_CLIENT_ID=GOOGLE_CLIENT_ID_TEST:latest,GOOGLE_CLIENT_SECRET=GOOGLE_CLIENT_SECRET_TEST:latest,FACEBOOK_CLIENT_ID=FACEBOOK_CLIENT_ID_TEST:latest,FACEBOOK_CLIENT_SECRET=FACEBOOK_CLIENT_SECRET_TEST:latest,AUTH_APPLE_ID=AUTH_APPLE_ID_TEST:latest,AUTH_APPLE_SECRET=AUTH_APPLE_SECRET_TEST:latest
```

Example `production` environment values:
```text
API_SERVICE=seere-yaana-api
WEB_SERVICE=seere-yaana-web
API_RUNTIME_ENV_VARS=CORS_ORIGINS=https://www.seereyaana.com,IMAGEKIT_URL_ENDPOINT=https://ik.imagekit.io/your_id,IMAGEKIT_FOLDER=/seere-yaana/products,COURIER_PROVIDER=DELHIVERY,DELHIVERY_USE_STAGING=false,DELHIVERY_API_BASE_URL=https://track.delhivery.com,DELHIVERY_PICKUP_LOCATION_NAME=YourWarehouse,BUSINESS_NAME=Seere Yaana,BUSINESS_PINCODE=560001,MOBILE_OTP_BYPASS=false
API_RUNTIME_SECRETS=DATABASE_URL=DATABASE_URL:latest,JWT_SECRET=JWT_SECRET:latest,RAZORPAY_KEY_ID=RAZORPAY_KEY_ID:latest,RAZORPAY_KEY_SECRET=RAZORPAY_KEY_SECRET:latest,RAZORPAY_WEBHOOK_SECRET=RAZORPAY_WEBHOOK_SECRET:latest,IMAGEKIT_PUBLIC_KEY=IMAGEKIT_PUBLIC_KEY:latest,IMAGEKIT_PRIVATE_KEY=IMAGEKIT_PRIVATE_KEY:latest,ADMIN_PROXY_SHARED_SECRET=ADMIN_PROXY_SHARED_SECRET:latest,DELHIVERY_API_TOKEN=DELHIVERY_API_TOKEN:latest
WEB_RUNTIME_ENV_VARS=MOBILE_OTP_BYPASS=false
WEB_RUNTIME_SECRETS=AUTH_SECRET=AUTH_SECRET:latest,ADMIN_PROXY_SHARED_SECRET=ADMIN_PROXY_SHARED_SECRET:latest,JWT_SECRET=JWT_SECRET:latest,ADMIN_MOBILE_NUMBERS=ADMIN_MOBILE_NUMBERS:latest
```

Example `prod` environment secrets:
```text
WEB_AUTH_URL=https://www.seereyaana.com
WEB_NEXT_PUBLIC_API_URL=https://api.seereyaana.com
WEB_NEXT_PUBLIC_RZP_KEY=rzp_live_xxx
WEB_AUTH_SECRET=<prod auth secret>
```

And reference production OAuth credentials from GCP Secret Manager through `WEB_RUNTIME_SECRETS`, for example:
```text
WEB_RUNTIME_SECRETS=AUTH_SECRET=AUTH_SECRET:latest,ADMIN_PROXY_SHARED_SECRET=ADMIN_PROXY_SHARED_SECRET:latest,JWT_SECRET=JWT_SECRET:latest,ADMIN_MOBILE_NUMBERS=ADMIN_MOBILE_NUMBERS:latest,GOOGLE_CLIENT_ID=GOOGLE_CLIENT_ID:latest,GOOGLE_CLIENT_SECRET=GOOGLE_CLIENT_SECRET:latest,FACEBOOK_CLIENT_ID=FACEBOOK_CLIENT_ID:latest,FACEBOOK_CLIENT_SECRET=FACEBOOK_CLIENT_SECRET:latest,AUTH_APPLE_ID=AUTH_APPLE_ID:latest,AUTH_APPLE_SECRET=AUTH_APPLE_SECRET:latest
```

### 10.4 Workload Identity Federation
Use GitHub Actions → GCP Workload Identity Federation instead of JSON service-account keys:
- `GCP_WIF_PROVIDER`: `projects/.../locations/global/workloadIdentityPools/.../providers/...`
- `GCP_DEPLOY_SA`: service account with permissions for Cloud Run deploy, Artifact Registry push, and reading Secret Manager metadata

Minimum roles for the deploy service account usually include:
- `roles/run.admin`
- `roles/artifactregistry.writer`
- `roles/iam.serviceAccountUser`
- `roles/secretmanager.viewer`

### 10.5 What the deploy workflow does
On each deploy it will:
1. Authenticate to GCP using Workload Identity Federation.
2. Build and push the API image.
3. Deploy API to Cloud Run with environment-specific env vars and Secret Manager bindings.
4. Verify `GET /health` on the deployed API.
5. Build and push the web image using the environment-specific public URLs.
6. Deploy web to Cloud Run.
7. Verify the deployed web service responds.

### 10.6 Important behavior changes
- The API container now runs `prisma migrate deploy` on startup instead of `prisma db push`.
- `WEB_RUNTIME_SECRETS` should include `JWT_SECRET`, because the web app signs the admin bootstrap cookie.
- `ADMIN_MOBILE_NUMBERS` can be supplied through `WEB_RUNTIME_SECRETS` instead of `WEB_RUNTIME_ENV_VARS` if you do not want admin numbers visible in plain deployment config.
- OAuth provider credentials for the web app can be supplied through `WEB_RUNTIME_SECRETS`; they do not need to be GitHub secrets or web build args.
- `WEB_API_INTERNAL_URL` is optional; if omitted, the workflow automatically uses the deployed API service URL.

---

## Phase 11 — Go-live checklist

- [ ] Neon schema pushed/migrated; `DATABASE_URL` uses the **pooled** host + `sslmode=require`
- [ ] Move from `prisma db push` → `prisma migrate deploy` for prod safety
- [ ] All secrets in Secret Manager; none in images or plaintext env
- [ ] CORS locked to `https://www.yourdomain.com`
- [ ] API `/health` returns 200 on the live URL
- [ ] Web loads on `https://www.yourdomain.com`
- [ ] OAuth redirect URIs updated for Google/Facebook/Apple → login works end-to-end
- [ ] Razorpay **live** keys + webhook URL + signature verified on a real ₹1 test order
- [ ] ImageKit uploads work from `/admin`
- [ ] Delhivery switched to production token; pickup warehouse name exact
- [ ] Admin route gate works (`/admin` requires admin mobile)
- [ ] `ADMIN_PROXY_SHARED_SECRET` identical in web + api
- [ ] Budget alert configured
- [ ] Cold-start behaviour acceptable (or web min-instances=1)
- [ ] Rotate any keys that were ever used locally

---

## Risks & expert notes specific to YOUR repo

1. **`prisma db push` on every API start** (current Dockerfile CMD) can cause data loss on
   schema drift and adds cold-start latency. Switch to versioned migrations before launch.
2. **Open CORS** (`app.use(cors())`) — tighten to your domain (Phase 5.1).
3. **NEXT_PUBLIC_* baked at build** — any change to API URL/brand/Razorpay public key
   requires a **web image rebuild**, not just a redeploy.
4. **Two services talking** — `API_INTERNAL_URL` can point at the API's `*.run.app` URL
   (simplest). For private-only API, use Cloud Run service-to-service auth later.
5. **Architecture doc says Cloudinary**, but code uses **ImageKit** — env/keys must be ImageKit.
6. **Stateful uploads/sharp** — image processing runs in-request; 512Mi is usually fine,
   bump to 1Gi if large saree images cause OOM.
7. **Apple `AUTH_APPLE_SECRET`** is a JWT that **expires (max 6 months)** — set a calendar
   reminder to regenerate.
