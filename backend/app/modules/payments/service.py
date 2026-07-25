from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.activity import ACTION_PAYMENT_RECEIVED, MODULE_PAYMENT, log_activity
from app.core.notifications import TYPE_PAYMENT_RECEIVED, create_notification
from app.models.customer import Customer
from app.models.payment import CustomerLedgerAdjustment, Payment, PaymentAllocation
from app.models.returns import Return
from app.models.sales import Invoice
from app.models.user import User
from app.schemas.payment import (
    AgeingBucket,
    AgeingCustomerOut,
    AgeingInvoiceOut,
    AgeingReportOut,
    CreditSummaryOut,
    CustomerLedgerOut,
    LedgerAdjustmentCreate,
    LedgerEntryOut,
    OutstandingDashboardOut,
    PaymentCreate,
    TrendPoint,
)


class PaymentError(Exception):
    def __init__(self, status_code: int, message: str) -> None:
        self.status_code = status_code
        self.message = message


def _user_name(db: Session, user_id: str | None) -> str:
    if not user_id:
        return ""
    user = db.get(User, user_id)
    return f"{user.first_name} {user.last_name}" if user else ""


def _is_overdue(invoice: Invoice, today: date) -> bool:
    return invoice.payment_status in ("credit", "partially_paid") and invoice.due_date is not None and invoice.due_date < today


def _next_payment_number(db: Session, tenant_id: str) -> str:
    count = db.query(func.count(Payment.id)).filter(Payment.tenant_id == tenant_id).scalar() or 0
    year = datetime.now(timezone.utc).year
    return f"PMT-{year}-{count + 1:06d}"


def _to_payment_out(db: Session, payment: Payment) -> Payment:
    customer = db.get(Customer, payment.customer_id)
    payment.customer_name = customer.name if customer else ""  # type: ignore[attr-defined]
    payment.received_by_name = _user_name(db, payment.received_by)  # type: ignore[attr-defined]
    for allocation in payment.allocations:
        invoice = db.get(Invoice, allocation.invoice_id)
        allocation.invoice_number = invoice.invoice_number if invoice else ""  # type: ignore[attr-defined]
    return payment


def record_initial_payment(db: Session, tenant_id: str, invoice: Invoice, current_user: User, amount: float) -> None:
    """Records money collected at the moment of sale (POS checkout) as a real Payment +
    PaymentAllocation, so the customer's ledger reconciles the same way it does for money
    collected later via Receive Payment. A no-op for walk-in sales with no customer_id."""
    if amount <= 0 or not invoice.customer_id:
        return
    payment = Payment(
        tenant_id=tenant_id,
        customer_id=invoice.customer_id,
        payment_number=_next_payment_number(db, tenant_id),
        amount=round(amount, 2),
        payment_method=invoice.payment_method,
        notes=f"Collected at checkout for invoice {invoice.invoice_number}",
        received_by=current_user.id,
    )
    db.add(payment)
    db.flush()
    db.add(PaymentAllocation(payment_id=payment.id, invoice_id=invoice.id, amount=round(amount, 2)))


def list_outstanding_invoices(db: Session, tenant_id: str, customer_id: str) -> list[Invoice]:
    today = date.today()
    invoices = (
        db.query(Invoice)
        .filter(
            Invoice.tenant_id == tenant_id,
            Invoice.customer_id == customer_id,
            Invoice.outstanding_amount > 0,
            Invoice.status != "cancelled",
        )
        .order_by(Invoice.due_date.asc().nulls_last(), Invoice.created_at.asc())
        .all()
    )
    for invoice in invoices:
        invoice.is_overdue = _is_overdue(invoice, today)  # type: ignore[attr-defined]
    return invoices


