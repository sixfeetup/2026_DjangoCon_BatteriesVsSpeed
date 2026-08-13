from __future__ import annotations

import json
import os
from pathlib import Path

import psycopg
import pytest

from zellit_data.generator import generate
from zellit_data.loader import seed
from zellit_data.manifest import write_manifest

DATABASE_URL = os.getenv("ZELLIT_TEST_DATABASE_URL")
pytestmark = pytest.mark.skipif(not DATABASE_URL, reason="requires PostgreSQL integration database")


@pytest.fixture
def artifacts(reduced, tmp_path):
    spec, zip_path = reduced
    output = tmp_path / "generated"
    manifest = generate(spec, output, zip_path)
    manifest_path = tmp_path / "manifest.json"
    write_manifest(manifest, manifest_path)
    return output, manifest_path, manifest


def db_value(sql, params=()):
    with psycopg.connect(DATABASE_URL) as connection, connection.cursor() as cursor:
        cursor.execute(sql, params)
        return cursor.fetchone()[0]


def test_clean_load_counts_relationships_and_metadata(artifacts):
    output, manifest_path, manifest = artifacts
    assert seed(DATABASE_URL, output, manifest_path, force=True)
    for name, metadata in manifest["files"].items():
        table = "zellit_" + name.removesuffix(".csv").removesuffix("s")
        if name == "zip_codes.csv": table = "zellit_zip_code"
        assert db_value(f"SELECT count(*) FROM {table}") == metadata["rows"]
    assert db_value("SELECT count(*) FROM zellit_photo WHERE listing_id=1") == 2
    assert db_value("SELECT count(*) FROM zellit_comment WHERE listing_id=1") == 2
    assert db_value("SELECT dataset_digest FROM zellit_dataset_metadata WHERE id=1") == manifest["overall_digest"]


def test_if_needed_skips_and_force_reloads(artifacts):
    output, manifest_path, _ = artifacts
    seed(DATABASE_URL, output, manifest_path, force=True)
    assert not seed(DATABASE_URL, output, manifest_path, if_needed=True)
    assert seed(DATABASE_URL, output, manifest_path, force=True)


def test_manifest_mismatch_fails_before_destructive_transaction(artifacts):
    output, manifest_path, _ = artifacts
    seed(DATABASE_URL, output, manifest_path, force=True)
    before = db_value("SELECT dataset_digest FROM zellit_dataset_metadata WHERE id=1")
    with (output / "actors.csv").open("a") as stream:
        stream.write("999,tampered,Tampered\n")
    with pytest.raises(ValueError, match="manifest"):
        seed(DATABASE_URL, output, manifest_path, force=True)
    assert db_value("SELECT dataset_digest FROM zellit_dataset_metadata WHERE id=1") == before


def test_failure_after_copy_rolls_back_previous_ready_dataset(artifacts):
    output, manifest_path, manifest = artifacts
    seed(DATABASE_URL, output, manifest_path, force=True)
    def fail(table):
        if table == "zellit_listing":
            raise RuntimeError("injected copy failure")
    with pytest.raises(RuntimeError, match="injected"):
        seed(DATABASE_URL, output, manifest_path, force=True, after_copy=fail)
    assert db_value("SELECT dataset_digest FROM zellit_dataset_metadata WHERE id=1") == manifest["overall_digest"]
    assert db_value("SELECT count(*) FROM zellit_listing") == 6
