from __future__ import annotations

import os
from pathlib import Path
from typing import Any
from collections.abc import Awaitable, Callable

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from app.core.config import settings
from app.core.limits import FeatureNotAvailableError, LimitExceededError
from app.core.responses import make_response
from app.modules.activity.router import router as activity_router
from app.modules.analytics.router import router as analytics_router
from app.modules.auth.router import router as auth_router
from app.modules.billing_plans.router import router as billing_plans_router
from app.modules.catalog.router import router as catalog_router
from app.modules.categories.router import router as categories_router
from app.modules.customers.router import router as customers_router
from app.modules.inventory.router import router as inventory_router
from app.modules.notifications.router import router as notifications_router
from app.modules.payments.router import router as payments_router
from app.modules.pos.router import router as pos_router
from app.modules.sales.router import router as sales_router
from app.modules.search.router import router as search_router
from app.modules.settings.router import router as settings_router

app = FastAPI(title="RevGen BillIQ API", version="1.0.0")

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
app.include_router(billing_plans_router)
app.include_router(categories_router)
app.include_router(catalog_router)
app.include_router(customers_router)
app.include_router(payments_router)
app.include_router(inventory_router)
app.include_router(pos_router)
app.include_router(sales_router)
app.include_router(analytics_router)
app.include_router(settings_router)
app.include_router(activity_router)
app.include_router(notifications_router)
app.include_router(search_router)


class HealthResponse(BaseModel):
    status: str
    service: str
    version: str


@app.get("/", include_in_schema=False)
def root() -> dict[str, Any]:
    return {"message": "RevGen BillIQ API is online"}


@app.get("/api/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(status="ok", service="billing-api", version="1.0.0")


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
