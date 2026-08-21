from __future__ import annotations

from datetime import UTC, datetime
from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.exc import SQLAlchemyError

from zellit_api.app import create_app
from zellit_api.config import DatasetIdentity, Settings
from zellit_api.repository import ZipCodeNotFound


class StubRepository:
    def __init__(self) -> None:
        self.ready = True
        self.error: Exception | None = None
        self.calls: list[tuple[str, int, int]] = []

    async def get_listings(self, session, zip_code: str, limit: int, offset: int):
        self.calls.append((zip_code, limit, offset))
        if self.error:
            raise self.error
        timestamp = datetime(2026, 1, 15, 12, 0, tzinfo=UTC)
        return {
            "zip_code": {
                "code": zip_code,
                "city": "Indianapolis",
                "state": "IN",
                "demographics": {
                    "population": 30000,
                    "households": 12000,
                    "median_age": 36,
                    "median_household_income": 68000,
                    "median_home_value": 248000,
                },
            },
            "market": {"listing_count": 60, "average_price": 100031},
            "pagination": {"limit": limit, "offset": offset, "returned": 1},
            "listings": [
                {
                    "id": offset + 1,
                    "street_address": "1 Example Street",
                    "price": 100001,
                    "bedrooms": 3,
                    "bathrooms": 2,
                    "square_feet": 1800,
                    "year_built": 2000,
                    "listed_at": timestamp,
                    "vote_score": 4,
                    "comment_count": 1,
                    "photos": [
                        {"position": 0, "url": "https://images.zellit.test/1/0"}
                    ],
                    "comments": [
                        {
                            "id": 1,
                            "author": "actor1",
                            "body": "Comment 0",
                            "created_at": timestamp,
                            "vote_score": 0,
                        }
                    ],
                }
            ],
        }

    async def is_ready(self, session, dataset: DatasetIdentity) -> bool:
        if self.error:
            raise self.error
        return self.ready


def settings() -> Settings:
    return Settings(
        "postgresql+asyncpg://postgres@localhost:55433/postgres",
        20,
        0,
        DatasetIdentity("1", "digest", {}),
    )


@pytest.fixture
def repository() -> StubRepository:
    return StubRepository()


@pytest.fixture
def client(repository: StubRepository):
    app = create_app(settings())
    with TestClient(app) as test_client:
        app.state.repository = repository
        yield test_client


def test_public_response_contract(client: TestClient, repository: StubRepository) -> None:
    response = client.get(
        "/api/v1/zip-codes/46201/listings?limit=20&offset=0"
    )

    assert response.status_code == 200
    body = response.json()
    assert set(body) == {"zip_code", "market", "pagination", "listings"}
    assert body["zip_code"]["code"] == "46201"
    assert set(body["listings"][0]) == {
        "id",
        "street_address",
        "price",
        "bedrooms",
        "bathrooms",
        "square_feet",
        "year_built",
        "listed_at",
        "vote_score",
        "comment_count",
        "photos",
        "comments",
    }
    assert repository.calls == [("46201", 20, 0)]


def test_defaults_and_offset(client: TestClient, repository: StubRepository) -> None:
    assert client.get("/api/v1/zip-codes/46201/listings").status_code == 200
    assert client.get(
        "/api/v1/zip-codes/46201/listings?limit=2&offset=20"
    ).status_code == 200
    assert repository.calls == [("46201", 20, 0), ("46201", 2, 20)]


@pytest.mark.parametrize(
    "query",
    ["limit=0", "limit=51", "offset=-1", "offset=200", "limit=nope"],
)
def test_invalid_pagination_is_422(client: TestClient, query: str) -> None:
    assert (
        client.get(f"/api/v1/zip-codes/46201/listings?{query}").status_code
        == 422
    )


@pytest.mark.parametrize("zipcode", ["1234", "123456", "12x45", "１２３４５"])
def test_invalid_zip_is_422(client: TestClient, zipcode: str) -> None:
    assert client.get(f"/api/v1/zip-codes/{zipcode}/listings").status_code == 422


def test_unknown_zip_is_stable_404(
    client: TestClient, repository: StubRepository
) -> None:
    repository.error = ZipCodeNotFound()

    response = client.get("/api/v1/zip-codes/99999/listings")

    assert response.status_code == 404
    assert response.json() == {"detail": "ZIP code not found"}


def test_health_contract(client: TestClient, repository: StubRepository) -> None:
    assert client.get("/health").json() == {"status": "ready"}

    repository.ready = False
    response = client.get("/health")

    assert response.status_code == 503
    assert response.json() == {"detail": "Zellit dataset is not ready"}


def test_health_database_failure_is_stable_503(
    client: TestClient, repository: StubRepository
) -> None:
    repository.error = SQLAlchemyError("down")

    response = client.get("/health")

    assert response.status_code == 503
    assert response.json() == {"detail": "Zellit dataset is not ready"}


def test_unexpected_listing_error_remains_500(repository: StubRepository) -> None:
    repository.error = ValueError("bug")
    app = create_app(settings())

    with TestClient(app, raise_server_exceptions=False) as test_client:
        app.state.repository = repository
        response = test_client.get("/api/v1/zip-codes/46201/listings")

    assert response.status_code == 500


def test_lifespan_disposes_engine(monkeypatch: pytest.MonkeyPatch) -> None:
    import zellit_api.app as app_module

    engine = type("FakeEngine", (), {"dispose": AsyncMock()})()
    monkeypatch.setattr(app_module, "build_engine", lambda configured: engine)
    monkeypatch.setattr(app_module, "build_session_factory", lambda value: object())
    app = app_module.create_app(settings())

    with TestClient(app):
        pass

    engine.dispose.assert_awaited_once()
