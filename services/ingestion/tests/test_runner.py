from __future__ import annotations

import pytest

from app.connectors.runner import ListSink
from app.connectors.samples import FlakyConnector, SyntheticSampleConnector
from app.connectors.state import ConnectorState
from tests.conftest import make_manifest, make_runner

pytestmark = pytest.mark.asyncio


async def test_happy_path_emits_and_dedups_on_replay() -> None:
    m = make_manifest(id="synthetic_sample")
    runner = make_runner([m])
    conn = SyntheticSampleConnector(m, records=2)
    sink = ListSink()

    first = await runner.run_once("synthetic_sample", conn, tenant_id="t-1", sink=sink)
    assert first.state == ConnectorState.ACTIVE
    assert first.emitted == 2
    assert len(sink.records) == 2
    assert all(r["is_synthetic"] for r in sink.records)

    # Re-running the same records emits nothing new (idempotent replay).
    second = await runner.run_once("synthetic_sample", conn, tenant_id="t-1", sink=sink)
    assert second.emitted == 0
    assert second.deduplicated == 2
    assert len(sink.records) == 2


async def test_missing_secret_is_configuration_required() -> None:
    m = make_manifest(
        id="needs_key",
        auth_type="api_key",
        required_secrets=["needs_key_api_key"],
        requires_public_network=True,
    )
    runner = make_runner([m], secret_available=lambda _s: False)
    result = await runner.run_once("needs_key", SyntheticSampleConnector(m), tenant_id="t-1")
    assert result.state == ConnectorState.CONFIGURATION_REQUIRED
    assert result.skipped is True
    assert runner.status("needs_key").missing_configuration == ["needs_key_api_key"]


async def test_public_connector_disabled_in_airgap() -> None:
    m = make_manifest(id="public_one", requires_public_network=True)
    runner = make_runner([m], profile="SPYS_AIRGAP", public_enabled=False)
    result = await runner.run_once("public_one", SyntheticSampleConnector(m), tenant_id="t-1")
    assert result.state == ConnectorState.DISABLED
    assert result.skipped is True


async def test_retry_recovers_transient_failure() -> None:
    m = make_manifest(id="flaky")
    runner = make_runner([m], max_retries=5)
    conn = FlakyConnector(m, fail_times=2)  # fails twice, then succeeds within retries
    result = await runner.run_once("flaky", conn, tenant_id="t-1")
    assert result.state == ConnectorState.ACTIVE
    assert result.emitted == 1
    assert conn.calls == 3


async def test_circuit_opens_after_repeated_failures() -> None:
    m = make_manifest(id="down", circuit_failure_threshold=3)
    runner = make_runner([m], max_retries=0, failure_threshold=10, reset_timeout_seconds=30)
    conn = FlakyConnector(m, fail_times=999)

    for _ in range(3):
        await runner.run_once("down", conn, tenant_id="t-1", now=0.0)
    # Breaker has tripped; the next cycle is short-circuited without calling fetch.
    calls_before = conn.calls
    result = await runner.run_once("down", conn, tenant_id="t-1", now=1.0)
    assert result.state == ConnectorState.CIRCUIT_OPEN
    assert result.skipped is True
    assert conn.calls == calls_before  # provider was not called


async def test_rate_limit_sets_rate_limited_state() -> None:
    m = make_manifest(id="limited")
    runner = make_runner([m], failure_threshold=10)
    conn = FlakyConnector(m, fail_times=0, rate_limit_after=0)
    result = await runner.run_once("limited", conn, tenant_id="t-1")
    assert result.state == ConnectorState.RATE_LIMITED
