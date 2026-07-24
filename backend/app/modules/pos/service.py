from __future__ import annotations

from sqlalchemy.orm import Session

from app.models.catalog import Product
from app.models.held_bill import HeldBill
from app.models.user import User
from app.schemas.catalog import ProductOut
from app.schemas.pos import HeldBillCreate, HeldBillLineOut, HeldBillOut


class HeldBillError(Exception):
    def __init__(self, status_code: int, message: str) -> None:
        self.status_code = status_code
        self.message = message


def _to_held_bill_out(db: Session, held_bill: HeldBill) -> HeldBillOut:
    user = db.get(User, held_bill.created_by)
    lines: list[HeldBillLineOut] = []
    for raw_line in held_bill.lines:
        product = db.get(Product, raw_line["product_id"])
        if product is None:
            continue
        lines.append(
            HeldBillLineOut(
                product=ProductOut.model_validate(product),
                quantity=raw_line["quantity"],
                unit_price=raw_line.get("unit_price"),
            )
        )
    return HeldBillOut(
        id=held_bill.id,
        tenant_id=held_bill.tenant_id,
        customer_name=held_bill.customer_name,
        customer_phone=held_bill.customer_phone,
        discount_type=held_bill.discount_type,
        discount_value=held_bill.discount_value,
        tax_percentage=held_bill.tax_percentage,
        payment_method=held_bill.payment_method,
        notes=held_bill.notes,
        lines=lines,
        created_by=held_bill.created_by,
        created_by_name=f"{user.first_name} {user.last_name}" if user else "",
        created_at=held_bill.created_at,
    )


def create_held_bill(db: Session, tenant_id: str, current_user: User, payload: HeldBillCreate) -> HeldBillOut:
    for line in payload.lines:
        product = db.query(Product).filter(Product.tenant_id == tenant_id, Product.id == line.product_id).first()
        if not product:
            raise HeldBillError(404, f"Product {line.product_id} not found")

    held_bill = HeldBill(
        tenant_id=tenant_id,
        created_by=current_user.id,
        customer_name=payload.customer_name,
        customer_phone=payload.customer_phone,
        discount_type=payload.discount_type,
        discount_value=payload.discount_value,
        tax_percentage=payload.tax_percentage,
        payment_method=payload.payment_method,
        notes=payload.notes,
        lines=[
            {"product_id": line.product_id, "quantity": line.quantity, "unit_price": line.unit_price}
            for line in payload.lines
        ],
    )
    db.add(held_bill)
    db.commit()
    db.refresh(held_bill)
    return _to_held_bill_out(db, held_bill)


def list_held_bills(db: Session, tenant_id: str) -> list[HeldBillOut]:
    held_bills = (
        db.query(HeldBill).filter(HeldBill.tenant_id == tenant_id).order_by(HeldBill.created_at.desc()).all()
    )
    return [_to_held_bill_out(db, hb) for hb in held_bills]


def get_held_bill(db: Session, tenant_id: str, held_bill_id: str) -> HeldBillOut | None:
    held_bill = (
        db.query(HeldBill).filter(HeldBill.tenant_id == tenant_id, HeldBill.id == held_bill_id).first()
    )
    if not held_bill:
        return None
    return _to_held_bill_out(db, held_bill)


def delete_held_bill(db: Session, tenant_id: str, held_bill_id: str) -> bool:
    held_bill = (
        db.query(HeldBill).filter(HeldBill.tenant_id == tenant_id, HeldBill.id == held_bill_id).first()
    )
    if not held_bill:
        return False
    db.delete(held_bill)
    db.commit()
    return True
