from __future__ import annotations

from collections.abc import Iterator
import os
from pathlib import Path
import subprocess

import pytest

ROOT = Path(__file__).resolve().parents[1]


@pytest.fixture(scope="session")
def test_database_url() -> str:
    return os.getenv(
        "TEST_DATABASE_URL",
        "postgresql+asyncpg://postgres@localhost:55433/postgres",
    )


@pytest.fixture(scope="session")
def migrated_database(test_database_url: str) -> Iterator[str]:
    environment = {**os.environ, "DATABASE_URL": test_database_url}
    subprocess.run(
        ["uv", "run", "alembic", "downgrade", "base"],
        cwd=ROOT,
        env=environment,
        check=True,
    )
    subprocess.run(
        ["uv", "run", "alembic", "upgrade", "head"],
        cwd=ROOT,
        env=environment,
        check=True,
    )
    yield test_database_url
