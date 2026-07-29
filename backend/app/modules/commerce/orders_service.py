from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.models.commerce import CommerceIntegrationConfig, CommerceOrder, CommerceOrderItem, CommerceProductMapping, CommerceSyncLog
from app.models.sales import Invoice
from app.models.user import User
from app.modules.commerce.invoice_bridge import try_create_invoice_for_order
from app.modules.commerce.providers.base import ProviderOrder
from app.schemas.commerce import (
    CommerceOrderItemOut,
    CommerceOrderListItemOut,
    CommerceOrderOut,
    CommercePlatform,
    CommerceProductMappingCreate,
    UnmappedSkuOut,
)

_STATUS_MAP = {
    "placed": "received",
    "accepted": "preparing",
    "preparing": "preparing",
    "ready": "ready",
    "ready_for_pickup": "ready",
    "dispatched": "dispatched",
    "out_for_delivery": "dispatched",
    "delivered": "delivered",
    "completed": "delivered",
    "cancelled": "cancelled",
    "rejected": "cancelled",
}


class CommerceOrderError(Exception):
    def __init__(self, status_code: int, message: str) -> None:
        self.status_code = status_code
        self.message = message


def normalize_status(raw_status: str) -> str:
    return _STATUS_MAP.get(raw_status.lower(), "received")


def ingest_order(db: Session, tenant_id: str, config: CommerceIntegrationConfig, provider_order: ProviderOrder) -> CommerceOrder:
    existing = (
        db.query(CommerceOrder)
        .filter(
            CommerceOrder.tenant_id == tenant_id,
            CommerceOrder.platform == config.platform,
            CommerceOrder.platform_order_id == provider_order.platform_order_id,
        )
        .first()
    )
    if existing:
        return existing

    mappings = {
        m.platform_sku: m.product_id
        for m in db.query(CommerceProductMapping)
        .filter(CommerceProductMapping.tenant_id == tenant_id, CommerceProductMapping.platform == config.platform)
        .all()
    }

    order = CommerceOrder(
        tenant_id=tenant_id,
        platform=config.platform,
        integration_config_id=config.id,
        platform_order_id=provider_order.platform_order_id,
        order_status=normalize_status(provider_order.status),
        raw_status=provider_order.status,
        order_time=provider_order.order_time,
        customer_name=provider_order.customer_name,
        customer_phone=provider_order.customer_phone,
        subtotal=provider_order.subtotal,
        platform_discount=provider_order.platform_discount,
        platform_commission=provider_order.platform_commission,
        packaging_charge=provider_order.packaging_charge,
        tax_amount=provider_order.tax_amount,
        total_amount=provider_order.total_amount,
        payout_amount=provider_order.payout_amount,
    )
    db.add(order)
    db.flush()

    for item in provider_order.items:
        db.add(
            CommerceOrderItem(
                commerce_order_id=order.id,
                product_id=mappings.get(item.platform_sku),
                platform_sku=item.platform_sku,
                item_name=item.item_name,
                quantity=item.quantity,
                unit_price=item.unit_price,
                line_total=round(item.quantity * item.unit_price, 2),
            )
        )
    db.commit()
    db.refresh(order)

    if config.auto_create_invoice and order.order_status != "cancelled":
        success, error = try_create_invoice_for_order(db, order)
        if not success:
            order.sync_error = error
            db.add(order)
            db.commit()
            db.refresh(order)

    return order


def trigger_mock_order(db: Session, tenant_id: str, current_user: User, platform: CommercePlatform, item_count: int = 2) -> CommerceOrder:
    from app.modules.commerce import config_service
    from app.modules.commerce.providers.mock_provider import MockProvider

    config = config_service.get_or_create_config(db, tenant_id, platform, current_user)
    provider = MockProvider(platform)
    provider_order = provider.generate_order(item_count)

    started_at = datetime.now(timezone.utc)
    order = ingest_order(db, tenant_id, config, provider_order)

    log = CommerceSyncLog(
        tenant_id=tenant_id,
        integration_config_id=config.id,
        platform=platform,
        sync_type="mock",
        status="success",
        orders_processed=1,
        orders_failed=0,
        started_at=started_at,
        completed_at=datetime.now(timezone.utc),
    )
    db.add(log)
    config.last_synced_at = datetime.now(timezone.utc)
    config.last_sync_status = "success"
    db.add(config)
    db.commit()

    return order


