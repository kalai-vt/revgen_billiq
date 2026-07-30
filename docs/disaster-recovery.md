# Disaster Recovery Runbook

This covers backup/restore and "stand up a new environment from nothing" for RevGen BillIQ's
two Postgres databases (tenant-facing Billing app + RevGenIQ Admin Portal), both hosted on
[Neon](https://neon.tech) and wired into the Vercel project via Vercel's native Neon integration.

There is no custom backup script or cron job anywhere in this codebase. Backups are entirely
Neon's responsibility — this document explains what that gives you and how to use it.

## 1. Backup mechanism: Neon PITR

Both databases — the tenant/Billing database (`REVGENIQ_DATABASE_URL`) and the Admin Portal's
database (`REVGENIQ_ADMIN_DATABASE_URL`, see `backend/app/core/config.py`) — run on Neon Postgres.
Neon provides continuous, WAL-based **point-in-time recovery (PITR)** out of the box: every
committed change is captured continuously, and you can restore (or branch) to any timestamp
within the project's retention window without having to schedule or maintain anything yourself.

This repo does not pin, configure, or assert a specific retention window anywhere in code — it's
a property of the Neon project's current plan, not something this app controls. **Before relying
on a specific recovery window in an incident, check the actual current retention window in the
Neon dashboard** (Project → Settings → the branch/plan's PITR/history retention setting) rather
than assuming a number. If the tenant and admin databases live in different Neon projects, check
each one separately — they are not guaranteed to have the same retention window.

There is nothing else to check for "is backup happening" — as long as the Neon project is active
and on a plan with PITR, backup is continuous and automatic.

## 2. Restoring from a Neon backup

1. **Identify the target point in time** — as precisely as possible (Neon restores are exact to
   the second). If diagnosing an incident, err on the side of the last-known-good moment rather
   than "now."
2. **In the Neon dashboard**, choose one of two restore mechanisms:
   - **Create a new branch from a point in time** (recommended for anything except a full,
     confirmed data-loss event) — this creates a new, independent database/connection string
     from the chosen point in time and leaves the current (possibly broken) database untouched.
     This lets you inspect the restored data, or run the app against it, before committing to
     cutting production over.
   - **Restore in place** — rewinds the existing branch itself to the chosen point in time. This
     is destructive to anything committed after that point and harder to undo; only use it once
     you're certain the point-in-time branch is what you want and don't need a side-by-side
     comparison.
3. **Get the new connection string** for the restored branch/database from the Neon dashboard.
4. **Repoint the app at it on Vercel.** Update whichever of `REVGENIQ_DATABASE_URL` (tenant) or
   `REVGENIQ_ADMIN_DATABASE_URL` (admin) needs to change:
   ```bash
   vercel env rm REVGENIQ_DATABASE_URL production
   vercel env add REVGENIQ_DATABASE_URL production
   # paste the new Neon connection string when prompted
   vercel --prod --yes
   ```
   The final `vercel --prod --yes` is not optional. `backend/app/core/config.py` builds a single
   `settings = Settings()` object once, at module import time, and `backend/app/core/db.py` /
   `app/core/admin_db.py` each build their SQLAlchemy `engine` from that value once, also at
   import time. Nothing in the running process re-reads environment variables after that.
   Updating an env var on Vercel does not restart or redeploy anything already running — the
   existing deployment keeps using the old (now-stale, possibly gone) connection string
   indefinitely. Only a new deployment picks up the new value, which is why the redeploy step is
   required, not just the env var change — this applies to any env var change on this project,
   not just database URLs.
5. **Let the schema catch up.** On the next cold start, both `apply_pending_migrations()` (tenant)
   and `apply_pending_admin_migrations()` (admin) — both in `backend/app/core/migrate.py`, both
   called from `backend/app/main.py` — automatically run `alembic upgrade head` against their
   respective database, so a restored database that's behind current code gets brought forward
   automatically. **Exception**: if you restored `REVGENIQ_ADMIN_DATABASE_URL` to a point in time
   *before* this repo's admin migration chain existed (i.e. a backup older than the
   `98d0de5b3882_baseline_current_admin_schema` revision being added), the restored database
   already has the right tables but no `alembic_version_admin` row — stamp it once instead of
   upgrading, or the baseline migration will try to `CREATE TABLE` on tables that already exist:
   ```bash
   cd backend
   alembic -c alembic_admin.ini stamp head
   ```
   (run with `REVGENIQ_ADMIN_DATABASE_URL` in the environment pointed at the restored database).
   Any restore to a point in time *after* that revision landed doesn't need this — the normal
   automatic `upgrade head` on next cold start is enough.
6. **Verify.** Hit `GET /api/health` — it actually executes `SELECT 1` against the tenant database
   and reports `503`/`"database": "unreachable"` if it can't connect, rather than a static "ok"
   (see `backend/app/main.py`). Confirm sign-in works against both the Billing app and the Admin
   Portal before considering the restore complete.

## 3. Standing up a fresh environment from scratch

Order of operations for a new deploy target (a new Vercel project, or recovering from a
catastrophic loss of the existing one):

1. **Provision two Postgres databases** — one for the tenant/Billing app, one for the RevGenIQ
   Admin Portal. They are deliberately separate databases, not just separate schemas: per the
   comment in `backend/app/core/admin_db.py`, this isolates RevGenIQ employee credentials and the
   admin audit trail from tenant customer data, and Postgres can't enforce foreign keys across
   the two anyway. Two Neon projects (or two branches within one, if you're consolidating infra)
   both work; the app doesn't assume anything beyond a Postgres connection string for each.
2. **Set the environment variables.** `backend/.env.example` is the source of truth for the full
   list — read it fresh rather than relying on memory, it's kept up to date with every new
   required variable. At minimum for a working production deploy you need real values (not the
   file's placeholders) for: `REVGENIQ_ENVIRONMENT=production`, `REVGENIQ_DATABASE_URL`,
   `REVGENIQ_ADMIN_DATABASE_URL`, `REVGENIQ_JWT_SECRET`, `REVGENIQ_ADMIN_JWT_SECRET`,
   `REVGENIQ_COMMERCE_ENCRYPTION_KEY`, `REVGENIQ_CORS_ORIGINS`, `REVGENIQ_APP_URL`,
   `REVGENIQ_ADMIN_PORTAL_URL`, and `REVGENIQ_EMAIL_PROVIDER` plus its matching credentials
   (`resend` or `smtp`) — see §4 below for what happens if you skip any of these. Optional
   integrations (Razorpay, Sentry, the cron secret) can be left unset; the app degrades those
   features gracefully rather than failing to boot.
3. **Deploy the app.** `apply_pending_migrations()` and `apply_pending_admin_migrations()` both
   run automatically on the backend's first cold start and apply the full migration history for
   each database via Alembic (`backend/alembic.ini` / `backend/alembic/env.py` for tenant,
   `backend/alembic_admin.ini` / `backend/alembic_admin/env.py` for admin) — there's no separate
   "run migrations" step to perform yourself for either database on a genuinely fresh one.
4. **Create the first Super Admin.** There is no public sign-up flow for the Admin Portal — every
   admin account after the first is created by an existing Super Admin via the Staff page
   (`admin_staff.service.invite_staff`), which is a chicken-and-egg problem on a brand new
   database. `backend/scripts/bootstrap_admin.py` exists specifically to break that:
   ```bash
   cd backend
   python -m scripts.bootstrap_admin
   ```
   Run it with the venv active and `REVGENIQ_ADMIN_DATABASE_URL` pointed at the target database
   (the same env vars the deployed app uses). It reads `BOOTSTRAP_ADMIN_EMAIL`,
   `BOOTSTRAP_ADMIN_PASSWORD`, and optionally `BOOTSTRAP_ADMIN_FIRST_NAME` /
   `BOOTSTRAP_ADMIN_LAST_NAME` from the environment (falling back to interactive prompts if a
   terminal is attached and they're unset); the password must be at least 10 characters. It's
   safe to run more than once — it's a no-op if any admin user already exists. Sign in to the
   Admin Portal with that account and invite the rest of the team from the Staff page.

## 4. Known failure modes from this project's history

Two real production incidents are worth knowing before you touch config or migrations:

- **Schema drift after a deploy with no matching migration step** (fixed in `a56d61b`, "Auto-apply
  pending DB migrations on startup"). New columns (added for auto-print/printer config) shipped in
  code, but Vercel deploys code with no separate migration step — the live Neon tenant database
  was left missing those columns until someone ran `alembic upgrade head` by hand, and every
  request touching the affected table (including login) 500'd in the meantime. This is why
  `apply_pending_migrations()` now runs on every cold start for the tenant database. Until this
  runbook was written, the exact same gap existed for the Admin Portal's database with no fix at
  all — there was no Alembic chain for `app/models_admin/*` anywhere in the repo, automatic or
  manual; the admin schema had only ever been created by hand, once, out of band. That's now
  closed too (`backend/alembic_admin.ini`, wired into `apply_pending_admin_migrations()`), but any
  environment that predates this fix needs the one-time `stamp head` step described in §2 and §3
  above before it applies cleanly.

- **Silent production email failures from a misconfigured (not missing) env var** (fixed in
  `4cc8441`, "Fix production email delivery: crash-safe sends + provider misconfig warning").
  `REVGENIQ_EMAIL_PROVIDER` was left at its default (`console`, which only prints emails to logs)
  in production, so registration/password-reset/admin-invite emails were never actually
  delivered, with nothing visibly erroring. A related bug compounded it: once a real provider
  *was* configured, an uncaught `EmailSendError` on an actual send failure crashed the request
  with a 500 even though the underlying record had already been committed. Both are now fixed —
  sends are crash-safe, and (per `backend/app/core/config.py`'s `_guard_insecure_settings`) an
  email provider that isn't `resend` or `smtp` now hard-fails app startup in production instead
  of silently warning.

**Before shipping a new hard-required production env var**, that second incident (and the design
of `_guard_insecure_settings` itself) implies a checklist:

- `_guard_insecure_settings` runs once, at process import time (`settings = Settings()` at the
  bottom of `backend/app/core/config.py`). If you add a new `raise ValueError(...)` there gated on
  `environment == "production"`, the **entire app fails to boot** — not just the feature you
  touched — the moment that code deploys, if the matching env var isn't already set on Vercel.
- There is no grace period: Vercel deploys code and doesn't separately stage env vars, so the
  required variable must already be set on Vercel (`vercel env add <NAME> production`) **before or
  in the same change** as the code that requires it — never added after the fact "once someone
  notices."
- Add the new variable to `backend/.env.example` in the same PR, with a comment explaining what
  it's for and how to generate/obtain it — this is the file the deploy runbook (§3 above) and the
  README point people to as the source of truth, and it drifting out of date is how this kind of
  gap gets missed.
- Prefer the "optional, feature degrades gracefully" pattern (see `is_configured()` in
  `backend/app/core/payments/razorpay_client.py`, or the no-op-until-set `init_sentry()` in
  `backend/app/core/observability.py`) over a hard production-only failure wherever the field
  genuinely is optional. Reserve `_guard_insecure_settings`-style hard failures for things that are
  actual security requirements — secrets, encryption keys, a real email provider — as it's used
  for today.

## 5. Escalation

This is currently a single-maintainer project — there is no on-call rotation, support team, or
escalation policy beyond "whoever is looking at this." If you're reading this runbook because
something is actively broken, you are the escalation path: check the Neon project dashboard
directly for database status/incidents, and the Vercel project dashboard for deployment and
function logs. There's no one else to page.
