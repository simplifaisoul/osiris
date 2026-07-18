from __future__ import annotations

from fastapi import APIRouter, Depends, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.helpers import request_audit_context
from app.config import Settings, get_settings
from app.db import get_session
from app.domain.audit import append_audit_event
from app.domain.models import PlanningProjectRecord
from app.domain.schemas import PlanningProjectCreate, PlanningProjectRead, ProjectTransitionRequest
from app.domain.services import transition_project
from app.errors import DomainError
from app.security.policy import enforce_tenant, require_roles
from app.security.principal import Principal


router = APIRouter(prefix="/v1/planning/projects", tags=["spys-planning"])


@router.post("", response_model=PlanningProjectRead, status_code=status.HTTP_201_CREATED)
async def create_project(
    payload: PlanningProjectCreate,
    request: Request,
    principal: Principal = Depends(require_roles("spys.editor", "kam.admin")),
    session: AsyncSession = Depends(get_session),
    settings: Settings = Depends(get_settings),
) -> PlanningProjectRecord:
    enforce_tenant(principal, payload.tenant_id)
    record = PlanningProjectRecord(**payload.model_dump(), created_by=principal.subject)
    session.add(record)
    await session.flush()
    await append_audit_event(
        session,
        key=settings.read_audit_key(),
        timezone_name=settings.default_timezone,
        operation="spys.project.create",
        resource_type="PlanningProject",
        resource_id=record.id,
        result="SUCCESS",
        details={"plan_type": payload.plan_type.value, "synthetic": payload.is_synthetic},
        **request_audit_context(request, principal),
    )
    await session.commit()
    await session.refresh(record)
    return record


@router.post("/{project_id}/transitions", response_model=PlanningProjectRead)
async def transition(
    project_id: str,
    payload: ProjectTransitionRequest,
    request: Request,
    principal: Principal = Depends(require_roles("spys.editor", "spys.approver", "kam.admin")),
    session: AsyncSession = Depends(get_session),
    settings: Settings = Depends(get_settings),
) -> PlanningProjectRecord:
    project = (
        await session.execute(
            select(PlanningProjectRecord).where(PlanningProjectRecord.id == project_id).with_for_update()
        )
    ).scalar_one_or_none()
    if project is None:
        raise DomainError("NOT_FOUND", "Planning project was not found", 404)
    enforce_tenant(principal, project.tenant_id)
    previous = project.status
    transition_project(project, payload.target_status, principal)
    await append_audit_event(
        session,
        key=settings.read_audit_key(),
        timezone_name=settings.default_timezone,
        operation="spys.project.transition",
        resource_type="PlanningProject",
        resource_id=project.id,
        result="SUCCESS",
        details={
            "from": previous.value,
            "to": payload.target_status.value,
            "reason": payload.reason,
        },
        **request_audit_context(request, principal),
    )
    await session.commit()
    await session.refresh(project)
    return project

