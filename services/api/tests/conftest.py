from __future__ import annotations

from collections.abc import AsyncIterator
from pathlib import Path

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy import text

from app.config import Settings, get_settings
from app.db import Base, get_session
from app.domain import models  # noqa: F401
from app.main import create_app


@pytest.fixture
def audit_key_file(tmp_path: Path) -> Path:
    path = tmp_path / "audit_hmac_key"
    path.write_bytes(b"foundation-test-audit-key-32-bytes-minimum")
    return path


@pytest.fixture
def database_url(tmp_path: Path) -> str:
    return f"sqlite+aiosqlite:///{tmp_path / 'foundation.db'}"


@pytest.fixture
def test_settings(audit_key_file: Path, database_url: str) -> Settings:
    return Settings(
        environment="test",
        deployment_profile="SPYS_AIRGAP",
        database_url=database_url,
        auth_required=False,
        audit_hmac_key_file=audit_key_file,
    )


@pytest_asyncio.fixture
async def session_factory(database_url: str):  # type: ignore[no-untyped-def]
    engine = create_async_engine(database_url)
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
        await connection.execute(text("CREATE TABLE alembic_version (version_num VARCHAR(32) NOT NULL)"))
        await connection.execute(
            text("INSERT INTO alembic_version (version_num) VALUES ('0001_foundation')")
        )
    yield factory
    await engine.dispose()


@pytest_asyncio.fixture
async def client(test_settings: Settings, session_factory) -> AsyncIterator[AsyncClient]:  # type: ignore[no-untyped-def]
    app = create_app()

    async def override_session() -> AsyncIterator[AsyncSession]:
        async with session_factory() as session:
            yield session

    app.dependency_overrides[get_session] = override_session
    app.dependency_overrides[get_settings] = lambda: test_settings
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as http_client:
        yield http_client
