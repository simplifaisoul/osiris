from __future__ import annotations

from fastapi import Request

from app.security.principal import Principal


def request_audit_context(request: Request, principal: Principal) -> dict[str, str]:
    client_ip = request.client.host if request.client else "unknown"
    return {
        "user_id": principal.subject,
        # Uvicorn resolves proxy headers only from configured trusted proxies;
        # never trust a caller-provided X-Forwarded-For value here directly.
        "ip_address": client_ip,
        "device": principal.device_id or request.headers.get("user-agent", "unknown"),
        "correlation_id": str(request.state.correlation_id),
    }
