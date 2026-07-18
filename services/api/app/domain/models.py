from __future__ import annotations

import enum
import uuid
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Any

from sqlalchemy import Boolean, Date, DateTime, Enum, Integer, JSON, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class PlanType(str, enum.Enum):
    HIP = "HIP"
    SHP = "SHP"
    OYTEP = "OYTEP"


class ProjectStatus(str, enum.Enum):
    DRAFT = "DRAFT"
    REVIEW = "REVIEW"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    ARCHIVED = "ARCHIVED"


class CommonObjectRecord(Base):
    __tablename__ = "common_objects"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    object_type: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    source_id: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    source_type: Mapped[str] = mapped_column(String(64), nullable=False)
    collector_id: Mapped[str] = mapped_column(String(255), nullable=False)
    source_reference: Mapped[str] = mapped_column(Text, nullable=False)
    observed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    ingested_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    processed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    geometry: Mapped[dict[str, Any] | None] = mapped_column(JSON)
    bounding_box: Mapped[list[float] | None] = mapped_column(JSON)
    raw_object_uri: Mapped[str] = mapped_column(Text, nullable=False)
    normalized_payload: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    content_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    language: Mapped[str | None] = mapped_column(String(16))
    country: Mapped[str | None] = mapped_column(String(2))
    classification: Mapped[str] = mapped_column(String(32), nullable=False)
    handling_caveat: Mapped[str | None] = mapped_column(String(255))
    tenant_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    source_reliability: Mapped[int] = mapped_column(Integer, nullable=False)
    information_credibility: Mapped[int] = mapped_column(Integer, nullable=False)
    machine_confidence: Mapped[Decimal | None] = mapped_column(Numeric(5, 4))
    analyst_confidence: Mapped[Decimal | None] = mapped_column(Numeric(5, 4))
    licence_or_usage_basis: Mapped[str] = mapped_column(Text, nullable=False)
    retention_policy: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    processing_history: Mapped[list[dict[str, Any]]] = mapped_column(JSON, nullable=False)
    model_versions: Mapped[list[str]] = mapped_column(JSON, nullable=False)
    correlation_ids: Mapped[list[str]] = mapped_column(JSON, nullable=False)
    chain_of_custody: Mapped[list[dict[str, Any]]] = mapped_column(JSON, nullable=False)
    is_synthetic: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)


class PlanningProjectRecord(Base):
    __tablename__ = "planning_projects"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    plan_type: Mapped[PlanType] = mapped_column(Enum(PlanType), nullable=False, index=True)
    code: Mapped[str] = mapped_column(String(64), nullable=False)
    serial_number: Mapped[str] = mapped_column(String(64), nullable=False)
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    need_authority: Mapped[str] = mapped_column(String(200), nullable=False)
    justification: Mapped[str] = mapped_column(Text, nullable=False)
    tactical_requirements: Mapped[str] = mapped_column(Text, nullable=False)
    need_quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    period_start: Mapped[int] = mapped_column(Integer, nullable=False)
    period_end: Mapped[int] = mapped_column(Integer, nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False)
    estimated_amount: Mapped[Decimal] = mapped_column(Numeric(20, 4), nullable=False)
    status: Mapped[ProjectStatus] = mapped_column(
        Enum(ProjectStatus), nullable=False, default=ProjectStatus.DRAFT
    )
    created_by: Mapped[str] = mapped_column(String(255), nullable=False)
    approved_by: Mapped[str | None] = mapped_column(String(255))
    is_synthetic: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class TemporaryAllocationRecord(Base):
    __tablename__ = "temporary_allocations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    allocation_type: Mapped[str] = mapped_column(String(16), nullable=False)
    item_name: Mapped[str] = mapped_column(String(300), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    stock_number: Mapped[str] = mapped_column(String(128), nullable=False)
    issued_at: Mapped[date] = mapped_column(Date, nullable=False)
    due_at: Mapped[date] = mapped_column(Date, nullable=False)
    responsible_user_id: Mapped[str] = mapped_column(String(255), nullable=False)
    extension_months: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_synthetic: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)


class AuditEventRecord(Base):
    __tablename__ = "audit_events"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    sequence: Mapped[int] = mapped_column(Integer, nullable=False, unique=True, index=True)
    occurred_at_utc: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    timezone_name: Mapped[str] = mapped_column(String(64), nullable=False)
    user_id: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    ip_address: Mapped[str] = mapped_column(String(64), nullable=False)
    device: Mapped[str] = mapped_column(String(512), nullable=False)
    operation: Mapped[str] = mapped_column(String(128), nullable=False)
    resource_type: Mapped[str] = mapped_column(String(128), nullable=False)
    resource_id: Mapped[str | None] = mapped_column(String(255))
    result: Mapped[str] = mapped_column(String(32), nullable=False)
    correlation_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    details: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    previous_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    event_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)

