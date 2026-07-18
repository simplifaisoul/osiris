from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings, get_settings
from app.db import get_session
from app.domain.audit import verify_audit_chain
from app.domain.models import AuditEventRecord
from app.security.policy import require_roles
from app.security.principal import Principal


router = APIRouter(prefix="/v1/audit", tags=["audit"])


@router.get("/verify")
async def verify(
    _principal: Principal = Depends(require_roles("kam.auditor", "kam.admin")),
    session: AsyncSession = Depends(get_session),
    settings: Settings = Depends(get_settings),
) -> dict[str, object]:
    records = (
        await session.execute(select(AuditEventRecord).order_by(AuditEventRecord.sequence.asc()))
    ).scalars().all()
    return {
        "valid": verify_audit_chain(records, settings.read_audit_key()),
        "event_count": len(records),
        "first_sequence": records[0].sequence if records else None,
        "last_sequence": records[-1].sequence if records else None,
    }

