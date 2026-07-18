from __future__ import annotations

from datetime import date
from decimal import Decimal, ROUND_HALF_EVEN

from app.config import Settings
from app.domain.models import PlanningProjectRecord, ProjectStatus
from app.domain.schemas import (
    AllocationExpiryResponse,
    CurrencyConversionRequest,
    CurrencyConversionResponse,
)
from app.errors import DomainError
from app.security.principal import Principal


def convert_currency(
    request: CurrencyConversionRequest,
    scale: int = 4,
) -> CurrencyConversionResponse:
    quantum = Decimal(1).scaleb(-scale)
    if request.source_currency == request.target_currency:
        converted = request.amount
    else:
        converted = request.amount * request.rate
    converted = converted.quantize(quantum, rounding=ROUND_HALF_EVEN)
    return CurrencyConversionResponse(
        source_amount=request.amount,
        source_currency=request.source_currency,
        converted_amount=converted,
        target_currency=request.target_currency,
        rate=request.rate,
        rate_date=request.rate_date,
        rounding="ROUND_HALF_EVEN",
    )


def allocation_expiry(due_at: date, today: date, settings: Settings) -> AllocationExpiryResponse:
    days = (due_at - today).days
    if days < 0:
        level = "OVERDUE"
    elif days <= settings.demat_red_days:
        level = "RED"
    elif days <= settings.demat_yellow_days:
        level = "YELLOW"
    else:
        level = "NORMAL"
    return AllocationExpiryResponse(
        due_at=due_at,
        days_remaining=days,
        level=level,  # type: ignore[arg-type]
        notification_required=level != "NORMAL",
    )


ALLOWED_TRANSITIONS: dict[ProjectStatus, set[ProjectStatus]] = {
    ProjectStatus.DRAFT: {ProjectStatus.REVIEW, ProjectStatus.ARCHIVED},
    ProjectStatus.REVIEW: {ProjectStatus.APPROVED, ProjectStatus.REJECTED},
    ProjectStatus.REJECTED: {ProjectStatus.DRAFT, ProjectStatus.ARCHIVED},
    ProjectStatus.APPROVED: {ProjectStatus.ARCHIVED},
    ProjectStatus.ARCHIVED: set(),
}


def transition_project(
    project: PlanningProjectRecord,
    target: ProjectStatus,
    principal: Principal,
) -> None:
    if target not in ALLOWED_TRANSITIONS[project.status]:
        raise DomainError(
            "INVALID_WORKFLOW_TRANSITION",
            f"Transition {project.status.value} -> {target.value} is not allowed",
            409,
        )
    if target == ProjectStatus.REVIEW and not principal.has_role("spys.editor", "kam.admin"):
        raise DomainError("FORBIDDEN", "SPYS editor role is required", 403)
    if target in {ProjectStatus.APPROVED, ProjectStatus.REJECTED}:
        if not principal.has_role("spys.approver", "kam.admin"):
            raise DomainError("FORBIDDEN", "SPYS approver role is required", 403)
        if target == ProjectStatus.APPROVED and principal.subject == project.created_by:
            raise DomainError(
                "FOUR_EYES_REQUIRED",
                "A project cannot be approved by its creator",
                409,
            )
        project.approved_by = principal.subject if target == ProjectStatus.APPROVED else None
    project.status = target
    project.version += 1

