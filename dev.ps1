# One-command local dev for Windows.  Run from the repo root:
#
#     powershell -ExecutionPolicy Bypass -File .\dev.ps1
#
# Sets up whatever is missing (venv, deps, .env, seed data), then opens the three servers in their
# own windows. This exists because the two ways local dev usually fails here are silent: starting
# the backend on a port the frontends don't proxy to, and skipping the seed — which leaves you
# with no account that can log in.
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

# Not optional: both frontends proxy /api here (hardcoded in their vite.config.ts), so a backend
# on any other port leaves every request in the app hitting nothing.
$ApiPort = 8010

function Step($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }

Step 'Backend setup'
Push-Location backend
if (-not (Test-Path .venv)) { python -m venv .venv }
& .\.venv\Scripts\python.exe -m pip install -q -r requirements.txt
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
Pop-Location

Step 'Frontend setup'
if (-not (Test-Path billing-app\node_modules))  { Push-Location billing-app;  npm install; Pop-Location }
if (-not (Test-Path admin-portal\node_modules)) { Push-Location admin-portal; npm install; Pop-Location }

Step "Starting backend on :$ApiPort"
Start-Process powershell -ArgumentList @(
  '-NoExit', '-Command',
  "Set-Location '$PSScriptRoot\backend'; .\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port $ApiPort"
)

# Migrations run on the backend's own startup, so the seed has to wait for it to actually answer.
Write-Host -NoNewline 'waiting for the API'
do {
  Start-Sleep -Seconds 1
  Write-Host -NoNewline '.'
  $up = try { (Invoke-WebRequest "http://127.0.0.1:$ApiPort/docs" -UseBasicParsing -TimeoutSec 2).StatusCode -eq 200 } catch { $false }
} until ($up)
Write-Host ' up'

Step 'Seeding a login'
Push-Location backend
& .\.venv\Scripts\python.exe -m scripts.seed_dev
Pop-Location

Step 'Starting frontends'
Start-Process powershell -ArgumentList @('-NoExit', '-Command', "Set-Location '$PSScriptRoot\billing-app'; npm run dev")
Start-Process powershell -ArgumentList @('-NoExit', '-Command', "Set-Location '$PSScriptRoot\admin-portal'; npm run dev")

Write-Host @"

  ---------------------------------------------------------
   Billing app    http://localhost:5173
                  owner@ogcafe.test  /  DevPassword@123

   Admin Portal   http://localhost:5174
                  run:  cd backend; .\.venv\Scripts\python.exe -m scripts.bootstrap_admin

   API docs       http://localhost:8010/docs

   Each server has its own window - close them to stop.
  ---------------------------------------------------------

"@ -ForegroundColor Green
