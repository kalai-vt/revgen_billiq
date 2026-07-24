# RevGen BillIQ

RevGen BillIQ is a cloud-native, multi-tenant SaaS billing and POS platform designed for retail, restaurant, hospitality, pharmacy, and service businesses.

## What is included in this starter scaffold
- Product overview and architecture notes aligned to the specification
- A FastAPI backend with health and module discovery endpoints
- A Vite + React + TypeScript frontend shell
- A reusable AI prompt template for future module generation

## Repository structure
- backend/ - FastAPI services and API routes
- frontend/ - React app shell for dashboards and workflows
- docs/ - Product architecture and prompt library documents

## Development order
The scaffold is organized to support the master ordering from the specification:
1. Foundation and tenancy
2. Master data and inventory
3. Sales and billing workflows
4. Industry modules and analytics
5. Platform services and admin portals

## Quick start
### Backend
```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```
