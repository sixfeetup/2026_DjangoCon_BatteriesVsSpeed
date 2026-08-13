from __future__ import annotations

import pytest
from django.utils import timezone

from listings.models import DatasetMetadata

pytestmark = pytest.mark.django_db

COUNTS = {"zip_codes": 500, "actors": 20000, "listings": 100000, "photos": 400000, "comments": 300000, "listing_votes": 800000, "comment_votes": 600000}


@pytest.fixture
def readiness_env(monkeypatch):
    monkeypatch.setenv("ZELLIT_DATASET_SCHEMA_VERSION", "1")
    monkeypatch.setenv("ZELLIT_DATASET_DIGEST", "a" * 64)
    for key, value in COUNTS.items():
        monkeypatch.setenv(f"ZELLIT_EXPECTED_{key.upper()}", str(value))


def test_ready_metadata(client, readiness_env):
    DatasetMetadata.objects.create(schema_version="1", generator_version="1", seed=20260813, dataset_digest="a" * 64, row_counts=COUNTS, generated_at=timezone.now(), loaded_at=timezone.now())
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ready"}


def test_missing_or_mismatched_metadata_is_stable_503(client, readiness_env):
    response = client.get("/health")
    assert response.status_code == 503
    assert response.json() == {"detail": "Zellit dataset is not ready"}
    DatasetMetadata.objects.create(schema_version="wrong", generator_version="1", seed=20260813, dataset_digest="a" * 64, row_counts=COUNTS, generated_at=timezone.now(), loaded_at=timezone.now())
    response = client.get("/health")
    assert response.status_code == 503
    assert response.json() == {"detail": "Zellit dataset is not ready"}
