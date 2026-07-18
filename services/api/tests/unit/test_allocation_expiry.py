from __future__ import annotations

from datetime import date, timedelta

from app.config import Settings
from app.domain.services import allocation_expiry


def test_allocation_expiry_notification_boundaries() -> None:
    settings = Settings(
        environment="test",
        auth_required=False,
        database_url="sqlite+aiosqlite:///:memory:",
        audit_hmac_key="synthetic-test-key",
        demat_yellow_days=92,
        demat_red_days=31,
    )
    today = date(2026, 7, 18)

    assert allocation_expiry(today + timedelta(days=93), today, settings).level == "NORMAL"
    assert allocation_expiry(today + timedelta(days=92), today, settings).level == "YELLOW"
    assert allocation_expiry(today + timedelta(days=32), today, settings).level == "YELLOW"
    assert allocation_expiry(today + timedelta(days=31), today, settings).level == "RED"
    assert allocation_expiry(today, today, settings).level == "RED"
    assert allocation_expiry(today - timedelta(days=1), today, settings).level == "OVERDUE"


def test_normal_allocation_does_not_request_notification() -> None:
    settings = Settings(
        environment="test",
        auth_required=False,
        database_url="sqlite+aiosqlite:///:memory:",
        audit_hmac_key="synthetic-test-key",
    )
    today = date(2026, 7, 18)

    result = allocation_expiry(today + timedelta(days=93), today, settings)

    assert result.days_remaining == 93
    assert result.notification_required is False
