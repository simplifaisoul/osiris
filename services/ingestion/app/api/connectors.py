from __future__ import annotations

from fastapi import APIRouter, Request

from app.connectors.state import ConnectorStatus
from app.errors import DomainError


router = APIRouter(prefix="/connectors", tags=["connectors"])


def _runner(request: Request):
    runner = getattr(request.app.state, "runner", None)
    if runner is None:
        raise DomainError(
            code="REGISTRY_UNAVAILABLE",
            message="Connector registry is not loaded",
            status_code=503,
        )
    return runner


@router.get("", response_model=list[ConnectorStatus])
async def list_connectors(request: Request) -> list[ConnectorStatus]:
    """List every connector with its resolved state and configuration gaps.

    A connector with a missing secret is reported as CONFIGURATION_REQUIRED and is
    never presented as ACTIVE.
    """
    return _runner(request).statuses()


@router.get("/{connector_id}", response_model=ConnectorStatus)
async def get_connector(connector_id: str, request: Request) -> ConnectorStatus:
    runner = _runner(request)
    try:
        return runner.status(connector_id)
    except KeyError as exc:
        raise DomainError(
            code="CONNECTOR_NOT_FOUND",
            message=f"No connector with id '{connector_id}'",
            status_code=404,
        ) from exc
