# RevGen BillIQ

RevGen BillIQ is a cloud-native, multi-tenant SaaS billing and POS platform designed for retail, restaurant, hospitality, pharmacy, and service businesses.

## What is included
- A FastAPI backend covering auth/tenancy, catalog, customers, inventory, POS/billing, invoices & returns, analytics, notifications, settings, and billing plans
- A Vite + React + TypeScript + Tailwind frontend covering the full authenticated app plus branded auth screens (login, sign up, password reset, email verification, sign out)
- Alembic migrations tracking the full schema history
- A pytest suite covering the backend modules

## Repository structure
- backend/ - FastAPI services, SQLAlchemy models, and Alembic migrations
- billing-app/ - customer-facing React app covering dashboards, POS, and billing workflows

## Quick start
### Backend
```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### Billing app
```bash
cd billing-app
npm install
npm run dev
```

## Deploying
This is a single Vercel project (`rev-gen-ai/revgen-billiq`) hosting three services, all defined
in the root `vercel.json`: `billing-app` (served under `/billiq`), `admin-portal` (served under
`/admin`), and `backend` (the FastAPI API, served under `/api`). **Pushing to `main` deploys
straight to production** — there's no CI gate blocking it today. `.github/workflows/ci.yml` runs
backend tests + `pip-audit`, and a typecheck+build for both frontends, on every push/PR to `main`,
but it and the Vercel deploy are independent pipelines: a failing CI run does not stop or roll back
a Vercel deploy.

**Environment variables** — `backend/.env.example` is the source of truth for the full list; treat
this README as a pointer to it, not a copy (copies drift). In production specifically, the app
refuses to boot at all unless these are set to real, non-default values (see
`backend/app/core/config.py`'s `_guard_insecure_settings`):
- `REVGENIQ_JWT_SECRET` and `REVGENIQ_ADMIN_JWT_SECRET` — 32+ characters, not the dev defaults
- `REVGENIQ_COMMERCE_ENCRYPTION_KEY` — a real Fernet key, not the dev default
- `REVGENIQ_EMAIL_PROVIDER` — must be `resend` or `smtp` with matching credentials filled in;
  anything else (including the default, `console`) fails startup rather than silently dropping
  verification/password-reset emails

**Migrations apply automatically.** Both databases' schemas are brought up to date on every cold
start — the tenant database by `apply_pending_migrations()`, the Admin Portal's by its own
`apply_pending_admin_migrations()` (both in `backend/app/core/migrate.py`) — there's no separate
migration step in the deploy process for either. If you're touching `app/models_admin/*` on an
environment that predates the admin migration chain, see `docs/disaster-recovery.md` for the
one-time `stamp head` step it needs first.

**First-time setup on a fresh environment:** after the first successful deploy, create the initial
Super Admin account — there's no sign-up flow for the Admin Portal and no other way to get one in:
```bash
cd backend
python -m scripts.bootstrap_admin
```
See `backend/scripts/bootstrap_admin.py` for the exact env vars it reads.

**Backups and restores** are handled entirely by Neon's point-in-time recovery — see
[`docs/disaster-recovery.md`](docs/disaster-recovery.md) for the restore procedure and for standing
up a brand new environment from scratch.

**Optional integrations** are opt-in and never block a deploy if left unset: Razorpay
(`REVGENIQ_RAZORPAY_KEY_ID` / `_KEY_SECRET` / `_WEBHOOK_SECRET`) powers self-service subscription
checkout and is inert without it (see `backend/app/core/payments/razorpay_client.py`); Sentry
(`REVGENIQ_SENTRY_DSN`) powers error tracking and is never initialized without it (see
`backend/app/core/observability.py`).
