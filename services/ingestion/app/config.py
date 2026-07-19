from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Ingestion runtime configuration. Security-sensitive defaults fail closed."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    environment: Literal["development", "test", "training", "production"] = "production"
    deployment_profile: Literal["OSIRIS_CONNECTED", "SPYS_AIRGAP"] = "SPYS_AIRGAP"

    # Directory holding connector manifest YAML files.
    connector_manifest_dir: Path = Path(__file__).resolve().parent / "connectors" / "manifests"
    # Directory holding per-connector secret files (one file per manifest secret key).
    connector_secret_dir: Path = Path("/run/secrets/connectors")

    # Global master switch. In SPYS_AIRGAP this MUST be false; enforced below.
    public_connectors_enabled: bool = False

    connector_max_retries: int = Field(default=5, ge=0, le=20)
    connector_circuit_failure_threshold: int = Field(default=5, ge=1, le=100)
    connector_circuit_reset_seconds: float = Field(default=30.0, ge=1.0, le=3600.0)

    raw_object_store_endpoint: str = ""
    raw_object_store_bucket: str = "kam-raw-observations"
    kafka_bootstrap_servers: str = ""

    prometheus_metrics_enabled: bool = True

    @field_validator("public_connectors_enabled")
    @classmethod
    def block_public_connectors_in_spys(cls, value: bool, info):  # type: ignore[no-untyped-def]
        profile = info.data.get("deployment_profile")
        if profile == "SPYS_AIRGAP" and value:
            raise ValueError("Public connectors cannot be enabled in the SPYS_AIRGAP profile")
        return value


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
