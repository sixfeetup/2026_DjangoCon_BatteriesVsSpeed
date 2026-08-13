from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from redis.exceptions import ConnectionError as RedisConnectionError

from zip_api.app import create_app
from zip_api.config import Settings
from zip_api.repository import StoredZipDataError, ZipEntry


class StubRepository:
    def __init__(self, entries=None, *, ready=True, error=None):
        self.entries = entries or []
        self.ready = ready
        self.error = error

    async def lookup(self, prefix: str, limit: int = 10):
        if self.error:
            raise self.error
        return self.entries[:limit]

    async def is_ready(self) -> bool:
        if self.error:
            raise self.error
        return self.ready


class FakeRedisClient:
    def __init__(self) -> None:
        self.closed = False

    def pipeline(self, transaction: bool = False):
        return self

    def ping(self):
        return self

    def zcard(self, key: str):
        return self

    def hgetall(self, key: str):
        return self

    async def execute(self):
        return True, 0, {}

    async def aclose(self) -> None:
        self.closed = True


def test_zip_lookup_contract() -> None:
    app = create_app(Settings("redis://unused", "data", "meta", 2, "sha"))
    with TestClient(app) as client:
        app.state.repository = StubRepository(
            [
                ZipEntry("46201", "Indianapolis"),
                ZipEntry("46202", "Indianapolis"),
            ]
        )
        response = client.get("/zip-codes", params={"q": "462"})

    assert response.status_code == 200
    assert response.json() == [
        {"zip": "46201", "city": "Indianapolis"},
        {"zip": "46202", "city": "Indianapolis"},
    ]


@pytest.mark.parametrize("query", ["", "123456", "12a", "１２３", "-1", "12 3"])
def test_zip_lookup_rejects_invalid_queries(query: str) -> None:
    app = create_app(Settings("redis://unused", "data", "meta", 2, "sha"))
    with TestClient(app) as client:
        app.state.repository = StubRepository()
        response = client.get("/zip-codes", params={"q": query})
    assert response.status_code == 422


def test_zip_lookup_missing_query_is_rejected() -> None:
    app = create_app(Settings("redis://unused", "data", "meta", 2, "sha"))
    with TestClient(app) as client:
        app.state.repository = StubRepository()
        response = client.get("/zip-codes")
    assert response.status_code == 422


@pytest.mark.parametrize("query", ["1", "12345"])
def test_zip_lookup_accepts_one_through_five_digits(query: str) -> None:
    app = create_app(Settings("redis://unused", "data", "meta", 2, "sha"))
    with TestClient(app) as client:
        app.state.repository = StubRepository([ZipEntry("46201", "Indianapolis")])
        response = client.get("/zip-codes", params={"q": query})
    assert response.status_code == 200


def test_zip_lookup_no_match_returns_empty_list() -> None:
    app = create_app(Settings("redis://unused", "data", "meta", 2, "sha"))
    with TestClient(app) as client:
        app.state.repository = StubRepository([])
        response = client.get("/zip-codes", params={"q": "462"})
    assert response.status_code == 200
    assert response.json() == []


def test_redis_failure_has_stable_503() -> None:
    app = create_app(Settings("redis://unused", "data", "meta", 2, "sha"))
    with TestClient(app) as client:
        app.state.repository = StubRepository(error=RedisConnectionError("down"))
        response = client.get("/zip-codes", params={"q": "462"})
    assert response.status_code == 503
    assert response.json() == {"detail": "ZIP lookup temporarily unavailable"}


def test_malformed_data_is_not_mislabeled_as_redis_failure() -> None:
    app = create_app(Settings("redis://unused", "data", "meta", 2, "sha"))
    with TestClient(app, raise_server_exceptions=False) as client:
        app.state.repository = StubRepository(error=StoredZipDataError("bad member"))
        response = client.get("/zip-codes", params={"q": "462"})
    assert response.status_code == 500


def test_health_reports_ready_and_not_ready() -> None:
    app = create_app(Settings("redis://unused", "data", "meta", 2, "sha"))
    with TestClient(app) as client:
        app.state.repository = StubRepository(ready=True)
        ready_response = client.get("/health")
        app.state.repository = StubRepository(ready=False)
        not_ready_response = client.get("/health")
    assert ready_response.status_code == 200
    assert ready_response.json() == {"status": "ready"}
    assert not_ready_response.status_code == 503
    assert not_ready_response.json() == {"detail": "ZIP dataset is not ready"}


def test_health_redis_failure_is_unavailable() -> None:
    app = create_app(Settings("redis://unused", "data", "meta", 2, "sha"))
    with TestClient(app) as client:
        app.state.repository = StubRepository(error=RedisConnectionError("down"))
        response = client.get("/health")
    assert response.status_code == 503
    assert response.json() == {"detail": "ZIP dataset is not ready"}


def test_lifespan_closes_redis_client(monkeypatch: pytest.MonkeyPatch) -> None:
    import importlib

    app_module = importlib.import_module("zip_api.app")

    fake_redis = FakeRedisClient()
    monkeypatch.setattr(app_module.Redis, "from_url", lambda *args, **kwargs: fake_redis)
    monkeypatch.setattr(app_module.Settings, "from_env", classmethod(lambda cls: Settings("redis://unused", "data", "meta", 2, "sha")))

    app = app_module.create_app()
    with TestClient(app):
        pass

    assert fake_redis.closed is True
