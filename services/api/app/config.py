from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy.engine import make_url


class Settings(BaseSettings):
    """Runtime configuration. Security-sensitive defaults fail closed."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    environment: Literal["development", "test", "training", "production"] = "production"
    deployment_profile: Literal["OSIRIS_CONNECTED", "SPYS_AIRGAP"] = "SPYS_AIRGAP"
    database_url: str = "postgresql+asyncpg://kam_app@postgres:5432/kam"
    database_password_file: Path = Path("/run/secrets/postgres_password")
    required_schema_revision: str = "0001_foundation"
    auth_required: bool = True
    oidc_issuer: str = ""
    oidc_jwks_url: str = ""
    oidc_audience: str = "kam-multi-int"
    oidc_jwks_cache_seconds: int = Field(default=300, ge=30, le=3600)
    oidc_clock_skew_seconds: int = Field(default=30, ge=0, le=120)
    oidc_mfa_required: bool = True
    oidc_mfa_amr_value: str = "mfa"
    oidc_mfa_acr_values: str = ""
    oidc_device_claim: str = "device_id"
    audit_hmac_key_file: Path = Path("/run/secrets/audit_hmac_key")
    audit_retention_years: int = Field(default=5, ge=5, le=100)
    default_timezone: str = "Europe/Istanbul"
    classification_default: str = "UNCLASSIFIED"
    public_connectors_enabled: bool = False
    demat_yellow_days: int = Field(default=92, ge=32, le=366)
    demat_red_days: int = Field(default=31, ge=1, le=91)
    currency_scale: int = Field(default=4, ge=0, le=8)

    @field_validator("public_connectors_enabled")
    @classmethod
    def block_public_connectors_in_spys(cls, value: bool, info):  # type: ignore[no-untyped-def]
        profile = info.data.get("deployment_profile")
        if profile == "SPYS_AIRGAP" and value:
            raise ValueError("Public connectors cannot be enabled in SPYS_AIRGAP profile")
        return value

    def validate_security_prerequisites(self) -> list[str]:
        errors: list[str] = []
        if self.auth_required and (
            not self.oidc_issuer or not self.oidc_jwks_url or not self.oidc_audience
        ):
            errors.append("OIDC issuer, JWKS URL, and audience are required when authentication is enabled")
        if self.auth_required and self.oidc_mfa_required and not (
            self.oidc_mfa_amr_value.strip() or self.oidc_mfa_acr_values.strip()
        ):
            errors.append("At least one MFA AMR or ACR value is required")
        if self.auth_required and not self.oidc_device_claim.strip():
            errors.append("An institution IAM device claim name is required")
        if self.environment == "production" and not self.audit_hmac_key_file.is_file():
            errors.append("Audit HMAC key file is unavailable")
        if (
            self.environment == "production"
            and self.database_url.startswith("postgresql")
            and not self.database_password_file.is_file()
        ):
            errors.append("Database password file is unavailable")
        return errors

    def resolved_database_url(self) -> str:
        url = make_url(self.database_url)
        if not url.drivername.startswith("postgresql") or url.password:
            return self.database_url
        try:
            password = self.database_password_file.read_text(encoding="utf-8").strip()
        except OSError as exc:
            raise RuntimeError("Database password file cannot be read") from exc
        if not password:
            raise RuntimeError("Database password file is empty")
        return url.set(password=password).render_as_string(hide_password=False)

    def read_audit_key(self) -> bytes:
        try:
            key = self.audit_hmac_key_file.read_bytes().strip()
        except OSError as exc:
            raise RuntimeError("Audit key file cannot be read") from exc
        if len(key) < 32:
            raise RuntimeError("Audit HMAC key must contain at least 32 bytes")
        return key


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