def create_payment(db: Session, tenant_id: str, current_user: User, payload: PaymentCreate) -> Payment:
    customer = db.query(Customer).filter(Customer.tenant_id == tenant_id, Customer.id == payload.customer_id).first()
    if not customer:
        raise PaymentError(404, "Customer not found")

    alloc_pairs: list[tuple[Invoice, float]] = []

    if payload.allocations:
        total_alloc = round(sum(a.amount for a in payload.allocations), 2)
        if total_alloc != round(payload.amount, 2):
            raise PaymentError(400, "Allocated amounts must add up to the payment amount")
        for allocation in payload.allocations:
            invoice = (
                db.query(Invoice)
                .filter(Invoice.tenant_id == tenant_id, Invoice.id == allocation.invoice_id, Invoice.customer_id == payload.customer_id)
                .first()
            )
            if not invoice:
                raise PaymentError(404, f"Invoice {allocation.invoice_id} not found for this customer")
            if allocation.amount > invoice.outstanding_amount + 0.01:
                raise PaymentError(
                    400, f"Cannot allocate more than the outstanding {invoice.outstanding_amount:.2f} on invoice {invoice.invoice_number}"
                )
            alloc_pairs.append((invoice, round(allocation.amount, 2)))
    else:
        outstanding_invoices = (
            db.query(Invoice)
            .filter(
                Invoice.tenant_id == tenant_id,
                Invoice.customer_id == payload.customer_id,
                Invoice.outstanding_amount > 0,
                Invoice.status != "cancelled",
            )
            .order_by(Invoice.due_date.asc().nulls_last(), Invoice.created_at.asc())
            .all()
        )
        remaining = round(payload.amount, 2)
        for invoice in outstanding_invoices:
            if remaining <= 0:
                break
            apply_amount = round(min(remaining, invoice.outstanding_amount), 2)
            if apply_amount <= 0:
                continue
            alloc_pairs.append((invoice, apply_amount))
            remaining -= apply_amount

        if not alloc_pairs:
            raise PaymentError(400, f"'{customer.name}' has no outstanding invoices to apply this payment to")
        if remaining > 0.01:
            raise PaymentError(400, f"Amount exceeds '{customer.name}'s total outstanding by {remaining:.2f}")

    payment = Payment(
        tenant_id=tenant_id,
        customer_id=payload.customer_id,
        payment_number=_next_payment_number(db, tenant_id),
        amount=payload.amount,
        payment_method=payload.payment_method,
        reference_number=payload.reference_number,
        notes=payload.notes,
        received_by=current_user.id,
    )
    db.add(payment)
    db.flush()

    for invoice, amount in alloc_pairs:
        db.add(PaymentAllocation(payment_id=payment.id, invoice_id=invoice.id, amount=amount))
        invoice.paid_amount = round(invoice.paid_amount + amount, 2)
        invoice.outstanding_amount = round(invoice.outstanding_amount - amount, 2)
        if invoice.outstanding_amount <= 0.01:
            invoice.outstanding_amount = 0.0
            invoice.payment_status = "paid"
        else:
            invoice.payment_status = "partially_paid"
        db.add(invoice)

    log_activity(
        db,
        tenant_id=tenant_id,
        user_id=current_user.id,
        module=MODULE_PAYMENT,
        action=ACTION_PAYMENT_RECEIVED,
        description=f"Received payment {payment.payment_number} ({payload.amount:.2f}) from '{customer.name}'",
        entity_type="Payment",
        entity_id=payment.id,
    )
    create_notification(
        db,
        tenant_id=tenant_id,
        type=TYPE_PAYMENT_RECEIVED,
        title="Payment received",
        message=f"Received {payload.amount:.2f} from '{customer.name}' ({payment.payment_number}).",
        entity_type="Payment",
        entity_id=payment.id,
    )

    db.commit()
    db.refresh(payment)
    return _to_payment_out(db, payment)


def list_payments(
    db: Session,
    tenant_id: str,
    page: int = 1,
    page_size: int = 20,
    customer_id: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
) -> tuple[list[Payment], int]:
    query = db.query(Payment).filter(Payment.tenant_id == tenant_id)
    if customer_id:
        query = query.filter(Payment.customer_id == customer_id)
    if date_from:
        query = query.filter(Payment.created_at >= datetime.combine(date_from, time.min, tzinfo=timezone.utc))
    if date_to:
        query = query.filter(Payment.created_at <= datetime.combine(date_to, time.max, tzinfo=timezone.utc))

    total = query.with_entities(func.count(Payment.id)).scalar() or 0
    items = query.order_by(Payment.created_at.desc()).offset((page - 1) * page_size).limit(page_size).all()
    return [_to_payment_out(db, p) for p in items], total


