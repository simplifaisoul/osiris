from __future__ import annotations

from datetime import date
from decimal import Decimal

import pytest
from pydantic import ValidationError

from app.domain.schemas import CurrencyConversionRequest
from app.domain.services import convert_currency


def test_decimal_conversion_uses_bankers_rounding() -> None:
    request = CurrencyConversionRequest(
        amount=Decimal("0.1") + Decimal("0.2"),
        source_currency="USD",
        target_currency="TRY",
        rate=Decimal("32.12345678"),
        rate_date=date(2026, 7, 18),
    )
    result = convert_currency(request, scale=4)
    assert result.source_amount == Decimal("0.3")
    assert result.converted_amount == Decimal("9.6370")
    assert result.rounding == "ROUND_HALF_EVEN"


def test_zero_or_negative_rate_is_rejected() -> None:
    with pytest.raises(ValidationError):
        CurrencyConversionRequest(
            amount=Decimal("10"),
            source_currency="USD",
            target_currency="TRY",
            rate=Decimal("0"),
            rate_date=date(2026, 7, 18),
        )

