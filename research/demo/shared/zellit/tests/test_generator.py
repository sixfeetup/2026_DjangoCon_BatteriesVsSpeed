from __future__ import annotations

import csv
import json
from pathlib import Path

import pytest

from zellit_data.config import DatasetSpec
from zellit_data.generator import generate


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


def rows(path: Path) -> list[dict[str, str]]:
    with path.open(newline="") as stream:
        return list(csv.DictReader(stream))


def test_generation_is_byte_deterministic(reduced, tmp_path):
    spec, zip_path = reduced
    first, second = tmp_path / "first", tmp_path / "second"
    one = generate(spec, first, zip_path)
    two = generate(spec, second, zip_path)
    assert one == two
    for name in one["files"]:
        assert (first / name).read_bytes() == (second / name).read_bytes()


def test_counts_relationships_and_stable_order(reduced, tmp_path):
    spec, zip_path = reduced
    output = tmp_path / "generated"
    manifest = generate(spec, output, zip_path)
    assert {name.removesuffix(".csv"): item["rows"] for name, item in manifest["files"].items()} == spec.counts
    listings = rows(output / "listings.csv")
    photos = rows(output / "photos.csv")
    comments = rows(output / "comments.csv")
    listing_votes = rows(output / "listing_votes.csv")
    comment_votes = rows(output / "comment_votes.csv")
    assert [int(row["id"]) for row in listings] == list(range(1, 7))
    assert {row["zip_code_id"] for row in listings} == {"46201", "90210"}
    assert all(sum(p["listing_id"] == row["id"] for p in photos) == 2 for row in listings)
    assert all(sum(c["listing_id"] == row["id"] for c in comments) == 2 for row in listings)
    assert all(len({v["actor_id"] for v in listing_votes if v["listing_id"] == row["id"]}) == 4 for row in listings)
    assert all(len({v["actor_id"] for v in comment_votes if v["comment_id"] == row["id"]}) == 2 for row in comments)
    assert {v["value"] for v in listing_votes + comment_votes} == {"-1", "1"}
    assert all("\n" not in value and "\t" not in value for row in comments for value in row.values())
    assert all(row["listed_at"].endswith("Z") for row in listings)