def get_customer_ledger(db: Session, tenant_id: str, customer_id: str) -> CustomerLedgerOut:
    customer = db.query(Customer).filter(Customer.tenant_id == tenant_id, Customer.id == customer_id).first()
    if not customer:
        raise PaymentError(404, "Customer not found")

    raw_entries: list[dict] = []

    invoices = (
        db.query(Invoice)
        .filter(Invoice.tenant_id == tenant_id, Invoice.customer_id == customer_id, Invoice.status != "cancelled")
        .all()
    )
    for inv in invoices:
        raw_entries.append(
            {
                "date": inv.created_at,
                "type": "invoice",
                "reference": inv.invoice_number,
                "description": f"Invoice {inv.invoice_number}",
                "debit": inv.total_amount,
                "credit": 0.0,
            }
        )

    payments = db.query(Payment).filter(Payment.tenant_id == tenant_id, Payment.customer_id == customer_id).all()
    for p in payments:
        raw_entries.append(
            {
                "date": p.created_at,
                "type": "payment",
                "reference": p.payment_number,
                "description": f"Payment received ({p.payment_method})",
                "debit": 0.0,
                "credit": p.amount,
            }
        )

    returns = (
        db.query(Return)
        .join(Invoice, Invoice.id == Return.invoice_id)
        .filter(Invoice.tenant_id == tenant_id, Invoice.customer_id == customer_id, Return.status != "cancelled")
        .all()
    )
    for r in returns:
        raw_entries.append(
            {
                "date": r.created_at,
                "type": "return",
                "reference": r.return_number,
                "description": "Return processed",
                "debit": 0.0,
                "credit": r.refund_amount,
            }
        )

    adjustments = (
        db.query(CustomerLedgerAdjustment)
        .filter(CustomerLedgerAdjustment.tenant_id == tenant_id, CustomerLedgerAdjustment.customer_id == customer_id)
        .all()
    )
    for adj in adjustments:
        raw_entries.append(
            {
                "date": adj.created_at,
                "type": "adjustment",
                "reference": "Adjustment",
                "description": adj.reason,
                "debit": max(adj.amount, 0.0),
                "credit": max(-adj.amount, 0.0),
            }
        )

    raw_entries.sort(key=lambda e: e["date"])
    balance = 0.0
    entries: list[LedgerEntryOut] = []
    for e in raw_entries:
        balance = round(balance + e["debit"] - e["credit"], 2)
        entries.append(LedgerEntryOut(balance=balance, **e))

    return CustomerLedgerOut(
        customer_id=customer.id,
        customer_name=customer.name,
        opening_balance=0.0,
        closing_balance=balance,
        entries=entries,
    )


def create_ledger_adjustment(
    db: Session, tenant_id: str, customer: Customer, current_user: User, payload: LedgerAdjustmentCreate
) -> CustomerLedgerOut:
    db.add(
        CustomerLedgerAdjustment(
            tenant_id=tenant_id,
            customer_id=customer.id,
            amount=payload.amount,
            reason=payload.reason,
            created_by=current_user.id,
        )
    )
    db.commit()
    return get_customer_ledger(db, tenant_id, customer.id)


def _average_payment_days(db: Session, tenant_id: str, customer_id: str | None) -> float | None:
    query = db.query(Invoice).filter(Invoice.tenant_id == tenant_id, Invoice.payment_status == "paid", Invoice.due_date.isnot(None))
    if customer_id:
        query = query.filter(Invoice.customer_id == customer_id)

    days_list: list[int] = []
    for inv in query.all():
        last_alloc_date = (
            db.query(func.max(Payment.created_at))
            .join(PaymentAllocation, PaymentAllocation.payment_id == Payment.id)
            .filter(PaymentAllocation.invoice_id == inv.id)
            .scalar()
        )
        if last_alloc_date:
            days_list.append((last_alloc_date.date() - inv.created_at.date()).days)

    if not days_list:
        return None
    return round(sum(days_list) / len(days_list), 1)


