from __future__ import annotations

import os
from pathlib import Path
from typing import Any
from collections.abc import Awaitable, Callable

from fastapi import Depends, FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.db import get_db
from app.core.limits import FeatureNotAvailableError, LimitExceededError
from app.core.migrate import apply_all_pending_migrations
from app.core.observability import init_sentry
from app.core.rate_limit import limiter
from app.core.responses import make_response
from app.modules.activity.router import router as activity_router
from app.modules.admin_audit.router import router as admin_audit_router
from app.modules.admin_auth.router import router as admin_auth_router
from app.modules.admin_customers.router import router as admin_customers_router
from app.modules.admin_dashboard.router import router as admin_dashboard_router
from app.modules.admin_communications.router import router as admin_communications_router
from app.modules.admin_features.router import router as admin_features_router
from app.modules.admin_notifications.router import router as admin_notifications_router
from app.modules.admin_payments.router import router as admin_payments_router
from app.modules.admin_reports.router import router as admin_reports_router
from app.modules.admin_staff.router import router as admin_staff_router
from app.modules.admin_subscriptions.router import router as admin_subscriptions_router
from app.modules.admin_support.router import router as admin_support_router
from app.modules.admin_system.router import router as admin_system_router
from app.modules.admin_usage.router import router as admin_usage_router
from app.modules.analytics.router import router as analytics_router
from app.modules.auth.router import router as auth_router
from app.modules.billing_plans.router import router as billing_plans_router
from app.modules.catalog.router import router as catalog_router
from app.modules.categories.router import router as categories_router
from app.modules.commerce.config_router import router as commerce_config_router
from app.modules.commerce.dashboard_router import router as commerce_dashboard_router
from app.modules.commerce.orders_router import router as commerce_orders_router
from app.modules.commerce.webhooks_router import router as commerce_webhooks_router
from app.modules.customers.router import router as customers_router
from app.modules.internal_cron.router import router as internal_cron_router
from app.modules.inventory.router import router as inventory_router
from app.modules.invoice_designer.router import router as invoice_designer_router
from app.modules.notifications.router import router as notifications_router
from app.modules.payments.router import router as payments_router
from app.modules.pos.router import router as pos_router
from app.modules.procurement.analytics_router import router as procurement_analytics_router
from app.modules.procurement.dashboard_router import router as procurement_dashboard_router
from app.modules.procurement.purchases_router import router as procurement_purchases_router
from app.modules.printing.router import router as printing_router
from app.modules.procurement.returns_router import router as procurement_returns_router
from app.modules.procurement.vendor_payments_router import router as procurement_vendor_payments_router
from app.modules.procurement.vendors_router import router as procurement_vendors_router
from app.modules.sales.router import router as sales_router
from app.modules.search.router import router as search_router
from app.modules.settings.router import router as settings_router
from app.modules.subscription_billing.router import router as subscription_billing_router

# Before the app exists so as much of the request lifecycle as possible is instrumented — a
# no-op unless REVGENIQ_SENTRY_DSN is set (see app/core/observability.py).
init_sentry()

app = FastAPI(
    title="RevGen BillIQ API",
    version="1.0.0",
    # Swagger/ReDoc load their JS/CSS from a CDN and expose the full schema publicly — fine for
    # a dev/staging API explored by the team, not something a production API should serve.
    docs_url="/docs" if settings.environment != "production" else None,
    redoc_url="/redoc" if settings.environment != "production" else None,
    openapi_url="/openapi.json" if settings.environment != "production" else None,
)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

# Runs on every cold start (and every local `uvicorn --reload`) so the schema never drifts from
# the code again — see app/core/migrate.py for why this (and running both concurrently) exists.
apply_all_pending_migrations()

if not os.environ.get("VERCEL"):
    # Local dev only: uploads live on disk. In production the filesystem is read-only and
    # ephemeral, and Vercel Blob (see app.core.blob) is the only storage backend, so this
    # mount/directory would be pointless (and mkdir would fail) there.
    Path("uploads").mkdir(exist_ok=True)
    app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in settings.cors_origins.split(",") if origin.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Docs/redoc pages load their JS/CSS from a CDN, so a strict Content-Security-Policy on those
