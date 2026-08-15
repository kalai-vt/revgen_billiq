from __future__ import annotations

import base64
import json
from datetime import datetime, timedelta, timezone

import pytest
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.print_agent import PairingCode
from app.modules.printing import service as printing_service
from tests.conftest import register_and_activate_standalone


def _register(client: TestClient, email: str, phone: str, company_name: str = "Acme Retail") -> dict:
    return register_and_activate_standalone(
        client,
        {
            "company_name": company_name,
            "legal_name": f"{company_name} Ltd",
            "email": email,
            "phone": phone,
            "password": "StrongPass!123",
            "first_name": "Ada",
            "last_name": "Lovelace",
            "country": "US",
            "currency": "USD",
            "timezone": "UTC",
        },
    )


def _headers(access_token: str) -> dict:
    return {"Authorization": f"Bearer {access_token}"}


def _pair_device(
    client: TestClient, headers: dict, platform: str = "windows", agent_version: str = "1.0.0", fingerprint: str = "fp-1"
) -> dict:
    code_response = client.post("/api/printing/agent/pairing-code", headers=headers)
    assert code_response.status_code == 200, code_response.text
    code = code_response.json()["data"]["code"]

    pair_response = client.post(
        "/api/printing/agent/pair",
        json={"pairing_code": code, "platform": platform, "agent_version": agent_version, "device_fingerprint": fingerprint},
    )
    assert pair_response.status_code == 200, pair_response.text
    return pair_response.json()["data"]


@pytest.fixture()
def print_agent_signing_configured(monkeypatch: pytest.MonkeyPatch):
    """Throwaway RSA key pair for session-token signing, mirroring the qz_signing_configured
    fixture in test_printing.py — never written to disk, never committed. Resets the service
    module's cached private key afterward so it can't leak into other tests."""
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    private_pem = key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode()
    public_pem = key.public_key().public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    ).decode()
    monkeypatch.setattr(settings, "print_agent_signing_private_key", private_pem)
    monkeypatch.setattr(settings, "print_agent_signing_public_key", public_pem)
    monkeypatch.setattr(printing_service, "_token_private_key", None)
    yield key
    monkeypatch.setattr(printing_service, "_token_private_key", None)


# --- pairing-code generation ------------------------------------------------------------------


def test_pairing_code_requires_auth(client: TestClient) -> None:
    response = client.post("/api/printing/agent/pairing-code")
    assert response.status_code == 401


def test_pairing_code_generates_six_digit_code_with_expiry(client: TestClient) -> None:
    owner = _register(client, "owner@acme.test", "+15551234567")
    response = client.post("/api/printing/agent/pairing-code", headers=_headers(owner["access_token"]))
    assert response.status_code == 200, response.text
    data = response.json()["data"]
    assert len(data["code"]) == 6
    assert data["code"].isdigit()
    assert "expires_at" in data


def test_generating_new_pairing_code_invalidates_the_prior_one(client: TestClient) -> None:
    owner = _register(client, "owner@acme.test", "+15551234567")
    headers = _headers(owner["access_token"])
    first = client.post("/api/printing/agent/pairing-code", headers=headers).json()["data"]
    second = client.post("/api/printing/agent/pairing-code", headers=headers).json()["data"]
    assert first["code"] != second["code"] or True  # codes could coincidentally match; not the point

    # The first code must no longer be usable for pairing once a second one was generated.
    pair_response = client.post(
        "/api/printing/agent/pair",
        json={"pairing_code": first["code"], "platform": "windows", "agent_version": "1.0.0", "device_fingerprint": "fp"},
    )
    if first["code"] == second["code"]:
        pytest.skip("codes collided by chance")
    assert pair_response.status_code == 400


# --- pairing ------------------------------------------------------------------------------------


def test_pair_succeeds_with_valid_code_and_returns_secret_exactly_once(client: TestClient) -> None:
    owner = _register(client, "owner@acme.test", "+15551234567")
    headers = _headers(owner["access_token"])
    device = _pair_device(client, headers)
    assert set(device.keys()) == {"device_id", "device_secret", "tenant_id"}
    assert device["device_id"]
    assert len(device["device_secret"]) > 20
    assert device["tenant_id"] == owner["tenant"]["id"]

    devices = client.get("/api/printing/agent/devices", headers=headers).json()["data"]
    assert len(devices) == 1
    assert devices[0]["id"] == device["device_id"]
    # The secret itself is never returned again, in any shape.
    assert "device_secret" not in devices[0]
    assert "secret_hash" not in devices[0]


