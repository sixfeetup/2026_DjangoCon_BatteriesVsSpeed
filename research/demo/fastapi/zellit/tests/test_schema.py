from __future__ import annotations

import pytest
from sqlalchemy import inspect
from sqlalchemy.ext.asyncio import create_async_engine

EXPECTED_TABLES = {
    "zellit_zip_code",
    "zellit_actor",
    "zellit_listing",
    "zellit_photo",
    "zellit_comment",
    "zellit_listing_vote",
    "zellit_comment_vote",
    "zellit_dataset_metadata",
}
EXPECTED_INDEXES = {"listing_zip_id_idx", "comment_listing_id_idx"}
EXPECTED_UNIQUES = {
    "photo_listing_position_unique",
    "listing_vote_actor_unique",
    "comment_vote_actor_unique",
}
EXPECTED_CHECKS = {
    "zip_code_ascii_digits",
    "zip_state_upper_ascii",
    "zip_demographics_nonnegative",
    "listing_price_gt_0",
    "listing_bedrooms_gte_0",
    "listing_bathrooms_gte_0",
    "listing_sqft_gt_0",
    "listing_year_range",
    "listing_vote_value",
    "comment_vote_value",
    "dataset_metadata_singleton",
}

pytestmark = pytest.mark.integration


async def test_migration_creates_loader_contract(migrated_database: str) -> None:
    engine = create_async_engine(migrated_database)

    def examine(connection):
        inspector = inspect(connection)
        tables = set(inspector.get_table_names())
        indexes = {
            item["name"]
            for table in EXPECTED_TABLES
            for item in inspector.get_indexes(table)
        }
        uniques = {
            item["name"]
            for table in EXPECTED_TABLES
            for item in inspector.get_unique_constraints(table)
        }
        checks = {
            item["name"]
            for table in EXPECTED_TABLES
            for item in inspector.get_check_constraints(table)
        }
        foreign_keys = {
            foreign_key["options"].get("ondelete")
            for table in EXPECTED_TABLES
            for foreign_key in inspector.get_foreign_keys(table)
        }
        return tables, indexes, uniques, checks, foreign_keys

    async with engine.connect() as connection:
        tables, indexes, uniques, checks, foreign_keys = await connection.run_sync(
            examine
        )
    await engine.dispose()

    assert EXPECTED_TABLES <= tables
    assert EXPECTED_INDEXES <= indexes
    assert EXPECTED_UNIQUES <= uniques
    assert EXPECTED_CHECKS <= checks
    assert foreign_keys == {"CASCADE"}
