from __future__ import annotations

import json

import pytest

from zellit_data.generator import generate
from zellit_data.manifest import verify_manifest
from test_generator import rows


def test_manifest_matches_every_artifact(reduced, tmp_path):
    spec, zip_path = reduced
    output = tmp_path / "generated"
    expected = generate(spec, output, zip_path)
    manifest_path = tmp_path / "manifest.json"
    manifest_path.write_text(json.dumps(expected))
    assert verify_manifest(output, manifest_path) == expected
    with (output / "actors.csv").open("a") as stream:
        stream.write("21,changed,Changed\n")
    with pytest.raises(ValueError, match="do not match"):
        verify_manifest(output, manifest_path)


def test_every_reduced_zip_has_full_pages(reduced, tmp_path):
    spec, zip_path = reduced
    output = tmp_path / "generated"
    generate(spec, output, zip_path)
    counts = {}
    for row in rows(output / "listings.csv"):
        counts[row["zip_code_id"]] = counts.get(row["zip_code_id"], 0) + 1
    assert counts == {"46201": 3, "90210": 3}
