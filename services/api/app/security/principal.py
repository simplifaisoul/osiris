from __future__ import annotations

import asyncio
from dataclasses import dataclass
from functools import lru_cache
from typing import Any

import jwt
from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.config import Settings, get_settings
from app.errors import DomainError


@dataclass(frozen=True, slots=True)
class Principal:
    subject: str
    tenant_id: str
    display_name: str
    roles: frozenset[str]
    classifications: frozenset[str]
    device_id: str

    def has_role(self, *roles: str) -> bool:
        return bool(self.roles.intersection(roles))


class OIDCVerifier:
    """Validates Institution IAM tokens; this service never stores user passwords."""

    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.jwks_client = jwt.PyJWKClient(
            settings.oidc_jwks_url,
            cache_keys=True,
            lifespan=settings.oidc_jwks_cache_seconds,
        )

    def _decode(self, token: str) -> dict[str, Any]:
        signing_key = self.jwks_client.get_signing_key_from_jwt(token)
        return jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256", "ES256"],
            audience=self.settings.oidc_audience,
            issuer=self.settings.oidc_issuer,
            leeway=self.settings.oidc_clock_skew_seconds,
            options={"require": ["exp", "iat", "iss", "aud", "sub"]},
        )

    async def decode(self, token: str) -> dict[str, Any]:
        return await asyncio.to_thread(self._decode, token)


bearer = HTTPBearer(auto_error=False)


def claim_values(value: Any) -> frozenset[str]:
    if isinstance(value, str):
        return frozenset({value})
    if isinstance(value, (list, tuple, set, frozenset)):
        return frozenset(str(item) for item in value)
    return frozenset()


def enforce_mfa_claims(claims: dict[str, Any], settings: Settings) -> None:
    if not settings.oidc_mfa_required:
        return
    amr = claim_values(claims.get("amr"))
    acr = str(claims.get("acr") or "")
    permitted_acr = {
        value.strip() for value in settings.oidc_mfa_acr_values.split(",") if value.strip()
    }
    if settings.oidc_mfa_amr_value.strip() in amr or acr in permitted_acr:
        return
    raise DomainError("MFA_REQUIRED", "Institution IAM MFA assurance is required", 403)


@lru_cache(maxsize=4)
def get_verifier(
    issuer: str,
    jwks_url: str,
    audience: str,
    cache_seconds: int,
    clock_skew_seconds: int,
) -> OIDCVerifier:
    settings = Settings(
        oidc_issuer=issuer,
        oidc_jwks_url=jwks_url,
        oidc_audience=audience,
        oidc_jwks_cache_seconds=cache_seconds,
        oidc_clock_skew_seconds=clock_skew_seconds,
    )
    return OIDCVerifier(settings)


async def get_principal(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
    settings: Settings = Depends(get_settings),
) -> Principal:
    if not settings.auth_required:
        if settings.environment not in {"development", "test", "training"}:
            raise DomainError("AUTH_CONFIGURATION_ERROR", "Authentication cannot be disabled", 503)
        principal = Principal(
            subject="synthetic-development-user",
            tenant_id="synthetic-tenant",
            display_name="SENTETİK GELİŞTİRME KULLANICISI",
            roles=frozenset({"kam.admin", "spys.editor", "spys.approver"}),
            classifications=frozenset({"UNCLASSIFIED"}),
            device_id="synthetic-device",
        )
        request.state.principal = principal
        return principal

    if credentials is None or credentials.scheme.lower() != "bearer":
        raise DomainError("AUTHENTICATION_REQUIRED", "A bearer token is required", 401)
    if not settings.oidc_issuer or not settings.oidc_jwks_url or not settings.oidc_audience:
        raise DomainError("AUTH_CONFIGURATION_ERROR", "Institution IAM is not configured", 503)

    try:
        verifier = get_verifier(
            settings.oidc_issuer,
            settings.oidc_jwks_url,
            settings.oidc_audience,
            settings.oidc_jwks_cache_seconds,
            settings.oidc_clock_skew_seconds,
        )
        claims = await verifier.decode(credentials.credentials)
    except jwt.PyJWTError as exc:
        raise DomainError("INVALID_TOKEN", "The bearer token is invalid", 401) from exc
    except Exception as exc:
        raise DomainError("IAM_UNAVAILABLE", "Institution IAM validation is unavailable", 503) from exc

    enforce_mfa_claims(claims, settings)
    realm_access = claims.get("realm_access")
    realm_roles = realm_access.get("roles") if isinstance(realm_access, dict) else None
    roles = claim_values(claims.get("roles") or realm_roles)
    classifications = claim_values(claims.get("classifications") or ["UNCLASSIFIED"])
    tenant_id = str(claims.get("tenant_id") or "")
    device_id = str(claims.get(settings.oidc_device_claim) or "")
    if not tenant_id:
        raise DomainError("INVALID_TOKEN", "Token is missing tenant_id", 401)
    if not device_id:
        raise DomainError("INVALID_TOKEN", "Token is missing the institution device claim", 401)
    principal = Principal(
        subject=str(claims["sub"]),
        tenant_id=tenant_id,
        display_name=str(claims.get("name") or claims["sub"]),
        roles=roles,
        classifications=classifications,
        device_id=device_id,
    )
    request.state.principal = principal
    return principal
