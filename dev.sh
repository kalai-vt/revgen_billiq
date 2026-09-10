#!/usr/bin/env bash
# One-command local dev for macOS/Linux. Windows: use dev.ps1.
#
# Sets up whatever is missing (venv, deps, .env, seed data) and then runs all three servers
# together, so the common failure of starting the backend on the wrong port — or forgetting the
# seed entirely, which leaves you with no account that can log in — can't happen.
set -euo pipefail
cd "$(dirname "$0")"

# Not optional: both frontends proxy /api here (hardcoded in their vite.config.ts), so a backend
# on any other port leaves every request in the app hitting nothing.
API_PORT=8010

step() { printf '\n\033[1;36m==> %s\033[0m\n' "$1"; }

step "Backend setup"
cd backend
[ -d .venv ] || python3 -m venv .venv
# shellcheck disable=SC1091
source .venv/bin/activate
pip install -q -r requirements.txt
[ -f .env ] || cp .env.example .env
cd ..

step "Frontend setup"
[ -d billing-app/node_modules ]  || (cd billing-app  && npm install)
[ -d admin-portal/node_modules ] || (cd admin-portal && npm install)

step "Starting backend on :$API_PORT"
(cd backend && ./.venv/bin/python -m uvicorn app.main:app --reload --port "$API_PORT") &
BACKEND_PID=$!
# Every child dies with this script, however it exits — no orphaned servers holding the ports
# hostage on the next run.
trap 'kill 0' EXIT INT TERM

# Migrations run on the backend's own startup, so the seed has to wait for it to actually answer.
printf 'waiting for the API'
until curl -sf -o /dev/null "http://127.0.0.1:$API_PORT/docs"; do printf '.'; sleep 1; done
echo ' up'

step "Seeding a login"
(cd backend && ./.venv/bin/python -m scripts.seed_dev)

step "Starting frontends"
(cd billing-app  && npm run dev) &
(cd admin-portal && npm run dev) &

cat <<'BANNER'

  ─────────────────────────────────────────────────────────
   Billing app    http://localhost:5173
                  owner@ogcafe.test  /  DevPassword@123

   Admin Portal   http://localhost:5174
                  run:  cd backend && python -m scripts.bootstrap_admin

   API docs       http://localhost:8010/docs

   Ctrl-C stops all three.
  ─────────────────────────────────────────────────────────

BANNER

wait $BACKEND_PID
