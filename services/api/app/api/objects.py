from __future__ import annotations

from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.helpers import request_audit_context
from app.config import Settings, get_settings
from app.db import get_session
from app.domain.audit import append_audit_event
from app.domain.models import CommonObjectRecord
from app.domain.schemas import CommonObjectCreate, CommonObjectRead
from app.errors import DomainError
from app.security.policy import enforce_classification, enforce_tenant, require_roles
from app.security.principal import Principal


router = APIRouter(prefix="/v1/objects", tags=["common-object"])


@router.post("", response_model=CommonObjectRead, status_code=status.HTTP_201_CREATED)
async def create_object(
    payload: CommonObjectCreate,
    request: Request,
    principal: Principal = Depends(require_roles("kam.ingest", "kam.analyst", "kam.admin")),
    session: AsyncSession = Depends(get_session),
    settings: Settings = Depends(get_settings),
) -> CommonObjectRecord:
    enforce_tenant(principal, payload.tenant_id)
    enforce_classification(principal, payload.classification)
    record = CommonObjectRecord(**payload.model_dump())
    session.add(record)
    try:
        await session.flush()
    except IntegrityError as exc:
        await session.rollback()
        raise DomainError("DUPLICATE_CONTENT", "An object with this content hash exists", 409) from exc
    await append_audit_event(
        session,
        key=settings.read_audit_key(),
        timezone_name=settings.default_timezone,
        operation="common_object.create",
        resource_type=payload.object_type,
        resource_id=record.id,
        result="SUCCESS",
        details={"classification": payload.classification, "synthetic": payload.is_synthetic},
        **request_audit_context(request, principal),
    )
    await session.commit()
    await session.refresh(record)
    return record

