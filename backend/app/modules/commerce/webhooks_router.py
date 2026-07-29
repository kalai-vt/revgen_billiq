from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.responses import make_response
from app.models.commerce import CommerceIntegrationConfig, CommerceSyncLog
from app.modules.commerce import orders_service as service
from app.modules.commerce.providers.base import ProviderOrder, ProviderOrderItem

router = APIRouter(prefix="/api/commerce", tags=["commerce-webhooks"])


class WebhookOrderItem(BaseModel):
    sku: str
    name: str
    quantity: float
    unit_price: float


class WebhookOrderPayload(BaseModel):
    """Generic order shape accepted by the webhook receiver today. Real Swiggy/Zomato webhook
    payloads have their own platform-specific formats — parsing those goes in each provider's
    `verify_webhook`/an adapter here once partner API docs are available; until then this
    endpoint is exercised by the mock provider and is ready to receive a real payload the moment
    partner access exists (only the payload-shape translation needs to be added, not the
    ingestion pipeline itself)."""

    order_id: str
    status: str = "placed"
    customer_name: str | None = None
    customer_phone: str | None = None
    items: list[WebhookOrderItem] = Field(min_length=1)
    subtotal: float
    discount: float = 0.0
    commission: float = 0.0
    packaging_charge: float = 0.0
    tax_amount: float = 0.0
    total_amount: float
    payout_amount: float = 0.0


@router.post("/webhooks/{platform}/{webhook_token}")
def receive_webhook(
    platform: str,
    webhook_token: str,
    payload: WebhookOrderPayload,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    if platform not in ("swiggy", "zomato"):
        raise HTTPException(status_code=404, detail="Unknown platform")

    # No bearer auth here by design — inbound webhooks from an external platform can't carry our
    # JWTs. The unguessable per-tenant webhook_token in the URL is what authenticates the caller.
    config = (
        db.query(CommerceIntegrationConfig)
        .filter(CommerceIntegrationConfig.webhook_token == webhook_token, CommerceIntegrationConfig.platform == platform)
        .first()
    )
    if not config:
        raise HTTPException(status_code=404, detail="Unknown webhook")
    if not config.is_enabled:
        raise HTTPException(status_code=403, detail="This integration is disabled")

    provider_order = ProviderOrder(
        platform_order_id=payload.order_id,
        status=payload.status,
        order_time=datetime.now(timezone.utc),
        customer_name=payload.customer_name,
        customer_phone=payload.customer_phone,
        items=[
            ProviderOrderItem(platform_sku=i.sku, item_name=i.name, quantity=i.quantity, unit_price=i.unit_price)
            for i in payload.items
        ],
        subtotal=payload.subtotal,
        platform_discount=payload.discount,
        platform_commission=payload.commission,
        packaging_charge=payload.packaging_charge,
        tax_amount=payload.tax_amount,
        total_amount=payload.total_amount,
        payout_amount=payload.payout_amount,
    )
    order = service.ingest_order(db, config.tenant_id, config, provider_order)

    log = CommerceSyncLog(
        tenant_id=config.tenant_id,
        integration_config_id=config.id,
        platform=platform,
        sync_type="webhook",
        status="success",
        orders_processed=1,
        orders_failed=0,
        started_at=datetime.now(timezone.utc),
        completed_at=datetime.now(timezone.utc),
    )
    db.add(log)
    config.last_synced_at = datetime.now(timezone.utc)
    config.last_sync_status = "success"
    db.add(config)
    db.commit()

    return make_response(True, "Order received", {"order_id": order.id})
