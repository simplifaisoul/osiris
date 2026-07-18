from __future__ import annotations

from collections.abc import Callable

from fastapi import Depends

from app.errors import DomainError
from app.security.principal import Principal, get_principal


CLASSIFICATION_LEVELS = {
    "UNCLASSIFIED": 0,
    "RESTRICTED": 1,
    "CONFIDENTIAL": 2,
    "SECRET": 3,
    "TOP_SECRET": 4,
}


def require_roles(*required_roles: str) -> Callable[..., Principal]:
    async def dependency(principal: Principal = Depends(get_principal)) -> Principal:
        if not principal.has_role(*required_roles):
            raise DomainError("FORBIDDEN", "The operation is not permitted", 403)
        return principal

    return dependency


def enforce_tenant(principal: Principal, tenant_id: str) -> None:
    if principal.tenant_id != tenant_id and "kam.admin" not in principal.roles:
        raise DomainError("FORBIDDEN", "Cross-tenant access is not permitted", 403)


def enforce_classification(principal: Principal, classification: str) -> None:
    required = CLASSIFICATION_LEVELS.get(classification)
    if required is None:
        raise DomainError("INVALID_CLASSIFICATION", "Unknown classification", 422)
    allowed = max((CLASSIFICATION_LEVELS.get(label, -1) for label in principal.classifications), default=-1)
    if allowed < required and "kam.admin" not in principal.roles:
        raise DomainError("FORBIDDEN", "Classification clearance is insufficient", 403)

