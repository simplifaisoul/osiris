from __future__ import annotations

import pytest

from app.errors import DomainError
from app.security.policy import enforce_classification, enforce_tenant
from app.security.principal import Principal


def principal() -> Principal:
    return Principal(
        subject="analyst-1",
        tenant_id="tenant-a",
        display_name="Analyst",
        roles=frozenset({"kam.analyst"}),
        classifications=frozenset({"CONFIDENTIAL"}),
        device_id="device-1",
    )


def test_tenant_and_classification_happy_path() -> None:
    enforce_tenant(principal(), "tenant-a")
    enforce_classification(principal(), "CONFIDENTIAL")


def test_cross_tenant_and_excess_classification_are_denied() -> None:
    with pytest.raises(DomainError, match="Cross-tenant"):
        enforce_tenant(principal(), "tenant-b")
    with pytest.raises(DomainError, match="clearance"):
        enforce_classification(principal(), "SECRET")

