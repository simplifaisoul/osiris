from __future__ import annotations

from pathlib import Path
from typing import Any, Literal

import yaml
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


DOMAINS = {
    "aviation", "maritime", "space", "gnss", "cctv", "environment", "news",
    "telegram", "cyber", "financial", "conflict", "infrastructure",
}

AUTH_TYPES = {"none", "api_key", "bearer_token", "basic", "oauth2"}


class RateLimit(BaseModel):
    model_config = ConfigDict(extra="forbid")
    requests: int = Field(gt=0, le=1_000_000)
    per_seconds: int = Field(gt=0, le=86_400)


class ConnectorManifest(BaseModel):
    """The declarative contract every connector must satisfy (OSIRIS §5, §23).

    A manifest carries the legal usage basis, authentication requirements, rate
    limits, health/retry/circuit-breaker policy, dedup/checkpoint strategy, raw
    retention, and the Common Object Model mapping. Manifests are the single
    source of truth for whether a connector may be presented as live.
    """

    model_config = ConfigDict(extra="forbid")

    id: str = Field(pattern=r"^[a-z0-9][a-z0-9_]{1,63}$")
    version: str = Field(pattern=r"^\d+\.\d+\.\d+$")
    domain: str
    display_name: str = Field(min_length=3, max_length=120)
    provider: str = Field(min_length=2, max_length=120)

    # Legal/usage governance — the specification forbids "collect first, ask later".
    licence_or_usage_basis: str = Field(min_length=3, max_length=1000)
    lawful_basis_reference: str = Field(min_length=3, max_length=500)

    auth_type: Literal["none", "api_key", "bearer_token", "basic", "oauth2"]
    # Names of secrets that must be present for this connector to be configured.
    required_secrets: list[str] = Field(default_factory=list)
    base_url: str = Field(min_length=1, max_length=2048)

    rate_limit: RateLimit
    poll_frequency_seconds: int = Field(ge=1, le=604_800)
    max_retries: int = Field(default=5, ge=0, le=20)
    circuit_failure_threshold: int = Field(default=5, ge=1, le=100)
    pagination: Literal["none", "cursor", "page", "token", "time_window"] = "none"
    checkpoint_strategy: Literal["none", "cursor", "timestamp"] = "none"
    dedup_key: Literal["content_hash", "provider_id"] = "content_hash"
    raw_retention_days: int = Field(ge=0, le=36_500)

    # Common Object Model mapping.
    common_object_type: str
    default_classification: str = "UNCLASSIFIED"
    source_reliability: int = Field(ge=1, le=6)
    information_credibility: int = Field(ge=1, le=6)
    geocoding_required: bool = False

    # True only for connectors reaching the public internet; disabled build- and
    # run-time in the SPYS_AIRGAP profile.
    requires_public_network: bool = True
    tags: list[str] = Field(default_factory=list)

    @field_validator("domain")
    @classmethod
    def validate_domain(cls, value: str) -> str:
        if value not in DOMAINS:
            raise ValueError(f"Unsupported domain '{value}'")
        return value

    @field_validator("auth_type")
    @classmethod
    def validate_auth(cls, value: str) -> str:
        if value not in AUTH_TYPES:
            raise ValueError(f"Unsupported auth_type '{value}'")
        return value

    @model_validator(mode="after")
    def validate_auth_secrets(self) -> "ConnectorManifest":
        # Any authenticated connector must declare at least one required secret,
        # so a missing key deterministically yields CONFIGURATION_REQUIRED.
        if self.auth_type != "none" and not self.required_secrets:
            raise ValueError(
                f"Connector '{self.id}' uses auth '{self.auth_type}' but declares no required_secrets"
            )
        if self.auth_type == "none" and self.required_secrets:
            raise ValueError(
                f"Connector '{self.id}' declares required_secrets but auth_type is 'none'"
            )
        return self


def load_manifest_file(path: Path) -> ConnectorManifest:
    """Parse and validate one manifest YAML file."""
    with path.open("r", encoding="utf-8") as handle:
        raw: Any = yaml.safe_load(handle)
    if not isinstance(raw, dict):
        raise ValueError(f"Manifest {path.name} must be a YAML mapping")
    return ConnectorManifest.model_validate(raw)


def load_manifests(directory: Path) -> list[ConnectorManifest]:
    """Load every ``*.yaml`` manifest in a directory, sorted by id.

    Raises on the first invalid manifest so a malformed contract cannot be
    silently skipped and later mistaken for "no connector".
    """
    manifests: list[ConnectorManifest] = []
    seen: set[str] = set()
    for path in sorted(directory.glob("*.yaml")):
        manifest = load_manifest_file(path)
        if manifest.id in seen:
            raise ValueError(f"Duplicate connector id '{manifest.id}' in {path.name}")
        seen.add(manifest.id)
        manifests.append(manifest)
    return manifests
