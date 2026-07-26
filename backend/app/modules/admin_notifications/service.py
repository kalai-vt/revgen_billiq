from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.sales import Invoice
from app.models.tenant import Tenant
from app.models_admin.notification import AdminNotification, AdminNotificationRead
from app.modules.admin_usage.service import list_usage_analytics

USAGE_RISK_THRESHOLD_PCT = 90.0
OUTSTANDING_THRESHOLD = 10000.0


def _upsert(admin_db: Session, *, dedup_key: str, type_: str, severity: str, title: str, message: str, tenant_id: str | None) -> None:
    exists = admin_db.query(AdminNotification).filter(AdminNotification.dedup_key == dedup_key).first()
    if exists:
        return
    admin_db.add(
        AdminNotification(
            dedup_key=dedup_key,
            type=type_,
            severity=severity,
            title=title,
            message=message,
            tenant_id=tenant_id,
        )
    )


def generate_system_notifications(db: Session, admin_db: Session) -> None:
    now = datetime.now(timezone.utc)

    recent_signups = db.query(Tenant).filter(
        Tenant.is_deleted.is_(False), Tenant.created_at >= now - timedelta(hours=24)
    ).all()
    for tenant in recent_signups:
        _upsert(
            admin_db,
            dedup_key=f"signup:{tenant.id}",
            type_="new_signup",
            severity="info",
            title="New customer signed up",
            message=f"{tenant.company_name} joined RevGen BillIQ.",
            tenant_id=tenant.id,
        )

    suspended = db.query(Tenant).filter(Tenant.is_deleted.is_(False), Tenant.status == "suspended").all()
    for tenant in suspended:
        _upsert(
            admin_db,
            dedup_key=f"suspended:{tenant.id}",
            type_="tenant_suspended",
            severity="warning",
            title="Customer suspended",
            message=f"{tenant.company_name} is currently suspended.",
            tenant_id=tenant.id,
        )

    for row in list_usage_analytics(db, only_at_risk=False):
        if row["max_pct_used"] is not None and row["max_pct_used"] >= USAGE_RISK_THRESHOLD_PCT:
            _upsert(
                admin_db,
                dedup_key=f"usage_risk:{row['tenant_id']}",
                type_="usage_risk",
                severity="warning",
                title="Customer nearing plan limit",
                message=f"{row['company_name']} is at {row['max_pct_used']}% of a plan limit.",
                tenant_id=row["tenant_id"],
            )

    outstanding_rows = (
        db.query(Invoice.tenant_id, Tenant.company_name, func.sum(Invoice.outstanding_amount))
        .join(Tenant, Tenant.id == Invoice.tenant_id)
        .group_by(Invoice.tenant_id, Tenant.company_name)
        .having(func.sum(Invoice.outstanding_amount) > OUTSTANDING_THRESHOLD)
        .all()
    )
    for tenant_id, company_name, total_outstanding in outstanding_rows:
        _upsert(
            admin_db,
            dedup_key=f"outstanding:{tenant_id}",
            type_="high_outstanding",
            severity="critical",
            title="High outstanding balance",
            message=f"{company_name} has an outstanding balance of {round(total_outstanding, 2)}.",
            tenant_id=tenant_id,
        )

    admin_db.commit()


def list_notifications(admin_db: Session, admin_user_id: str, limit: int = 30) -> list[dict[str, Any]]:
    read_ids = {
        row[0]
        for row in admin_db.query(AdminNotificationRead.notification_id)
        .filter(AdminNotificationRead.admin_user_id == admin_user_id)
        .all()
    }
    notifications = admin_db.query(AdminNotification).order_by(AdminNotification.created_at.desc()).limit(limit).all()
    return [
        {
            "id": n.id,
            "type": n.type,
            "severity": n.severity,
            "title": n.title,
            "message": n.message,
            "tenant_id": n.tenant_id,
            "created_at": n.created_at,
            "is_read": n.id in read_ids,
        }
        for n in notifications
    ]


def unread_count(admin_db: Session, admin_user_id: str) -> int:
    read_ids = {
        row[0]
        for row in admin_db.query(AdminNotificationRead.notification_id)
        .filter(AdminNotificationRead.admin_user_id == admin_user_id)
        .all()
    }
    total = admin_db.query(func.count(AdminNotification.id)).scalar() or 0
    return max(total - len(read_ids), 0)


def mark_read(admin_db: Session, notification_id: str, admin_user_id: str) -> None:
    exists = (
        admin_db.query(AdminNotificationRead)
        .filter(
            AdminNotificationRead.notification_id == notification_id,
            AdminNotificationRead.admin_user_id == admin_user_id,
        )
        .first()
    )
    if exists:
        return
    admin_db.add(AdminNotificationRead(notification_id=notification_id, admin_user_id=admin_user_id))
    admin_db.commit()


def mark_all_read(admin_db: Session, admin_user_id: str) -> None:
    read_ids = {
        row[0]
        for row in admin_db.query(AdminNotificationRead.notification_id)
        .filter(AdminNotificationRead.admin_user_id == admin_user_id)
        .all()
    }
    all_ids = [row[0] for row in admin_db.query(AdminNotification.id).all()]
    for notification_id in all_ids:
        if notification_id not in read_ids:
            admin_db.add(AdminNotificationRead(notification_id=notification_id, admin_user_id=admin_user_id))
    admin_db.commit()