# specific paths would break them — every other response gets the full header set.
_DOCS_PATHS = ("/docs", "/redoc", "/openapi.json")


@app.middleware("http")
async def security_headers(request: Request, call_next: Callable[[Request], Awaitable[Response]]) -> Response:
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
    # HSTS is a no-op over plain HTTP (browsers only honor it on HTTPS responses), so it's
    # safe to always send — it just has no effect until this is served over TLS.
    response.headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains"
    if not request.url.path.startswith(_DOCS_PATHS):
        response.headers["Content-Security-Policy"] = "default-src 'none'; frame-ancestors 'none'"
    return response


@app.exception_handler(LimitExceededError)
async def limit_exceeded_handler(_: Request, exc: LimitExceededError) -> JSONResponse:
    return JSONResponse(status_code=402, content=make_response(False, exc.message, None, [exc.message]))


@app.exception_handler(FeatureNotAvailableError)
async def feature_not_available_handler(_: Request, exc: FeatureNotAvailableError) -> JSONResponse:
    return JSONResponse(status_code=402, content=make_response(False, exc.message, None, [exc.message]))


app.include_router(auth_router)
app.include_router(admin_auth_router)
app.include_router(admin_dashboard_router)
app.include_router(admin_customers_router)
app.include_router(admin_features_router)
app.include_router(admin_staff_router)
app.include_router(admin_audit_router)
app.include_router(admin_subscriptions_router)
app.include_router(admin_payments_router)
app.include_router(admin_usage_router)
app.include_router(admin_notifications_router)
app.include_router(admin_reports_router)
app.include_router(admin_communications_router)
app.include_router(admin_support_router)
app.include_router(admin_system_router)
app.include_router(billing_plans_router)
app.include_router(subscription_billing_router)
app.include_router(categories_router)
app.include_router(catalog_router)
app.include_router(commerce_config_router)
app.include_router(commerce_orders_router)
app.include_router(commerce_webhooks_router)
app.include_router(commerce_dashboard_router)
app.include_router(customers_router)
app.include_router(payments_router)
app.include_router(inventory_router)
app.include_router(internal_cron_router)
app.include_router(procurement_vendors_router)
app.include_router(procurement_purchases_router)
app.include_router(procurement_returns_router)
app.include_router(procurement_vendor_payments_router)
app.include_router(procurement_dashboard_router)
app.include_router(procurement_analytics_router)
app.include_router(pos_router)
app.include_router(printing_router)
app.include_router(sales_router)
app.include_router(invoice_designer_router)
app.include_router(analytics_router)
app.include_router(settings_router)
app.include_router(activity_router)
app.include_router(notifications_router)
app.include_router(search_router)


class HealthResponse(BaseModel):
    status: str
    service: str
    version: str
    database: str


@app.get("/", include_in_schema=False)
def root() -> dict[str, Any]:
    return {"message": "RevGen BillIQ API is online"}


@app.get("/api/health", response_model=HealthResponse)
def health(response: Response, db: Session = Depends(get_db)) -> HealthResponse:
    # This is the endpoint a deploy platform's readiness probe hits — returning a static "ok"
    # regardless of DB state meant a database outage was indistinguishable from "everything's
    # fine" to anything watching this route. Now it actually checks.
    try:
        db.execute(text("SELECT 1"))
        db_status = "ok"
    except Exception:  # noqa: BLE001 — any DB failure means "not ready", detail isn't needed here
        db_status = "unreachable"
        response.status_code = 503
    return HealthResponse(status="ok" if db_status == "ok" else "degraded", service="billing-api", version="1.0.0", database=db_status)


@app.get("/api/modules")
def modules() -> dict[str, Any]:
    return {
        "success": True,
        "message": "Platform modules loaded",
        "data": [
            "Authentication",
            "Dashboard",
            "Billing/POS",
            "Invoices",
            "Categories",
            "Products",
            "Customers",
            "Inventory",
            "Analytics",
            "Settings",
        ],
    }
