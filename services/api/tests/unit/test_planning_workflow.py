from __future__ import annotations

from decimal import Decimal

import pytest

from app.domain.models import PlanType, PlanningProjectRecord, ProjectStatus
from app.domain.services import transition_project
from app.errors import DomainError
from app.security.principal import Principal


def make_principal(subject: str, *roles: str) -> Principal:
    return Principal(
        subject=subject,
        tenant_id="synthetic-tenant",
        display_name=subject,
        roles=frozenset(roles),
        classifications=frozenset({"UNCLASSIFIED"}),
        device_id="synthetic-device",
    )


def project() -> PlanningProjectRecord:
    return PlanningProjectRecord(
        id="synthetic-project",
        tenant_id="synthetic-tenant",
        plan_type=PlanType.HIP,
        code="SYN.HIP.001",
        serial_number="SYN-001",
        title="SENTETİK HİP Projesi",
        need_authority="SENTETİK MAKAM",
        justification="Yalnız kabul testi için sentetik ve yeterince uzun gerekçe.",
        tactical_requirements="Yalnız kabul testi için sentetik taktik ister açıklaması.",
        need_quantity=1,
        period_start=2026,
        period_end=2026,
        currency="TRY",
        estimated_amount=Decimal("100.0000"),
        created_by="creator",
        status=ProjectStatus.DRAFT,
        is_synthetic=True,
        version=1,
    )


def test_project_requires_editor_then_independent_approver() -> None:
    record = project()
    transition_project(record, ProjectStatus.REVIEW, make_principal("creator", "spys.editor"))
    transition_project(record, ProjectStatus.APPROVED, make_principal("approver", "spys.approver"))
    assert record.status == ProjectStatus.APPROVED
    assert record.approved_by == "approver"
    assert record.version == 3


def test_creator_cannot_approve_own_project() -> None:
    record = project()
    record.status = ProjectStatus.REVIEW
    with pytest.raises(DomainError, match="cannot be approved"):
        transition_project(record, ProjectStatus.APPROVED, make_principal("creator", "spys.approver"))

