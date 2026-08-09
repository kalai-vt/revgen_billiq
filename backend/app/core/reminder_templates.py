"""Trial reminder message templates (PHASE 16 of the trial/subscription spec) — one per channel,
each with the exact copy the spec specifies, using {{variable}} placeholders. Kept as code
(mirroring app/core/feature_catalog.py's "platform-defined, not a DB table" reasoning) since these
are the only three reminder templates the product defines today; if per-tenant custom template
editing is ever needed, that's a bigger follow-up, not a variant of this.

Never interpolate internal ids (tenant_id, plan_id, etc.) into a customer-facing message — only
the six variables below, all of which are already customer-facing concepts.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from app.core.plans import get_plan

TEMPLATE_VARIABLES = (
    "customer_name",
    "business_name",
    "trial_end_date",
    "days_remaining",
    "plan_name",
    "admin_contact",
)


@dataclass
class ReminderContext:
    customer_name: str
    business_name: str
    trial_end_date: datetime
    days_remaining: int
    plan_name: str = ""
    admin_contact: str = ""

    def variables(self) -> dict[str, str]:
        return {
            "customer_name": self.customer_name,
            "business_name": self.business_name,
            "trial_end_date": self.trial_end_date.strftime("%d %b %Y"),
            "days_remaining": str(max(self.days_remaining, 0)),
            "plan_name": self.plan_name,
            "admin_contact": self.admin_contact,
        }


def _render(template: str, context: ReminderContext) -> str:
    rendered = template
    for key, value in context.variables().items():
        rendered = rendered.replace("{{" + key + "}}", value)
    return rendered


_EMAIL_SUBJECT = "Your BillIQ trial ends in {{days_remaining}} days"
_EMAIL_BODY = """Hi {{customer_name}},

Thank you for trying BillIQ.

Your 14-day free trial will end on {{trial_end_date}}.

You currently have {{days_remaining}} day(s) remaining.

To continue using BillIQ without interruption, please choose a subscription plan:

Basic
Advanced
Custom

Please contact our team to activate your subscription.

Thank you,
BillIQ Team"""

_SMS_BODY = (
    "Hi {{customer_name}}, your BillIQ free trial ends on {{trial_end_date}}. "
    "You have {{days_remaining}} day(s) remaining. Subscribe to continue using BillIQ. "
    "Contact our team for activation. - BillIQ Team"
)

_WHATSAPP_BODY = """Hi {{customer_name}} \U0001f44b

Your BillIQ 14-day free trial is ending soon.

\U0001f4c5 Trial ends: {{trial_end_date}}
⏳ Remaining: {{days_remaining}} day(s)

Choose the plan that works best for your business:

\U0001f539 Basic
\U0001f539 Advanced
\U0001f539 Custom

Reply to this message or contact our team to activate your subscription.

Thank you,
BillIQ Team"""


def render_email(context: ReminderContext) -> tuple[str, str]:
    """Returns (subject, body)."""
    return _render(_EMAIL_SUBJECT, context), _render(_EMAIL_BODY, context)


def render_sms(context: ReminderContext) -> str:
    return _render(_SMS_BODY, context)


def render_whatsapp(context: ReminderContext) -> str:
    return _render(_WHATSAPP_BODY, context)


def build_context(
    *,
    customer_name: str,
    business_name: str,
    trial_end_date: datetime,
    days_remaining: int,
    plan: str | None = None,
    admin_contact: str = "",
) -> ReminderContext:
    plan_name = get_plan(plan)["label"] if plan else ""
    return ReminderContext(
        customer_name=customer_name,
        business_name=business_name,
        trial_end_date=trial_end_date,
        days_remaining=days_remaining,
        plan_name=plan_name,
        admin_contact=admin_contact,
    )