def _outstanding_trend(db: Session, tenant_id: str, customer_id: str | None, days: int = 30) -> list[TrendPoint]:
    today = date.today()
    start = today - timedelta(days=days - 1)

    query = db.query(Invoice).filter(Invoice.tenant_id == tenant_id, Invoice.status != "cancelled")
    if customer_id:
        query = query.filter(Invoice.customer_id == customer_id)
    invoices = [inv for inv in query.all() if inv.created_at.date() <= today]

    alloc_query = (
        db.query(PaymentAllocation.invoice_id, Payment.created_at, PaymentAllocation.amount)
        .join(Payment, Payment.id == PaymentAllocation.payment_id)
        .filter(Payment.tenant_id == tenant_id)
    )
    alloc_by_invoice: dict[str, list[tuple[date, float]]] = {}
    for invoice_id, paid_at, amount in alloc_query.all():
        alloc_by_invoice.setdefault(invoice_id, []).append((paid_at.date(), amount))

    points: list[TrendPoint] = []
    for i in range(days):
        day = start + timedelta(days=i)
        total = 0.0
        for inv in invoices:
            if inv.created_at.date() > day:
                continue
            paid_by_day = sum(amt for d, amt in alloc_by_invoice.get(inv.id, []) if d <= day)
            total += max(0.0, inv.total_amount - paid_by_day)
        points.append(TrendPoint(date=day, amount=round(total, 2)))
    return points


def _collection_trend(db: Session, tenant_id: str, days: int = 30) -> list[TrendPoint]:
    today = date.today()
    start = today - timedelta(days=days - 1)
    start_dt = datetime.combine(start, time.min, tzinfo=timezone.utc)
    rows = db.query(Payment.created_at, Payment.amount).filter(Payment.tenant_id == tenant_id, Payment.created_at >= start_dt).all()

    daily: dict[date, float] = {start + timedelta(days=i): 0.0 for i in range(days)}
    for created_at, amount in rows:
        d = created_at.date()
        if d in daily:
            daily[d] += amount
    return [TrendPoint(date=d, amount=round(v, 2)) for d, v in sorted(daily.items())]


def get_credit_summary(db: Session, tenant_id: str, customer_id: str) -> CreditSummaryOut:
    customer = db.query(Customer).filter(Customer.tenant_id == tenant_id, Customer.id == customer_id).first()
    if not customer:
        raise PaymentError(404, "Customer not found")

    today = date.today()
    invoices = (
        db.query(Invoice)
        .filter(Invoice.tenant_id == tenant_id, Invoice.customer_id == customer_id, Invoice.outstanding_amount > 0, Invoice.status != "cancelled")
        .all()
    )
    current_outstanding = round(sum(i.outstanding_amount for i in invoices), 2)
    overdue = [i for i in invoices if i.due_date and i.due_date < today]
    total_overdue_amount = round(sum(i.outstanding_amount for i in overdue), 2)

    last_payment_date = (
        db.query(func.max(Payment.created_at)).filter(Payment.tenant_id == tenant_id, Payment.customer_id == customer_id).scalar()
    )

    return CreditSummaryOut(
        current_outstanding=current_outstanding,
        total_outstanding_invoices=len(invoices),
        total_overdue_amount=total_overdue_amount,
        total_overdue_invoices=len(overdue),
        last_payment_date=last_payment_date,
        average_payment_days=_average_payment_days(db, tenant_id, customer_id),
        outstanding_trend=_outstanding_trend(db, tenant_id, customer_id, 30),
    )


def _bucket_for(due_date: date | None, today: date) -> AgeingBucket:
    if due_date is None or due_date >= today:
        return "current"
    days_overdue = (today - due_date).days
    if days_overdue <= 30:
        return "1-30"
    if days_overdue <= 60:
        return "31-60"
    if days_overdue <= 90:
        return "61-90"
    return "90+"


