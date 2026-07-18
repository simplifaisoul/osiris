from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.domain.models import PlanType, ProjectStatus


CLASSIFICATIONS = {"UNCLASSIFIED", "RESTRICTED", "CONFIDENTIAL", "SECRET", "TOP_SECRET"}
OBJECT_TYPES = {
    "Source", "Collector", "Observation", "Entity", "Person", "Organization", "Location",
    "Facility", "Aircraft", "Vessel", "Satellite", "Vehicle", "Device", "Account", "Domain",
    "IPAddress", "Wallet", "MediaAsset", "Document", "Message", "Post", "Broadcast", "Event",
    "Incident", "Track", "Relationship", "Indicator", "Vulnerability", "SanctionRecord",
    "Watchlist", "Alert", "Case", "Assessment", "Task", "Workflow", "Report", "Evidence",
    "ProvenanceRecord", "RetentionPolicy", "ClassificationLabel", "AuditEvent",
}


class CommonObjectCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    object_type: str
    source_id: str = Field(min_length=1, max_length=255)
    source_type: str = Field(min_length=1, max_length=64)
    collector_id: str = Field(min_length=1, max_length=255)
    source_reference: str = Field(min_length=1, max_length=2048)
    observed_at: datetime
    published_at: datetime | None = None
    geometry: dict[str, Any] | None = None
    bounding_box: list[float] | None = None
    raw_object_uri: str = Field(min_length=1, max_length=2048)
    normalized_payload: dict[str, Any]
    content_hash: str = Field(pattern=r"^[a-fA-F0-9]{64}$")
    language: str | None = Field(default=None, pattern=r"^[a-z]{2,3}(?:-[A-Z]{2})?$")
    country: str | None = Field(default=None, pattern=r"^[A-Z]{2}$")
    classification: str = "UNCLASSIFIED"
    handling_caveat: str | None = Field(default=None, max_length=255)
    tenant_id: str = Field(min_length=1, max_length=64)
    source_reliability: int = Field(ge=1, le=6)
    information_credibility: int = Field(ge=1, le=6)
    machine_confidence: Decimal | None = Field(default=None, ge=0, le=1)
    analyst_confidence: Decimal | None = Field(default=None, ge=0, le=1)
    licence_or_usage_basis: str = Field(min_length=3, max_length=1000)
    retention_policy: dict[str, Any]
    processing_history: list[dict[str, Any]] = Field(default_factory=list)
    model_versions: list[str] = Field(default_factory=list)
    correlation_ids: list[str] = Field(default_factory=list)
    chain_of_custody: list[dict[str, Any]] = Field(default_factory=list)
    is_synthetic: bool = False

    @field_validator("object_type")
    @classmethod
    def validate_object_type(cls, value: str) -> str:
        if value not in OBJECT_TYPES:
            raise ValueError("Unsupported common object type")
        return value

    @field_validator("classification")
    @classmethod
    def validate_classification(cls, value: str) -> str:
        if value not in CLASSIFICATIONS:
            raise ValueError("Unsupported classification")
        return value

    @field_validator("geometry")
    @classmethod
    def validate_geojson(cls, value: dict[str, Any] | None) -> dict[str, Any] | None:
        if value is None:
            return None
        allowed = {"Point", "MultiPoint", "LineString", "MultiLineString", "Polygon", "MultiPolygon"}
        if value.get("type") not in allowed or "coordinates" not in value:
            raise ValueError("geometry must be a valid GeoJSON geometry object")
        return value

    @field_validator("bounding_box")
    @classmethod
    def validate_bbox(cls, value: list[float] | None) -> list[float] | None:
        if value is None:
            return None
        if len(value) not in {4, 6}:
            raise ValueError("bounding_box must contain 4 or 6 numbers")
        if len(value) == 4 and (value[0] > value[2] or value[1] > value[3]):
            raise ValueError("bounding_box minimums must not exceed maximums")
        return value

    @model_validator(mode="after")
    def validate_synthetic_marking(self) -> "CommonObjectCreate":
        if self.source_type.upper() == "SYNTHETIC" and not self.is_synthetic:
            raise ValueError("SYNTHETIC source records must set is_synthetic=true")
        if self.is_synthetic and self.source_type.upper() != "SYNTHETIC":
            raise ValueError("Synthetic records must use source_type=SYNTHETIC")
        return self


class CommonObjectRead(CommonObjectCreate):
    id: str
    ingested_at: datetime
    processed_at: datetime
    version: int

    model_config = ConfigDict(from_attributes=True)


class PlanningProjectCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    tenant_id: str = Field(min_length=1, max_length=64)
    plan_type: PlanType
    code: str = Field(pattern=r"^[A-Z0-9][A-Z0-9._/-]{2,63}$")
    serial_number: str = Field(pattern=r"^[A-Z0-9][A-Z0-9._/-]{1,63}$")
    title: str = Field(min_length=3, max_length=300)
    need_authority: str = Field(min_length=2, max_length=200)
    justification: str = Field(min_length=10, max_length=5000)
    tactical_requirements: str = Field(min_length=10, max_length=5000)
    need_quantity: int = Field(gt=0, le=1_000_000_000)
    period_start: int = Field(ge=2000, le=2200)
    period_end: int = Field(ge=2000, le=2200)
    currency: Literal["TRY", "USD", "EUR"]
    estimated_amount: Decimal = Field(ge=0, max_digits=20, decimal_places=4)
    is_synthetic: bool = False

    @model_validator(mode="after")
    def validate_period(self) -> "PlanningProjectCreate":
        years = self.period_end - self.period_start + 1
        if self.period_end < self.period_start:
            raise ValueError("period_end must be on or after period_start")
        if self.plan_type == PlanType.SHP and years != 20:
            raise ValueError("SHP projects require an exact 20-year planning period")
        if self.plan_type == PlanType.OYTEP and years != 10:
            raise ValueError("OYTEP projects require an exact 10-year programme period")
        return self


class PlanningProjectRead(PlanningProjectCreate):
    id: str
    status: ProjectStatus
    created_by: str
    approved_by: str | None
    version: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ProjectTransitionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    target_status: ProjectStatus
    reason: str = Field(min_length=3, max_length=1000)


class CurrencyConversionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    amount: Decimal = Field(ge=0, max_digits=20, decimal_places=4)
    source_currency: Literal["TRY", "USD", "EUR"]
    target_currency: Literal["TRY", "USD", "EUR"]
    rate: Decimal = Field(gt=0, max_digits=20, decimal_places=8)
    rate_date: date


class CurrencyConversionResponse(BaseModel):
    source_amount: Decimal
    source_currency: str
    converted_amount: Decimal
    target_currency: str
    rate: Decimal
    rate_date: date
    rounding: str


class AllocationExpiryResponse(BaseModel):
    due_at: date
    days_remaining: int
    level: Literal["NORMAL", "YELLOW", "RED", "OVERDUE"]
    notification_required: bool

