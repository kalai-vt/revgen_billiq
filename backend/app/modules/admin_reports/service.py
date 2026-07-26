from __future__ import annotations

import csv
import io

from sqlalchemy.orm import Session

from app.modules.admin_customers.service import list_customers
from app.modules.admin_payments.service import list_payments
from app.modules.admin_subscriptions.service import list_subscriptions


def _to_csv(rows: list[dict], columns: list[str]) -> str:
    buffer = io.StringIO()
    writer = csv.DictWriter(buffer, fieldnames=columns, extrasaction="ignore")
    writer.writeheader()
    for row in rows:
        writer.writerow(row)
    return buffer.getvalue()


def customers_csv(db: Session) -> str:
    rows = list_customers(db)
    columns = ["tenant_id", "company_name", "owner_name", "owner_email", "plan", "status", "total_invoices", "total_users", "created_at"]
    return _to_csv(rows, columns)


def revenue_csv(db: Session) -> str:
    rows = list_subscriptions(db)
    columns = ["tenant_id", "company_name", "plan", "price_inr", "subscription_status", "trial_ends_at", "created_at"]
    return _to_csv(rows, columns)


def payments_csv(db: Session) -> str:
    result = list_payments(db, limit=10000, offset=0)
    columns = ["id", "tenant_id", "company_name", "customer_name", "payment_number", "amount", "payment_method", "reference_number", "created_at"]
    return _to_csv(result["items"], columns)
