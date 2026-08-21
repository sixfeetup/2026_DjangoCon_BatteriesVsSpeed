from __future__ import annotations

import csv
import hashlib
import json
from pathlib import Path

ARTIFACT_COLUMNS = {
    "actors.csv": ["id", "handle", "display_name"],
    "zip_codes.csv": ["code", "city", "state", "population", "households", "median_age", "median_household_income", "median_home_value"],
    "listings.csv": ["id", "zip_code_id", "street_address", "price", "bedrooms", "bathrooms", "square_feet", "year_built", "listed_at"],
    "photos.csv": ["id", "listing_id", "url", "position"],
    "comments.csv": ["id", "listing_id", "actor_id", "body", "created_at"],
    "listing_votes.csv": ["id", "listing_id", "actor_id", "value"],
    "comment_votes.csv": ["id", "comment_id", "actor_id", "value"],
}


def file_metadata(path: Path) -> dict[str, object]:
    digest = hashlib.sha256()
    size = 0
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            size += len(chunk)
            digest.update(chunk)
    with path.open(newline="", encoding="utf-8") as stream:
        reader = csv.reader(stream)
        columns = next(reader)
        rows = sum(1 for _ in reader)
    return {"sha256": digest.hexdigest(), "bytes": size, "rows": rows, "columns": columns}


def build_manifest(output: Path, *, schema_version: str, generator_version: str, seed: int) -> dict[str, object]:
    files = {name: file_metadata(output / name) for name in ARTIFACT_COLUMNS}
    encoded = json.dumps(files, sort_keys=True, separators=(",", ":")).encode()
    return {
        "schema_version": schema_version,
        "generator_version": generator_version,
        "seed": seed,
        "files": files,
        "overall_digest": hashlib.sha256(encoded).hexdigest(),
    }


def write_manifest(manifest: dict[str, object], path: Path) -> None:
    path.write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n")


def verify_manifest(output: Path, expected_path: Path) -> dict[str, object]:
    expected = json.loads(expected_path.read_text())
    expected_artifacts = {key: value for key, value in expected.items() if key != "request_corpus"}
    actual = build_manifest(
        output,
        schema_version=expected["schema_version"],
        generator_version=expected["generator_version"],
        seed=expected["seed"],
    )
    if actual != expected_artifacts:
        raise ValueError("generated artifacts do not match manifest")
    for name, columns in ARTIFACT_COLUMNS.items():
        if actual["files"][name]["columns"] != columns:
            raise ValueError(f"unexpected columns for {name}")
    if "request_corpus" in expected:
        corpus = expected_path.parent / "benchmark_requests.csv"
        if file_metadata(corpus) != expected["request_corpus"]:
            raise ValueError("benchmark request corpus does not match manifest")
    return expected
