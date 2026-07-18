from __future__ import annotations

import pytest

from app.config import Settings
from app.errors import DomainError
from app.security.principal import claim_values, enforce_mfa_claims


def settings(**overrides: object) -> Settings:
    return Settings(
        environment="test",
        auth_required=False,
        database_url="sqlite+aiosqlite:///:memory:",
        oidc_mfa_required=True,
        oidc_mfa_amr_value="mfa",
        oidc_mfa_acr_values="urn:institution:loa:2,urn:institution:loa:3",
        **overrides,
    )


def test_mfa_accepts_signed_amr_or_configured_acr() -> None:
    enforce_mfa_claims({"amr": ["pwd", "mfa"]}, settings())
    enforce_mfa_claims({"acr": "urn:institution:loa:3"}, settings())


def test_mfa_rejects_missing_assurance() -> None:
    with pytest.raises(DomainError, match="MFA assurance"):
        enforce_mfa_claims({"amr": ["pwd"]}, settings())


def test_claim_values_does_not_split_string_into_characters() -> None:
    assert claim_values("kam.analyst") == frozenset({"kam.analyst"})
    assert claim_values(["kam.analyst", "spys.editor"]) == frozenset(
        {"kam.analyst", "spys.editor"}
    )
