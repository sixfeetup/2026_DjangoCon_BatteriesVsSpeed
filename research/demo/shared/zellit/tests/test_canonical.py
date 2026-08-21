from __future__ import annotations

import csv
import json
from pathlib import Path

from zellit_data.config import DatasetSpec
from zellit_data.manifest import ARTIFACT_COLUMNS

DATA = Path(__file__).parents[1] / "data"


def test_canonical_manifest_matches_specification():
    spec = DatasetSpec.load(DATA / "spec.json")
    manifest = json.loads((DATA / "manifest.json").read_text())
    assert manifest["seed"] == 20260813
    assert manifest["schema_version"] == spec.schema_version
    assert {
        name.removesuffix(".csv"): metadata["rows"]
        for name, metadata in manifest["files"].items()
    } == spec.counts
    assert {
        name: metadata["columns"] for name, metadata in manifest["files"].items()
    } == ARTIFACT_COLUMNS


def test_request_corpus_has_100_zips_and_full_offsets():
    with (DATA / "benchmark_requests.csv").open(newline="") as stream:
        rows = list(csv.DictReader(stream))
    assert len(rows) == 500
    assert len({row["zip_code"] for row in rows}) == 100
    assert {int(row["offset"]) for row in rows} == {0, 20, 40, 60, 80}


def test_compact_zip_input_is_sorted_and_contains_showcase():
    with (DATA / "zip_codes.csv").open(newline="") as stream:
        rows = list(csv.DictReader(stream))
    codes = [row["code"] for row in rows]
    assert len(codes) == 500
    assert codes == sorted(codes)
    assert {"code": "46201", "city": "Indianapolis", "state": "IN"} in rows
