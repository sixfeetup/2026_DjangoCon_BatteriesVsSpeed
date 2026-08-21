from __future__ import annotations

import pytest
from django.test import Client
from redis.exceptions import ConnectionError as RedisConnectionError

from zip_codes import service
from zip_codes.repository import StoredZipDataError
from zip_codes.repository import ZipEntry


class StubRepository:
    def __init__(self, entries=None, *, ready=True, error=None):
        self.entries = entries or []
        self.ready = ready
        self.error = error

    def lookup(self, prefix: str, limit: int = 10):
        if self.error:
            raise self.error
        return self.entries[:limit]

    def is_ready(self) -> bool:
        if self.error:
            raise self.error
        return self.ready


def use_repository(monkeypatch: pytest.MonkeyPatch, repository) -> None:
    monkeypatch.setattr(service, "get_repository", lambda: repository)


def test_zip_lookup_contract(client, monkeypatch) -> None:
    use_repository(
        monkeypatch,
        StubRepository(
            [
                ZipEntry("46201", "Indianapolis"),
                ZipEntry("46202", "Indianapolis"),
            ]
        ),
    )

    response = client.get("/zip-codes", {"q": "462"})

    assert response.status_code == 200
    assert response.json() == [
        {"zip": "46201", "city": "Indianapolis"},
        {"zip": "46202", "city": "Indianapolis"},
    ]


@pytest.mark.parametrize("query", ["", "123456", "12a", "１２３", "-1", "12 3"])
def test_zip_lookup_rejects_invalid_queries(client, monkeypatch, query: str) -> None:
    use_repository(monkeypatch, StubRepository())
    response = client.get("/zip-codes", {"q": query})
    assert response.status_code == 422


def test_zip_lookup_missing_query_is_rejected(client, monkeypatch) -> None:
    use_repository(monkeypatch, StubRepository())
    response = client.get("/zip-codes")
    assert response.status_code == 422


@pytest.mark.parametrize("query", ["1", "12345"])
def test_zip_lookup_accepts_one_through_five_digits(
    client, monkeypatch, query: str
) -> None:
    use_repository(monkeypatch, StubRepository([ZipEntry("46201", "Indianapolis")]))
    response = client.get("/zip-codes", {"q": query})
    assert response.status_code == 200


def test_zip_lookup_no_match_returns_empty_list(client, monkeypatch) -> None:
    use_repository(monkeypatch, StubRepository([]))
    response = client.get("/zip-codes", {"q": "462"})
    assert response.status_code == 200
    assert response.json() == []


def test_redis_failure_has_stable_503(client, monkeypatch) -> None:
    use_repository(monkeypatch, StubRepository(error=RedisConnectionError("down")))
    response = client.get("/zip-codes", {"q": "462"})
    assert response.status_code == 503
    assert response.json() == {"detail": "ZIP lookup temporarily unavailable"}


def test_malformed_data_is_not_mislabeled_as_redis_failure(monkeypatch) -> None:
    use_repository(monkeypatch, StubRepository(error=StoredZipDataError("bad member")))
    response = Client(raise_request_exception=False).get("/zip-codes", {"q": "462"})
    assert response.status_code == 500


def test_health_reports_ready_and_not_ready(client, monkeypatch) -> None:
    use_repository(monkeypatch, StubRepository(ready=True))
    ready_response = client.get("/health")
    use_repository(monkeypatch, StubRepository(ready=False))
    not_ready_response = client.get("/health")
    assert ready_response.status_code == 200
    assert ready_response.json() == {"status": "ready"}
    assert not_ready_response.status_code == 503
    assert not_ready_response.json() == {"detail": "ZIP dataset is not ready"}


def test_health_redis_failure_is_unavailable(client, monkeypatch) -> None:
    use_repository(monkeypatch, StubRepository(error=RedisConnectionError("down")))
    response = client.get("/health")
    assert response.status_code == 503
    assert response.json() == {"detail": "ZIP dataset is not ready"}
