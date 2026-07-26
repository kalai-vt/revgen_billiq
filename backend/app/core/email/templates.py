from __future__ import annotations

from app.core.config import settings

_APP_NAME = "RevGen BillIQ"

_LAYOUT = """\
<!doctype html>
<html>
  <body style="margin:0;padding:0;background-color:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:8px;overflow:hidden;">
            <tr>
              <td style="background-color:#111827;padding:20px 32px;">
                <span style="color:#ffffff;font-size:18px;font-weight:bold;">{app_name}</span>
              </td>
            </tr>
            <tr>
              <td style="padding:32px;color:#1f2937;font-size:15px;line-height:1.6;">
                <h1 style="font-size:20px;margin:0 0 16px 0;color:#111827;">{heading}</h1>
                <p style="margin:0 0 16px 0;">{greeting}</p>
                <p style="margin:0 0 24px 0;">{body}</p>
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="border-radius:6px;background-color:#111827;">
                      <a href="{action_url}" style="display:inline-block;padding:12px 24px;color:#ffffff;text-decoration:none;font-weight:bold;font-size:14px;border-radius:6px;">{action_label}</a>
                    </td>
                  </tr>
                </table>
                <p style="margin:24px 0 0 0;font-size:13px;color:#6b7280;">
                  If the button doesn't work, copy and paste this link into your browser:<br />
                  <a href="{action_url}" style="color:#2563eb;word-break:break-all;">{action_url}</a>
                </p>
                <p style="margin:16px 0 0 0;font-size:13px;color:#6b7280;">{expiry_note}</p>
                {security_notice}
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px;background-color:#f9fafb;font-size:12px;color:#9ca3af;">
                Need help? Contact us at <a href="mailto:{support_email}" style="color:#6b7280;">{support_email}</a>.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
"""


def verification_email(*, first_name: str, verify_url: str, expiry_hours: int) -> tuple[str, str, str]:
    subject = f"Verify your email for {_APP_NAME}"
    html = _LAYOUT.format(
        app_name=_APP_NAME,
        heading="Verify your email address",
        greeting=f"Welcome, {first_name}!",
        body="Thanks for creating a RevGen BillIQ account. Please confirm this is your email "
        "address by clicking the button below to activate your account.",
        action_url=verify_url,
        action_label="Verify email",
        expiry_note=f"This link expires in {expiry_hours} hours.",
        security_notice="",
        support_email=settings.support_email,
    )
    text = (
        f"Welcome, {first_name}!\n\n"
        f"Please verify your email address for {_APP_NAME} by visiting:\n{verify_url}\n\n"
        f"This link expires in {expiry_hours} hours.\n\n"
        f"Need help? Contact us at {settings.support_email}."
    )
    return subject, html, text


def admin_invite_email(*, first_name: str, invite_url: str, role: str, expiry_hours: int) -> tuple[str, str, str]:
    subject = f"You've been invited to RevGenIQ Admin Portal"
    html = _LAYOUT.format(
        app_name="RevGenIQ Admin Portal",
        heading="You're invited to RevGenIQ Admin Portal",
        greeting=f"Hi {first_name},",
        body=f"You've been added as a <strong>{role.replace('_', ' ').title()}</strong> on the "
        "RevGenIQ internal Admin Portal. Click the button below to set your password and sign in.",
        action_url=invite_url,
        action_label="Set your password",
        expiry_note=f"This invite link expires in {expiry_hours} hours.",
        security_notice="",
        support_email=settings.support_email,
    )
    text = (
        f"Hi {first_name},\n\n"
        f"You've been added as a {role.replace('_', ' ').title()} on the RevGenIQ internal Admin Portal.\n"
        f"Set your password by visiting:\n{invite_url}\n\n"
        f"This invite link expires in {expiry_hours} hours."
    )
    return subject, html, text


def broadcast_announcement_email(*, first_name: str, subject_line: str, message: str) -> tuple[str, str, str]:
    body_html = message.replace("\n", "<br />")
    html = _LAYOUT.format(
        app_name=_APP_NAME,
        heading=subject_line,
        greeting=f"Hi {first_name},",
        body=body_html,
        action_url=settings.app_url,
        action_label="Go to RevGen BillIQ",
        expiry_note="",
        security_notice="",
        support_email=settings.support_email,
    )
    text = f"Hi {first_name},\n\n{message}\n\n{settings.app_url}"
    return subject_line, html, text


def password_reset_email(*, first_name: str, reset_url: str, expiry_minutes: int) -> tuple[str, str, str]:
    subject = f"Reset your password for {_APP_NAME}"
    security_notice = (
        '<p style="margin:16px 0 0 0;font-size:13px;color:#6b7280;">'
        "If you didn't request a password reset, you can safely ignore this email — "
        "your password will not be changed.</p>"
    )
    html = _LAYOUT.format(
        app_name=_APP_NAME,
        heading="Reset your password",
        greeting=f"Hi {first_name},",
        body="We received a request to reset the password for your RevGen BillIQ account. "
        "Click the button below to choose a new password.",
        action_url=reset_url,
        action_label="Reset password",
        expiry_note=f"This link expires in {expiry_minutes} minutes.",
        security_notice=security_notice,
        support_email=settings.support_email,
    )
    text = (
        f"Hi {first_name},\n\n"
        f"We received a request to reset the password for your {_APP_NAME} account. Visit:\n{reset_url}\n\n"
        f"This link expires in {expiry_minutes} minutes.\n"
        "If you didn't request this, you can safely ignore this email.\n\n"
        f"Need help? Contact us at {settings.support_email}."
    )
    return subject, html, text
