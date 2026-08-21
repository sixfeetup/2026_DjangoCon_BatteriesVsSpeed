from __future__ import annotations

import pytest

from zellit_api.config import Settings

DATASET_ENV = {
    "ZELLIT_DATASET_SCHEMA_VERSION": "1",
    "ZELLIT_DATASET_DIGEST": "d631bfe327777c65a45098f536c9124c822a854480352e5f4564ce62946f3862",
    "ZELLIT_EXPECTED_ZIP_CODES": "500",
    "ZELLIT_EXPECTED_ACTORS": "20000",
    "ZELLIT_EXPECTED_LISTINGS": "100000",
    "ZELLIT_EXPECTED_PHOTOS": "400000",
    "ZELLIT_EXPECTED_COMMENTS": "300000",
    "ZELLIT_EXPECTED_LISTING_VOTES": "800000",
    "ZELLIT_EXPECTED_COMMENT_VOTES": "600000",
}


def apply_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DATABASE_URL", "postgresql+asyncpg://postgres@db/postgres")
    for name, value in DATASET_ENV.items():
        monkeypatch.setenv(name, value)


def test_settings_load_exact_runtime_contract(monkeypatch: pytest.MonkeyPatch) -> None:
    apply_environment(monkeypatch)

    settings = Settings.from_env()

    assert settings.database_url == "postgresql+asyncpg://postgres@db/postgres"
    assert settings.pool_size == 20
    assert settings.max_overflow == 0
    assert settings.dataset.schema_version == "1"
    assert settings.dataset.row_counts == {
        "zip_codes": 500,
        "actors": 20000,
        "listings": 100000,
        "photos": 400000,
        "comments": 300000,
        "listing_votes": 800000,
        "comment_votes": 600000,
    }


@pytest.mark.parametrize(
    "missing",
    [
        "ZELLIT_DATASET_SCHEMA_VERSION",
        "ZELLIT_DATASET_DIGEST",
        "ZELLIT_EXPECTED_LISTINGS",
    ],
)
def test_settings_require_dataset_identity(
    monkeypatch: pytest.MonkeyPatch, missing: str
) -> None:
    apply_environment(monkeypatch)
    monkeypatch.delenv(missing)

    with pytest.raises(ValueError, match=missing):
        Settings.from_env()


@pytest.mark.parametrize(
    ("name", "value"),
    [("DB_POOL_SIZE", "0"), ("DB_POOL_SIZE", "21"), ("DB_MAX_OVERFLOW", "1")],
)
def test_settings_reject_runtime_drift(
    monkeypatch: pytest.MonkeyPatch, name: str, value: str
) -> None:
    apply_environment(monkeypatch)
    monkeypatch.setenv(name, value)

    with pytest.raises(ValueError, match=name):
        Settings.from_env()
