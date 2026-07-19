from __future__ import annotations

import time
import uuid

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from prometheus_client import CONTENT_TYPE_LATEST, Counter, Histogram, generate_latest
from starlette.responses import Response

from app.api import connectors, health
from app.config import get_settings
from app.connectors.registry import build_runner
from app.errors import DomainError, domain_error_handler, validation_error_handler


REQUESTS = Counter(
    "kam_ingestion_http_requests_total", "HTTP requests", ["method", "path", "status"]
)
LATENCY = Histogram(
    "kam_ingestion_http_request_seconds", "HTTP request latency", ["method", "path"]
)


def create_app() -> FastAPI:
    app = FastAPI(
        title="KAM Ingestion Service",
        version="0.1.0",
        openapi_version="3.1.0",
        docs_url=None,
        redoc_url=None,
    )
    app.add_exception_handler(DomainError, domain_error_handler)  # type: ignore[arg-type]
    app.add_exception_handler(RequestValidationError, validation_error_handler)  # type: ignore[arg-type]

    settings = get_settings()
    # Fail fast: a malformed manifest raises here and the Pod never becomes ready.
    app.state.runner = build_runner(settings)

    @app.middleware("http")
    async def request_context(request: Request, call_next):  # type: ignore[no-untyped-def]
        correlation_id = request.headers.get("x-correlation-id") or str(uuid.uuid4())
        request.state.correlation_id = correlation_id
        started = time.perf_counter()
        response = await call_next(request)
        elapsed = time.perf_counter() - started
        route = request.scope.get("route")
        route_path = getattr(route, "path", request.url.path)
        REQUESTS.labels(request.method, route_path, str(response.status_code)).inc()
        LATENCY.labels(request.method, route_path).observe(elapsed)
        response.headers["x-correlation-id"] = correlation_id
        response.headers["cache-control"] = "no-store"
        response.headers["x-content-type-options"] = "nosniff"
        response.headers["x-frame-options"] = "DENY"
        response.headers["referrer-policy"] = "no-referrer"
        return response

    @app.get("/metrics", include_in_schema=False)
    async def metrics() -> Response:
        return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)

    app.include_router(health.router)
    app.include_router(connectors.router)
    return app


app = create_app()
