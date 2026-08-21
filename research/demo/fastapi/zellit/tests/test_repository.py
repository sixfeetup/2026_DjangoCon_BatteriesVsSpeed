from __future__ import annotations

from datetime import datetime, timezone

import pytest
from sqlalchemy import event, insert

from zellit_api.config import DatasetIdentity
from zellit_api.models import DatasetMetadata
from zellit_api.repository import ZellitRepository, ZipCodeNotFound

pytestmark = pytest.mark.integration


@pytest.mark.parametrize("limit", [1, 20, 50])
async def test_success_uses_exactly_five_queries(
    db_session, api_data, limit: int
) -> None:
    statements: list[str] = []
    engine = db_session.bind

    def record(*args) -> None:
        statements.append(args[2])

    event.listen(engine.sync_engine, "after_cursor_execute", record)
    try:
        payload = await ZellitRepository().get_listings(
            db_session, "46201", limit, 0
        )
    finally:
        event.remove(engine.sync_engine, "after_cursor_execute", record)

    assert len(statements) == 5
    assert len(payload["listings"]) == limit
    assert "zellit_zip_code" in statements[0]
    assert "avg" in statements[1].lower()
    assert "zellit_listing_vote" in statements[2]
    assert "zellit_comment" in statements[2]
    assert "zellit_photo" in statements[3]
    assert "zellit_comment_vote" in statements[4]
    assert "zellit_actor" in statements[4]


async def test_repository_returns_exact_ordered_values(db_session, api_data) -> None:
    body = await ZellitRepository().get_listings(db_session, "46201", 20, 20)

    assert body["zip_code"] == {
        "code": "46201",
        "city": "Indianapolis",
        "state": "IN",
        "demographics": {
            "population": 30000,
            "households": 12000,
            "median_age": 36,
            "median_household_income": 68000,
            "median_home_value": 248000,
        },
    }
    assert body["market"] == {"listing_count": 60, "average_price": 100031}
    assert body["pagination"] == {"limit": 20, "offset": 20, "returned": 20}
    assert [item["id"] for item in body["listings"]] == list(range(21, 41))
    first = body["listings"][0]
    assert first["vote_score"] == 4
    assert first["comment_count"] == 3
    assert [photo["position"] for photo in first["photos"]] == [0, 1, 2, 3]
    assert [comment["vote_score"] for comment in first["comments"]] == [0, 0, 0]
    assert [comment["author"] for comment in first["comments"]] == [
        "actor1",
        "actor2",
        "actor3",
    ]


async def test_known_zip_empty_page_still_uses_five_queries(
    db_session, api_data
) -> None:
    statements: list[str] = []
    engine = db_session.bind

    def record(*args) -> None:
        statements.append(args[2])

    event.listen(engine.sync_engine, "after_cursor_execute", record)
    try:
        body = await ZellitRepository().get_listings(db_session, "46201", 20, 199)
    finally:
        event.remove(engine.sync_engine, "after_cursor_execute", record)

    assert len(statements) == 5
    assert body["listings"] == []
    assert body["pagination"]["returned"] == 0


async def test_unknown_zip_raises_stable_domain_error(db_session, api_data) -> None:
    with pytest.raises(ZipCodeNotFound):
        await ZellitRepository().get_listings(db_session, "99999", 20, 0)


async def test_readiness_requires_exact_metadata(db_session) -> None:
    counts = {"zip_codes": 500, "listings": 100000}
    identity = DatasetIdentity("1", "digest", counts)
    repository = ZellitRepository()

    assert await repository.is_ready(db_session, identity) is False

    now = datetime.now(timezone.utc)
    await db_session.execute(
        insert(DatasetMetadata).values(
            id=1,
            schema_version="1",
            generator_version="1",
            seed=20260813,
            dataset_digest="digest",
            row_counts=counts,
            generated_at=now,
            loaded_at=now,
        )
    )
    await db_session.commit()

    assert await repository.is_ready(db_session, identity) is True
    wrong = DatasetIdentity("1", "wrong", counts)
    assert await repository.is_ready(db_session, wrong) is False