def list_orders(
    db: Session,
    tenant_id: str,
    platform: str | None = None,
    status: str | None = None,
    q: str | None = None,
    page: int = 1,
    page_size: int = 20,
) -> tuple[list[CommerceOrderListItemOut], int]:
    query = db.query(CommerceOrder).filter(CommerceOrder.tenant_id == tenant_id)
    if platform:
        query = query.filter(CommerceOrder.platform == platform)
    if status:
        query = query.filter(CommerceOrder.order_status == status)
    if q:
        pattern = f"%{q}%"
        query = query.filter(or_(CommerceOrder.platform_order_id.ilike(pattern), CommerceOrder.customer_name.ilike(pattern)))

    total = query.count()
    rows = query.order_by(CommerceOrder.order_time.desc()).offset((page - 1) * page_size).limit(page_size).all()
    items = [
        CommerceOrderListItemOut(
            id=o.id,
            platform=o.platform,
            platform_order_id=o.platform_order_id,
            order_status=o.order_status,
            order_time=o.order_time,
            customer_name=o.customer_name,
            total_amount=o.total_amount,
            invoice_id=o.invoice_id,
            sync_error=o.sync_error,
        )
        for o in rows
    ]
    return items, total


def get_order(db: Session, tenant_id: str, order_id: str) -> CommerceOrder | None:
    return db.query(CommerceOrder).filter(CommerceOrder.tenant_id == tenant_id, CommerceOrder.id == order_id).first()


def to_order_out(db: Session, order: CommerceOrder) -> CommerceOrderOut:
    invoice = db.get(Invoice, order.invoice_id) if order.invoice_id else None
    return CommerceOrderOut(
        id=order.id,
        tenant_id=order.tenant_id,
        platform=order.platform,
        platform_order_id=order.platform_order_id,
        order_status=order.order_status,
        raw_status=order.raw_status,
        order_time=order.order_time,
        customer_name=order.customer_name,
        customer_phone=order.customer_phone,
        subtotal=order.subtotal,
        platform_discount=order.platform_discount,
        platform_commission=order.platform_commission,
        packaging_charge=order.packaging_charge,
        tax_amount=order.tax_amount,
        total_amount=order.total_amount,
        payout_amount=order.payout_amount,
        invoice_id=order.invoice_id,
        invoice_number=invoice.invoice_number if invoice else None,
        sync_error=order.sync_error,
        created_at=order.created_at,
        items=[CommerceOrderItemOut.model_validate(i) for i in order.items],
    )


def retry_billing(db: Session, order: CommerceOrder) -> tuple[bool, str | None]:
    if order.invoice_id:
        return True, None
    return try_create_invoice_for_order(db, order)


# --- Product mapping ---


def list_unmapped_skus(db: Session, tenant_id: str) -> list[UnmappedSkuOut]:
    rows = (
        db.query(CommerceOrderItem.platform_sku, CommerceOrderItem.item_name, CommerceOrder.platform, func.count(CommerceOrderItem.id))
        .join(CommerceOrder, CommerceOrderItem.commerce_order_id == CommerceOrder.id)
        .filter(CommerceOrder.tenant_id == tenant_id, CommerceOrderItem.product_id.is_(None))
        .group_by(CommerceOrderItem.platform_sku, CommerceOrderItem.item_name, CommerceOrder.platform)
        .all()
    )
    return [UnmappedSkuOut(platform=platform, platform_sku=sku, item_name=name, order_count=count) for sku, name, platform, count in rows]


def list_mappings(db: Session, tenant_id: str) -> list[CommerceProductMapping]:
    return db.query(CommerceProductMapping).filter(CommerceProductMapping.tenant_id == tenant_id).order_by(CommerceProductMapping.created_at.desc()).all()


def create_mapping(db: Session, tenant_id: str, payload: CommerceProductMappingCreate) -> CommerceProductMapping:
    existing = (
        db.query(CommerceProductMapping)
        .filter(
            CommerceProductMapping.tenant_id == tenant_id,
            CommerceProductMapping.platform == payload.platform,
            CommerceProductMapping.platform_sku == payload.platform_sku,
        )
        .first()
    )
    if existing:
        existing.product_id = payload.product_id
        db.add(existing)
        mapping = existing
    else:
        mapping = CommerceProductMapping(
            tenant_id=tenant_id, platform=payload.platform, platform_sku=payload.platform_sku, product_id=payload.product_id
        )
        db.add(mapping)
    db.commit()
    db.refresh(mapping)

    # Backfill: apply this mapping retroactively to already-ingested unmapped order lines with
    # the same platform+SKU, so a late mapping doesn't strand earlier orders unbilled forever.
    (
        db.query(CommerceOrderItem)
        .filter(
            CommerceOrderItem.platform_sku == payload.platform_sku,
            CommerceOrderItem.product_id.is_(None),
            CommerceOrderItem.commerce_order_id.in_(
                db.query(CommerceOrder.id).filter(CommerceOrder.tenant_id == tenant_id, CommerceOrder.platform == payload.platform)
            ),
        )
        .update({CommerceOrderItem.product_id: payload.product_id}, synchronize_session=False)
    )
    db.commit()

    return mapping
