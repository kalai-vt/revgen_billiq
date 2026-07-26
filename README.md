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
