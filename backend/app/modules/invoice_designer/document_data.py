from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime

from sqlalchemy.orm import Session

from app.core.formatting import format_amount
from app.models.customer import Customer
from app.models.returns import Return, ReturnItem
from app.models.sales import Invoice, InvoiceItem
from app.models.user import User
from app.modules.invoice_designer.amount_words import amount_in_words_inr

# Fields the current data model doesn't track yet (HSN/SAC, batch, expiry, serial, MRP,
# per-line discount, loyalty number, membership, company name, counter, order number). Enabling
# these columns/fields in the designer is honored visually, but they render as an em dash until
# product/customer records actually capture that data — this is a known Phase 1 gap, not a bug.
_NOT_TRACKED = "—"

# "row_number" is deliberately absent — it's positional (1, 2, 3, ...) and filled in by the
# renderer from each item's index, not stored per line.
ITEM_COLUMN_KEYS = (
    "product", "sku", "barcode", "hsn_sac", "batch", "expiry", "serial",
    "description", "qty", "unit", "mrp", "selling_price", "discount", "tax", "amount",
)


@dataclass
class DocumentLineItem:
    values: dict[str, str]


@dataclass
class DocumentData:
    document_type: str
    label: str
    number: str
    created_at: datetime
    due_date: date | None = None
    cashier: str | None = None
    counter: str | None = None
    order_number: str | None = None
    customer_id: str | None = None
    payment_method: str | None = None
    payment_status: str | None = None
    invoice_status: str | None = None
    customer_name: str | None = None
    customer_mobile: str | None = None
    customer_email: str | None = None
    customer_address: str | None = None
    customer_gstin: str | None = None
    customer_loyalty_number: str | None = None
    customer_membership: str | None = None
    customer_company_name: str | None = None
    items: list[DocumentLineItem] = field(default_factory=list)
    totals: dict[str, float] = field(default_factory=dict)
    amount_in_words: str = ""


def _cashier_name(db: Session, user_id: str) -> str | None:
    user = db.get(User, user_id)
    if not user:
        return None
    return f"{user.first_name} {user.last_name}".strip()


def _invoice_item_value(item: InvoiceItem, key: str, decimal_precision: int) -> str:
    if key in ("sku", "barcode"):
        return item.identifier_value
    if key in ("product", "description"):
        return item.product_name
    if key == "qty":
        return f"{item.quantity:g}"
    if key == "unit":
        return "pc"
    if key == "selling_price":
        return format_amount(item.unit_price, decimal_precision)
    if key == "tax":
        return format_amount(item.tax_amount, decimal_precision)
    if key == "amount":
        return format_amount(item.line_total, decimal_precision)
    return _NOT_TRACKED


def build_invoice_data(invoice: Invoice, db: Session, decimal_precision: int = 2) -> DocumentData:
    customer = db.get(Customer, invoice.customer_id) if invoice.customer_id else None

    return DocumentData(
        document_type="tax_invoice",
        label="Tax Invoice",
        number=invoice.invoice_number,
        created_at=invoice.created_at,
        due_date=invoice.due_date,
        cashier=_cashier_name(db, invoice.created_by),
        payment_method=invoice.payment_method.upper(),
        payment_status=invoice.payment_status.replace("_", " ").title(),
        invoice_status=invoice.status.replace("_", " ").title(),
        customer_id=invoice.customer_id,
        customer_name=invoice.customer_name,
        customer_mobile=invoice.customer_phone,
        customer_email=customer.email if customer else None,
        customer_address=customer.address if customer else None,
        customer_gstin=invoice.gst_number,
        items=[
            DocumentLineItem(values={key: _invoice_item_value(item, key, decimal_precision) for key in ITEM_COLUMN_KEYS})
            for item in invoice.items
        ],
        totals={
            # No CGST/SGST/IGST split is tracked at the DB level (only a single tax_amount) —
            # CGST/SGST assume the common intra-state 50/50 split, IGST shows the full amount;
            # these are independent derivations of the same tax_amount; enabling more than one
            # group is a tenant configuration choice, not a double-charge (grand_total is always
            # invoice.total_amount regardless of which breakdown rows are shown).
            "subtotal": invoice.subtotal,
            "discount": invoice.discount_amount,
            "cgst": invoice.tax_amount / 2,
            "sgst": invoice.tax_amount / 2,
            "igst": invoice.tax_amount,
            "cess": 0.0,
            "round_off": 0.0,
            "shipping": 0.0,
            "packing": 0.0,
            "grand_total": invoice.total_amount,
            "paid": invoice.paid_amount,
            "outstanding": invoice.outstanding_amount,
            "balance": invoice.outstanding_amount,
        },
        amount_in_words=amount_in_words_inr(invoice.total_amount),
    )


def _return_item_value(item: ReturnItem, key: str, decimal_precision: int) -> str:
    if key in ("sku", "barcode"):
        return item.identifier_value
    if key in ("product", "description"):
        return item.product_name
    if key == "qty":
        return f"{item.quantity_returned:g}"
    if key == "unit":
        return "pc"
    if key == "selling_price":
        return format_amount(item.unit_price, decimal_precision)
    if key == "discount":
        return item.reason.replace("_", " ").title()
    if key == "amount":
        return format_amount(item.line_refund_amount, decimal_precision)
    return _NOT_TRACKED


_RETURN_STATUS_LABELS = {"fully_refunded": "Fully Refunded", "partially_refunded": "Partially Refunded", "cancelled": "Cancelled"}


def build_return_data(ret: Return, invoice: Invoice, db: Session, decimal_precision: int = 2) -> DocumentData:
    customer = db.get(Customer, invoice.customer_id) if invoice.customer_id else None

    return DocumentData(
        document_type="credit_note",
        label=f"Return Receipt (Against Invoice {invoice.invoice_number})",
        number=ret.return_number,
        created_at=ret.created_at,
        cashier=_cashier_name(db, ret.created_by),
        payment_method=ret.refund_method.upper(),
        invoice_status=_RETURN_STATUS_LABELS.get(ret.status, ret.status),
        customer_id=invoice.customer_id,
        customer_name=invoice.customer_name,
        customer_mobile=invoice.customer_phone,
        customer_email=customer.email if customer else None,
        customer_address=customer.address if customer else None,
        customer_gstin=invoice.gst_number,
        items=[
            DocumentLineItem(values={key: _return_item_value(item, key, decimal_precision) for key in ITEM_COLUMN_KEYS})
            for item in ret.items
        ],
        totals={
            "subtotal": ret.subtotal_amount,
            "discount": ret.discount_adjustment,
            "cgst": ret.tax_adjustment / 2,
            "sgst": ret.tax_adjustment / 2,
            "igst": ret.tax_adjustment,
            "cess": 0.0,
            "round_off": ret.round_off,
            "shipping": 0.0,
            "packing": 0.0,
            "grand_total": ret.refund_amount,
            "paid": ret.refund_amount,
            "outstanding": 0.0,
            "balance": 0.0,
        },
        amount_in_words=amount_in_words_inr(ret.refund_amount),
    )
