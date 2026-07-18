from __future__ import annotations

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa

from app.config import Settings
from app.security.principal import OIDCVerifier


ISSUER = "https://iam.test.invalid/realms/kam"
AUDIENCE = "kam-multi-int"


def verifier_and_private_key() -> tuple[OIDCVerifier, rsa.RSAPrivateKey]:
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    verifier = OIDCVerifier(
        Settings(
            environment="test",
            auth_required=True,
            database_url="sqlite+aiosqlite:///:memory:",
            oidc_issuer=ISSUER,
            oidc_jwks_url=f"{ISSUER}/certs",
            oidc_audience=AUDIENCE,
            oidc_clock_skew_seconds=0,
        )
    )
    verifier.jwks_client.get_signing_key_from_jwt = lambda _token: SimpleNamespace(
        key=private_key.public_key()
    )
    return verifier, private_key


def token(private_key: rsa.RSAPrivateKey, **overrides: object) -> str:
    now = datetime.now(timezone.utc)
    claims: dict[str, object] = {
        "sub": "analyst-1",
        "iss": ISSUER,
        "aud": AUDIENCE,
        "iat": now,
        "exp": now + timedelta(minutes=5),
        "tenant_id": "tenant-a",
        "device_id": "managed-device-1",
        "amr": ["pwd", "mfa"],
    }
    claims.update(overrides)
    return jwt.encode(claims, private_key, algorithm="RS256")


def test_oidc_verifier_accepts_valid_signed_token() -> None:
    verifier, private_key = verifier_and_private_key()

    claims = verifier._decode(token(private_key))

    assert claims["sub"] == "analyst-1"


def test_oidc_verifier_rejects_wrong_audience_and_expiry() -> None:
    verifier, private_key = verifier_and_private_key()
    with pytest.raises(jwt.InvalidAudienceError):
        verifier._decode(token(private_key, aud="wrong-audience"))
    with pytest.raises(jwt.ExpiredSignatureError):
        verifier._decode(
            token(
                private_key,
                iat=datetime.now(timezone.utc) - timedelta(minutes=10),
                exp=datetime.now(timezone.utc) - timedelta(minutes=5),
            )
        )
