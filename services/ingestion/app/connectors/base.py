from __future__ import annotations

from abc import ABC, abstractmethod
from datetime import datetime, timezone
from typing import Any, Protocol

from pydantic import BaseModel, Field

from app.connectors.dedup import content_hash
from app.connectors.manifest import ConnectorManifest


SYNTHETIC_MARKER = "SENTETİK"  # visible synthetic label required in UI and records


class RawObservation(BaseModel):
    """A single provider record before normalization into the Common Object Model."""

    provider_id: str = Field(min_length=1, max_length=512)
    observed_at: datetime
    payload: dict[str, Any]
    raw_reference: str = Field(min_length=1, max_length=2048)
    geometry: dict[str, Any] | None = None
    country: str | None = None
    language: str | None = None
    published_at: datetime | None = None


class Sink(Protocol):
    """Downstream transport for normalized observations.

    The default runner uses an in-memory list; production supplies a Kafka/object
    -store sink implementing the same call. Connectors never import a transport.
    """

    def emit(self, common_object: dict[str, Any]) -> None: ...


class BaseConnector(ABC):
    """Base class for every data connector.

    Subclasses implement :meth:`fetch`. Normalization to the Common Object Model,
    provenance stamping, synthetic labelling, and content hashing are handled
    here so every connector produces spec-conformant records identically.
    """

    def __init__(self, manifest: ConnectorManifest, *, synthetic: bool = False) -> None:
        self.manifest = manifest
        self.synthetic = synthetic

    @abstractmethod
    async def fetch(self, cursor: str | None) -> list[RawObservation]:
        """Return raw provider records newer than ``cursor`` (provider-specific)."""
        raise NotImplementedError

    def to_common_object(self, raw: RawObservation, *, tenant_id: str) -> dict[str, Any]:
        """Map a raw observation to a Common-Object-Model-conformant dictionary.

        The returned dict matches the foundation API's ``CommonObjectCreate``
        contract, including all mandatory provenance fields. Synthetic runs are
        force-labelled so demo data can never be mistaken for live intelligence.
        """
        source_type = "SYNTHETIC" if self.synthetic else self.manifest.provider.upper()
        payload: dict[str, Any] = dict(raw.payload)
        if self.synthetic:
            payload["synthetic_marker"] = SYNTHETIC_MARKER

        digest = content_hash(f"{self.manifest.id}:{raw.provider_id}", raw.payload)
        now = datetime.now(timezone.utc)

        return {
            "object_type": self.manifest.common_object_type,
            "source_id": f"{self.manifest.id}:{raw.provider_id}",
            "source_type": source_type,
            "collector_id": self.manifest.id,
            "source_reference": raw.raw_reference,
            "observed_at": raw.observed_at,
            "published_at": raw.published_at,
            "geometry": raw.geometry,
            "raw_object_uri": raw.raw_reference,
            "normalized_payload": payload,
            "content_hash": digest,
            "language": raw.language,
            "country": raw.country,
            "classification": self.manifest.default_classification,
            "tenant_id": tenant_id,
            "source_reliability": self.manifest.source_reliability,
            "information_credibility": self.manifest.information_credibility,
            "licence_or_usage_basis": self.manifest.licence_or_usage_basis,
            "retention_policy": {
                "raw_retention_days": self.manifest.raw_retention_days,
                "basis": self.manifest.lawful_basis_reference,
            },
            "processing_history": [
                {
                    "step": "ingest.normalize",
                    "connector": self.manifest.id,
                    "connector_version": self.manifest.version,
                    "at": now.isoformat(),
                }
            ],
            "model_versions": [],
            "correlation_ids": [],
            "chain_of_custody": [
                {"actor": f"connector:{self.manifest.id}", "action": "collected", "at": now.isoformat()}
            ],
            "is_synthetic": self.synthetic,
        }
