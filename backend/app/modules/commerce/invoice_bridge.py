from __future__ import annotations

from sqlalchemy.orm import Session

from app.models.commerce import CommerceOrder
from app.models.user import User
from app.modules.sales.service import SalesError, create_invoice
from app.schemas.sales import InvoiceCreate, InvoiceLineCreate


def _get_billing_user(db: Session, tenant_id: str) -> User | None:
    # Commerce orders arrive with no human operator present, so they're billed under the
    # tenant's owner account rather than a dedicated synthetic "system" user — that would need
    # new columns/auth infrastructure on the shared Users table, which is out of scope for this
    # phase. Known trade-off: the activity log shows the owner as having billed these orders.
    return db.query(User).filter(User.tenant_id == tenant_id, User.role == "owner").order_by(User.created_at.asc()).first()


def try_create_invoice_for_order(db: Session, order: CommerceOrder) -> tuple[bool, str | None]:
    """Maps a CommerceOrder onto the same checkout path POS billing uses, so tax/discount/stock
    handling stays identical between walk-in and online sales. Every line's platform SKU must
    already resolve to a real product_id (via CommerceProductMapping) — unmapped lines block
    auto-billing until resolved."""
    unmapped = [item for item in order.items if item.product_id is None]
    if unmapped:
        return False, f"{len(unmapped)} item(s) need a product mapping before this order can be billed"

    billing_user = _get_billing_user(db, order.tenant_id)
    if billing_user is None:
        return False, "No owner account found to bill this order under"

    payload = InvoiceCreate(
        customer_name=order.customer_name,
        customer_phone=order.customer_phone,
        lines=[
            InvoiceLineCreate(product_id=item.product_id, quantity=item.quantity, unit_price=item.unit_price)
            for item in order.items
        ],
        payment_method="upi",
        payment_type="paid",
    )
    try:
        invoice = create_invoice(db, order.tenant_id, billing_user, payload)
    except SalesError as exc:
        return False, exc.message
    except Exception as exc:  # defensive — a billing failure shouldn't take down order ingestion
        return False, str(exc)

    order.invoice_id = invoice.id
    order.sync_error = None
    db.add(order)
    db.commit()
    return True, None