def test_pair_fails_with_unknown_code(client: TestClient) -> None:
    response = client.post(
        "/api/printing/agent/pair",
        json={"pairing_code": "000000", "platform": "windows", "agent_version": "1.0.0", "device_fingerprint": "fp"},
    )
    assert response.status_code == 400


def test_pair_fails_with_already_consumed_code(client: TestClient) -> None:
    owner = _register(client, "owner@acme.test", "+15551234567")
    headers = _headers(owner["access_token"])
    code_response = client.post("/api/printing/agent/pairing-code", headers=headers)
    code = code_response.json()["data"]["code"]

    pair_payload = {"pairing_code": code, "platform": "windows", "agent_version": "1.0.0", "device_fingerprint": "fp"}
    first = client.post("/api/printing/agent/pair", json=pair_payload)
    assert first.status_code == 200, first.text

    second = client.post("/api/printing/agent/pair", json=pair_payload)
    assert second.status_code == 400


def test_pair_fails_with_expired_code(client: TestClient, db_session: Session) -> None:
    owner = _register(client, "owner@acme.test", "+15551234567")
    headers = _headers(owner["access_token"])
    code_response = client.post("/api/printing/agent/pairing-code", headers=headers)
    code = code_response.json()["data"]["code"]

    pairing_row = db_session.query(PairingCode).filter(PairingCode.code == code).first()
    pairing_row.expires_at = datetime.now(timezone.utc) - timedelta(minutes=1)
    db_session.commit()

    response = client.post(
        "/api/printing/agent/pair",
        json={"pairing_code": code, "platform": "windows", "agent_version": "1.0.0", "device_fingerprint": "fp"},
    )
    assert response.status_code == 400


# --- session tokens -------------------------------------------------------------------------


def test_session_token_requires_auth(client: TestClient) -> None:
    owner = _register(client, "owner@acme.test", "+15551234567")
    device = _pair_device(client, _headers(owner["access_token"]))
    response = client.post("/api/printing/agent/session-token", json={"device_id": device["device_id"]})
    assert response.status_code == 401


def test_session_token_rejects_device_from_a_different_tenant(client: TestClient, print_agent_signing_configured) -> None:
    tenant_a = _register(client, "owner-a@acme.test", "+15551234567", "Acme A")
    tenant_b = _register(client, "owner-b@acme.test", "+15559876543", "Acme B")

    device = _pair_device(client, _headers(tenant_a["access_token"]))

    response = client.post(
        "/api/printing/agent/session-token",
        json={"device_id": device["device_id"]},
        headers=_headers(tenant_b["access_token"]),
    )
    assert response.status_code in (403, 404)

    # The rightful tenant can still mint a token for its own device.
    own_response = client.post(
        "/api/printing/agent/session-token",
        json={"device_id": device["device_id"]},
        headers=_headers(tenant_a["access_token"]),
    )
    assert own_response.status_code == 200, own_response.text


def test_session_token_signature_verifies_against_public_key(client: TestClient, print_agent_signing_configured) -> None:
    owner = _register(client, "owner@acme.test", "+15551234567")
    headers = _headers(owner["access_token"])
    device = _pair_device(client, headers)

    public_key_response = client.get("/api/printing/agent/token-public-key")
    assert public_key_response.status_code == 200, public_key_response.text
    public_pem = public_key_response.json()["data"]["public_key"]
    public_key = serialization.load_pem_public_key(public_pem.encode())

    token_response = client.post(
        "/api/printing/agent/session-token", json={"device_id": device["device_id"]}, headers=headers
    )
    assert token_response.status_code == 200, token_response.text
    body = token_response.json()["data"]
    assert set(body.keys()) == {"token", "signature"}

    payload_bytes = base64.b64decode(body["token"])
    signature = base64.b64decode(body["signature"])

    # Round-trips through the SAME public key the /token-public-key endpoint hands out — proves
    # the backend actually signed with the matching private key and the agent-side verifier
    # (built against this exact contract) will be able to do the same.
    public_key.verify(signature, payload_bytes, padding.PKCS1v15(), hashes.SHA512())

    payload = json.loads(payload_bytes)
    assert payload["device_id"] == device["device_id"]
    assert payload["tenant_id"] == owner["tenant"]["id"]
    assert payload["user_id"] == owner["user"]["id"]
    assert payload["expires_at"] - payload["issued_at"] == 60