def get_outstanding_dashboard(db: Session, tenant_id: str) -> OutstandingDashboardOut:
    today = date.today()
    week_end = today + timedelta(days=7)

    outstanding_invoices = (
        db.query(Invoice).filter(Invoice.tenant_id == tenant_id, Invoice.status != "cancelled", Invoice.outstanding_amount > 0).all()
    )
    total_outstanding = round(sum(i.outstanding_amount for i in outstanding_invoices), 2)
    overdue_invoices = [i for i in outstanding_invoices if i.due_date and i.due_date < today]
    total_overdue = round(sum(i.outstanding_amount for i in overdue_invoices), 2)
    due_today = sum(1 for i in outstanding_invoices if i.due_date == today)
    due_this_week = sum(1 for i in outstanding_invoices if i.due_date and today <= i.due_date <= week_end)
    overdue_customers = len({i.customer_id for i in overdue_invoices if i.customer_id})
    customers_on_credit = len({i.customer_id for i in outstanding_invoices if i.customer_id})

    today_start_dt = datetime.combine(today, time.min, tzinfo=timezone.utc)
    today_collections = (
        db.query(func.coalesce(func.sum(Payment.amount), 0.0))
        .filter(Payment.tenant_id == tenant_id, Payment.created_at >= today_start_dt)
        .scalar()
        or 0.0
    )

    ageing_distribution: dict[str, float] = {"current": 0.0, "1-30": 0.0, "31-60": 0.0, "61-90": 0.0, "90+": 0.0}
    for inv in outstanding_invoices:
        ageing_distribution[_bucket_for(inv.due_date, today)] += inv.outstanding_amount
    ageing_distribution = {k: round(v, 2) for k, v in ageing_distribution.items()}

    return OutstandingDashboardOut(
        total_outstanding=total_outstanding,
        total_overdue=total_overdue,
        today_collections=round(float(today_collections), 2),
        due_today=due_today,
        due_this_week=due_this_week,
        overdue_customers=overdue_customers,
        customers_on_credit=customers_on_credit,
        average_collection_days=_average_payment_days(db, tenant_id, None),
        outstanding_trend=_outstanding_trend(db, tenant_id, None, 30),
        collection_trend=_collection_trend(db, tenant_id, 30),
        ageing_distribution=ageing_distribution,  # type: ignore[arg-type]
    )


def get_ageing_report(db: Session, tenant_id: str) -> AgeingReportOut:
    today = date.today()
    invoices = (
        db.query(Invoice).filter(Invoice.tenant_id == tenant_id, Invoice.status != "cancelled", Invoice.outstanding_amount > 0).all()
    )

    invoice_rows: list[AgeingInvoiceOut] = []
    by_customer: dict[str, dict] = {}
    bucket_field = {"current": "current", "1-30": "bucket_1_30", "31-60": "bucket_31_60", "61-90": "bucket_61_90", "90+": "bucket_90_plus"}

    for inv in invoices:
        bucket = _bucket_for(inv.due_date, today)
        days_overdue = max(0, (today - inv.due_date).days) if inv.due_date else 0
        invoice_rows.append(
            AgeingInvoiceOut(
                invoice_id=inv.id,
                invoice_number=inv.invoice_number,
                customer_id=inv.customer_id,
                customer_name=inv.customer_name,
                due_date=inv.due_date,
                outstanding_amount=inv.outstanding_amount,
                days_overdue=days_overdue,
                bucket=bucket,
            )
        )
        if inv.customer_id:
            entry = by_customer.setdefault(
                inv.customer_id,
                {
                    "customer_id": inv.customer_id,
                    "customer_name": inv.customer_name or "",
                    "current": 0.0,
                    "bucket_1_30": 0.0,
                    "bucket_31_60": 0.0,
                    "bucket_61_90": 0.0,
                    "bucket_90_plus": 0.0,
                },
            )
            entry[bucket_field[bucket]] += inv.outstanding_amount

    by_customer_list = []
    for entry in by_customer.values():
        total = entry["current"] + entry["bucket_1_30"] + entry["bucket_31_60"] + entry["bucket_61_90"] + entry["bucket_90_plus"]
        by_customer_list.append(AgeingCustomerOut(**entry, total_outstanding=round(total, 2)))

    return AgeingReportOut(invoices=invoice_rows, by_customer=by_customer_list)
