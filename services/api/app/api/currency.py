from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, Query

from app.config import Settings, get_settings
from app.domain.schemas import (
    AllocationExpiryResponse,
    CurrencyConversionRequest,
    CurrencyConversionResponse,
)
from app.domain.services import allocation_expiry, convert_currency
from app.security.policy import require_roles
from app.security.principal import Principal


router = APIRouter(prefix="/v1/foundation", tags=["foundation-rules"])


@router.post("/currency/convert", response_model=CurrencyConversionResponse)
async def currency_convert(
    payload: CurrencyConversionRequest,
    _principal: Principal = Depends(require_roles("spys.viewer", "spys.editor", "kam.admin")),
    settings: Settings = Depends(get_settings),
) -> CurrencyConversionResponse:
    return convert_currency(payload, settings.currency_scale)


@router.get("/allocations/expiry", response_model=AllocationExpiryResponse)
async def allocation_expiry_status(
    due_at: date = Query(),
    as_of: date = Query(),
    _principal: Principal = Depends(require_roles("spys.viewer", "spys.editor", "kam.admin")),
    settings: Settings = Depends(get_settings),
) -> AllocationExpiryResponse:
    return allocation_expiry(due_at, as_of, settings)