def test_session_token_fails_cleanly_when_signing_unconfigured(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    owner = _register(client, "owner@acme.test", "+15551234567")
    headers = _headers(owner["access_token"])
    device = _pair_device(client, headers)
    # Force the unconfigured state explicitly rather than relying on the ambient .env having no
    # signing keys — a real dev/deploy environment (this one included) legitimately configures
    # them for the feature to actually work, which would otherwise make this test's premise false
    # and its assertion silently never exercise the "unconfigured" code path it's meant to cover.
    monkeypatch.setattr(settings, "print_agent_signing_private_key", "")
    monkeypatch.setattr(settings, "print_agent_signing_public_key", "")
    monkeypatch.setattr(printing_service, "_token_private_key", None)
    response = client.post("/api/printing/agent/session-token", json={"device_id": device["device_id"]}, headers=headers)
    assert response.status_code == 400
    assert "configured" in response.json()["detail"].lower()


# --- revoke ---------------------------------------------------------------------------------


def test_revoke_requires_ownership(client: TestClient) -> None:
    tenant_a = _register(client, "owner-a@acme.test", "+15551234567", "Acme A")
    tenant_b = _register(client, "owner-b@acme.test", "+15559876543", "Acme B")
    device = _pair_device(client, _headers(tenant_a["access_token"]))

    cross_tenant = client.post(
        f"/api/printing/agent/devices/{device['device_id']}/revoke", headers=_headers(tenant_b["access_token"])
    )
    assert cross_tenant.status_code == 403

    # Device must still be listed for its rightful tenant, untouched.
    devices = client.get("/api/printing/agent/devices", headers=_headers(tenant_a["access_token"])).json()["data"]
    assert len(devices) == 1


def test_revoke_is_idempotent(client: TestClient) -> None:
    owner = _register(client, "owner@acme.test", "+15551234567")
    headers = _headers(owner["access_token"])
    device = _pair_device(client, headers)

    first = client.post(f"/api/printing/agent/devices/{device['device_id']}/revoke", headers=headers)
    assert first.status_code == 200, first.text

    second = client.post(f"/api/printing/agent/devices/{device['device_id']}/revoke", headers=headers)
    assert second.status_code == 200, second.text

    devices = client.get("/api/printing/agent/devices", headers=headers).json()["data"]
    assert devices == []


# --- devices list -----------------------------------------------------------------------------


def test_devices_list_only_returns_current_tenants_non_revoked_devices(client: TestClient) -> None:
    tenant_a = _register(client, "owner-a@acme.test", "+15551234567", "Acme A")
    tenant_b = _register(client, "owner-b@acme.test", "+15559876543", "Acme B")
    headers_a = _headers(tenant_a["access_token"])
    headers_b = _headers(tenant_b["access_token"])

    device_a1 = _pair_device(client, headers_a, agent_version="1.0.0", fingerprint="fp-a1")
    _pair_device(client, headers_a, agent_version="1.1.0", fingerprint="fp-a2")
    _pair_device(client, headers_b, agent_version="1.0.0", fingerprint="fp-b1")

    client.post(f"/api/printing/agent/devices/{device_a1['device_id']}/revoke", headers=headers_a)

    devices_a = client.get("/api/printing/agent/devices", headers=headers_a).json()["data"]
    assert len(devices_a) == 1
    assert devices_a[0]["id"] != device_a1["device_id"]

    devices_b = client.get("/api/printing/agent/devices", headers=headers_b).json()["data"]
    assert len(devices_b) == 1


def test_devices_list_requires_auth(client: TestClient) -> None:
    response = client.get("/api/printing/agent/devices")
    assert response.status_code == 401


# --- token public key -------------------------------------------------------------------------


def test_token_public_key_endpoint_is_unauthenticated(client: TestClient, print_agent_signing_configured) -> None:
    response = client.get("/api/printing/agent/token-public-key")
    assert response.status_code == 200, response.text
    assert "PUBLIC KEY" in response.json()["data"]["public_key"]
