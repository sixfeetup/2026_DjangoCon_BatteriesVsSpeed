from __future__ import annotations

import json
from pathlib import Path

import pytest

from zellit_data.config import DatasetSpec


@pytest.fixture
def reduced(tmp_path: Path):
    spec_data = {
        "schema_version": "test-1",
        "generator_version": "test-1",
        "seed": 20260813,
        "base_timestamp": "2026-01-15T12:00:00Z",
        "counts": {"zip_codes": 2, "actors": 20, "listings": 6, "photos": 12, "comments": 12, "listing_votes": 24, "comment_votes": 24},
        "per_parent": {"listings_per_zip": 3, "photos_per_listing": 2, "comments_per_listing": 2, "listing_votes_per_listing": 4, "comment_votes_per_comment": 2},
        "field_limits": {"city": 100, "handle": 50, "display_name": 100, "street_address": 150, "comment_body": 500, "photo_url": 250},
    }
    spec_path = tmp_path / "spec.json"
    spec_path.write_text(json.dumps(spec_data))
    zip_path = tmp_path / "zips.csv"
    zip_path.write_text("code,city,state\n46201,Indianapolis,IN\n90210,Beverly Hills,CA\n")
    return DatasetSpec.load(spec_path), zip_path
