from __future__ import annotations

import asyncio
from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app.config import Settings, get_settings
from app.db import create_engine
from app.security.principal import get_verifier


router = APIRouter(tags=["health"])


@router.get("/health")
async def health() -> dict[str, str]:
    return {
        "status": "operational",
        "service": "kam-foundation-api",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/ready")
async def ready(
    settings: Settings = Depends(get_settings),
) -> JSONResponse:
    checks: dict[str, dict[str, str]] = {}
    engine = None
    try:
        engine = create_engine(settings.resolved_database_url())
        async with engine.connect() as connection:
            await connection.execute(text("SELECT 1"))
            revision = (
                await connection.execute(text("SELECT version_num FROM alembic_version"))
            ).scalar_one_or_none()
            if revision != settings.required_schema_revision:
                raise RuntimeError("Database schema revision is not ready")
        checks["database"] = {
            "status": "ready",
            "revision": settings.required_schema_revision,
        }
    except Exception:
        checks["database"] = {"status": "unavailable"}
    finally:
        if engine is not None:
            await engine.dispose()

    security_errors = settings.validate_security_prerequisites()
    checks["security_configuration"] = {
        "status": "ready" if not security_errors else "unavailable",
        "detail": "; ".join(security_errors),
    }
    try:
        settings.read_audit_key()
        checks["audit_key"] = {"status": "ready"}
    except RuntimeError:
        checks["audit_key"] = {"status": "unavailable"}

    if settings.auth_required and not security_errors:
        try:
            verifier = get_verifier(
                settings.oidc_issuer,
                settings.oidc_jwks_url,
                settings.oidc_audience,
                settings.oidc_jwks_cache_seconds,
                settings.oidc_clock_skew_seconds,
            )
            await asyncio.wait_for(
                asyncio.to_thread(verifier.jwks_client.get_jwk_set),
                timeout=3,
            )
            checks["institution_iam"] = {"status": "ready"}
        except Exception:
            checks["institution_iam"] = {"status": "unavailable"}
    elif settings.auth_required:
        checks["institution_iam"] = {"status": "unavailable"}
    else:
        checks["institution_iam"] = {"status": "not_required"}

    is_ready = all(check["status"] in {"ready", "not_required"} for check in checks.values())
    return JSONResponse(
        status_code=200 if is_ready else 503,
        content={
            "status": "ready" if is_ready else "not_ready",
            "service": "kam-foundation-api",
            "checks": checks,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        },
    )
