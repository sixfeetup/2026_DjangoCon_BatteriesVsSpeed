from __future__ import annotations

import json
from collections.abc import Callable
from pathlib import Path

import psycopg
from psycopg.types.json import Jsonb

from zellit_data.manifest import verify_manifest

TABLES = {
    "zip_codes.csv": ("zellit_zip_code", "code,city,state,population,households,median_age,median_household_income,median_home_value"),
    "actors.csv": ("zellit_actor", "id,handle,display_name"),
    "listings.csv": ("zellit_listing", "id,zip_code_id,street_address,price,bedrooms,bathrooms,square_feet,year_built,listed_at"),
    "photos.csv": ("zellit_photo", "id,listing_id,url,position"),
    "comments.csv": ("zellit_comment", "id,listing_id,actor_id,body,created_at"),
    "listing_votes.csv": ("zellit_listing_vote", "id,listing_id,actor_id,value"),
    "comment_votes.csv": ("zellit_comment_vote", "id,comment_id,actor_id,value"),
}
COUNT_KEYS = {table: filename.removesuffix(".csv") for filename, (table, _) in TABLES.items()}
TRUNCATE_ORDER = [
    "zellit_comment_vote", "zellit_listing_vote", "zellit_photo", "zellit_comment",
    "zellit_listing", "zellit_actor", "zellit_zip_code", "zellit_dataset_metadata",
]


def _database_matches(cursor: psycopg.Cursor, manifest: dict[str, object]) -> bool:
    cursor.execute(
        "SELECT schema_version, generator_version, seed, dataset_digest, row_counts "
        "FROM zellit_dataset_metadata WHERE id = 1"
    )
    row = cursor.fetchone()
    expected_counts = {
        name.removesuffix(".csv"): metadata["rows"]
        for name, metadata in manifest["files"].items()
    }
    return bool(
        row
        and row[0] == manifest["schema_version"]
        and row[1] == manifest["generator_version"]
        and row[2] == manifest["seed"]
        and row[3] == manifest["overall_digest"]
        and row[4] == expected_counts
    )


def seed(
    database_url: str,
    data_dir: Path,
    manifest_path: Path,
    *,
    if_needed: bool = False,
    force: bool = False,
    after_copy: Callable[[str], None] | None = None,
) -> bool:
    """Verify and atomically load artifacts, returning whether a load occurred."""
    if if_needed and force:
        raise ValueError("--if-needed and --force are mutually exclusive")
    manifest = verify_manifest(data_dir, manifest_path)
    counts = {
        name.removesuffix(".csv"): metadata["rows"]
        for name, metadata in manifest["files"].items()
    }
    with psycopg.connect(database_url) as connection:
        with connection.cursor() as cursor:
            cursor.execute("SET LOCAL statement_timeout = '30min'")
            cursor.execute("SELECT pg_advisory_xact_lock(20260813)")
            if if_needed and _database_matches(cursor, manifest):
                return False
            cursor.execute("TRUNCATE " + ",".join(TRUNCATE_ORDER) + " RESTART IDENTITY CASCADE")
            for filename, (table, columns) in TABLES.items():
                sql = f"COPY {table} ({columns}) FROM STDIN WITH (FORMAT CSV, HEADER TRUE)"
                with (data_dir / filename).open("rb") as source, cursor.copy(sql) as copy:
                    while chunk := source.read(1024 * 1024):
                        copy.write(chunk)
                if after_copy:
                    after_copy(table)
            for table, key in COUNT_KEYS.items():
                cursor.execute(f"SELECT count(*) FROM {table}")
                if cursor.fetchone()[0] != counts[key]:
                    raise ValueError(f"loaded count mismatch for {table}")
            relationship_checks = (
                ("zellit_photo", "listing_id", 1, counts["photos"] // counts["listings"]),
                ("zellit_comment", "listing_id", 1, counts["comments"] // counts["listings"]),
                ("zellit_listing_vote", "listing_id", 1, counts["listing_votes"] // counts["listings"]),
                ("zellit_comment_vote", "comment_id", 1, counts["comment_votes"] // counts["comments"]),
            )
            for table, foreign_key, parent_id, expected in relationship_checks:
                cursor.execute(
                    f"SELECT count(*) FROM {table} WHERE {foreign_key} = %s",
                    (parent_id,),
                )
                if cursor.fetchone()[0] != expected:
                    raise ValueError(f"representative relationship validation failed for {table}")
            cursor.execute(
                "INSERT INTO zellit_dataset_metadata "
                "(id,schema_version,generator_version,seed,dataset_digest,row_counts,generated_at,loaded_at) "
                "VALUES (1,%s,%s,%s,%s,%s,%s,clock_timestamp())",
                (
                    manifest["schema_version"], manifest["generator_version"],
                    manifest["seed"], manifest["overall_digest"], Jsonb(counts),
                    "2026-01-15T12:00:00Z",
                ),
            )
    return True
