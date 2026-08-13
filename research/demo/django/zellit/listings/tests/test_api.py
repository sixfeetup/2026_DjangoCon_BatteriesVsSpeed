from __future__ import annotations

import pytest

pytestmark = pytest.mark.django_db


def test_public_exact_response_contract(client, api_data):
    response = client.get("/api/v1/zip-codes/46201/listings?limit=20&offset=0")
    assert response.status_code == 200
    body = response.json()
    assert set(body) == {"zip_code", "market", "pagination", "listings"}
    assert body["zip_code"] == {"code": "46201", "city": "Indianapolis", "state": "IN", "demographics": {"population": 30000, "households": 12000, "median_age": 36, "median_household_income": 68000, "median_home_value": 248000}}
    assert body["market"] == {"listing_count": 60, "average_price": 100031}
    assert body["pagination"] == {"limit": 20, "offset": 0, "returned": 20}
    assert [item["id"] for item in body["listings"]] == api_data[:20]
    first = body["listings"][0]
    assert set(first) == {"id", "street_address", "price", "bedrooms", "bathrooms", "square_feet", "year_built", "listed_at", "vote_score", "comment_count", "photos", "comments"}
    assert first["vote_score"] == 4 and first["comment_count"] == 3
    assert [photo["position"] for photo in first["photos"]] == [0, 1, 2, 3]
    assert len(first["comments"]) == 3
    assert all(comment["vote_score"] == 0 for comment in first["comments"])


def test_defaults_and_offset(client, api_data):
    default = client.get("/api/v1/zip-codes/46201/listings").json()
    assert default["pagination"] == {"limit": 20, "offset": 0, "returned": 20}
    page = client.get("/api/v1/zip-codes/46201/listings?limit=2&offset=20").json()
    assert [item["id"] for item in page["listings"]] == api_data[20:22]


@pytest.mark.parametrize("query", ["limit=0", "limit=51", "offset=-1", "offset=200", "limit=nope"])
def test_invalid_pagination_is_422(client, api_data, query):
    assert client.get(f"/api/v1/zip-codes/46201/listings?{query}").status_code == 422


@pytest.mark.parametrize("zipcode", ["1234", "123456", "12x45", "１２３４５"])
def test_invalid_zip_is_422(client, api_data, zipcode):
    assert client.get(f"/api/v1/zip-codes/{zipcode}/listings").status_code == 422


def test_unknown_zip_is_stable_404(client, api_data):
    response = client.get("/api/v1/zip-codes/99999/listings")
    assert response.status_code == 404
    assert response.json() == {"detail": "ZIP code not found"}
