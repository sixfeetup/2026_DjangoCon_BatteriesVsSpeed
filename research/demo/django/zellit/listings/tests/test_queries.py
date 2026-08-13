from __future__ import annotations

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext

from listings.schemas import ListingsResponseSchema
from listings.selectors import listings_for_zip

pytestmark = pytest.mark.django_db


@pytest.mark.parametrize("limit", [1, 20, 50])
def test_selector_uses_exactly_five_queries(api_data, limit):
    with CaptureQueriesContext(connection) as captured:
        payload = listings_for_zip("46201", limit, 0)
    assert len(captured) == 5
    sql = [query["sql"] for query in captured]
    assert "zellit_zip_code" in sql[0]
    assert "AVG" in sql[1] and "zellit_listing" in sql[1]
    assert "zellit_listing_vote" in sql[2] and "zellit_comment" in sql[2]
    assert "zellit_photo" in sql[3]
    assert "zellit_comment_vote" in sql[4] and "zellit_actor" in sql[4]
    assert len(payload["listings"]) == limit


def test_schema_serialization_performs_no_queries(api_data):
    payload = listings_for_zip("46201", 20, 0)
    with CaptureQueriesContext(connection) as captured:
        serialized = ListingsResponseSchema.model_validate(payload).model_dump(mode="json")
    assert len(captured) == 0
    assert len(serialized["listings"]) == 20
