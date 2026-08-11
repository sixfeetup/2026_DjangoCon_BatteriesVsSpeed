import csv
import hashlib
import json
import re
from pathlib import Path

import pytest

from zip_data import dataset as dataset_module
from zip_data.dataset import (
    DatasetVerificationError,
    generate_dataset,
    verify_dataset,
)


def read_records(path: Path) -> list[dict[str, str]]:
    return [json.loads(line) for line in path.read_text().splitlines()]


def test_generation_is_deterministic_and_reserves_showcase_records(tmp_path: Path) -> None:
    first = tmp_path / "first"
    second = tmp_path / "second"
    manifest = generate_dataset(first, seed=20260811, count=500)
    repeated = generate_dataset(second, seed=20260811, count=500)

    assert manifest.sha256 == repeated.sha256
    assert (first / "zip_codes.jsonl").read_bytes() == (second / "zip_codes.jsonl").read_bytes()
    records = read_records(first / "zip_codes.jsonl")
    assert {record["zip"]: record["city"] for record in records}["46201"] == "Indianapolis"
    assert {record["zip"]: record["city"] for record in records}["46202"] == "Indianapolis"


def test_full_dataset_and_prefix_corpus_satisfy_contract(tmp_path: Path) -> None:
    manifest = generate_dataset(tmp_path)
    records = read_records(tmp_path / "zip_codes.jsonl")
    zips = [record["zip"] for record in records]

    assert manifest.count == 50_000
    assert len(zips) == len(set(zips)) == 50_000
    assert zips == sorted(zips)
    assert all(re.fullmatch(r"[0-9]{5}", value) for value in zips)

    with (tmp_path / "benchmark_prefixes.csv").open(newline="") as stream:
        prefixes = [row["q"] for row in csv.DictReader(stream)]
    assert len(prefixes) == len(set(prefixes)) == 100
    assert all(sum(value.startswith(prefix) for value in zips) >= 10 for prefix in prefixes)


def test_verifier_accepts_non_default_seed(tmp_path: Path) -> None:
    manifest = generate_dataset(tmp_path, seed=12345, count=500)

    verified = verify_dataset(tmp_path)

    assert verified == manifest


def test_verifier_ignores_runtime_faker_version_lookup(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    manifest = generate_dataset(tmp_path, count=500)
    monkeypatch.setattr(dataset_module, "version", lambda package: "999.999.999")

    verified = verify_dataset(tmp_path)

    assert verified == manifest


def test_verifier_rejects_modified_artifact(tmp_path: Path) -> None:
    generate_dataset(tmp_path, count=500)
    with (tmp_path / "zip_codes.jsonl").open("ab") as stream:
        stream.write(b"corruption\n")

    with pytest.raises(DatasetVerificationError, match="checksum"):
        verify_dataset(tmp_path)
