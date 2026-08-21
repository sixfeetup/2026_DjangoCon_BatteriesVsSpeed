from __future__ import annotations

import csv
from contextlib import ExitStack
from datetime import datetime, timedelta, timezone
from pathlib import Path

from faker import Faker

from zellit_data.config import DatasetSpec
from zellit_data.manifest import ARTIFACT_COLUMNS
from zellit_data.manifest import build_manifest
from zellit_data.manifest import write_manifest


def _clean(value: str, limit: int) -> str:
    return " ".join(value.replace("\t", " ").split())[:limit]


def _timestamp(base: datetime, seconds: int) -> str:
    return (base + timedelta(seconds=seconds)).astimezone(timezone.utc).strftime(
        "%Y-%m-%dT%H:%M:%SZ"
    )


def _vote_actor(target_id: int, position: int, actor_count: int, stride: int) -> int:
    return ((target_id * stride + position) % actor_count) + 1


def generate(spec: DatasetSpec, output: Path, zip_input: Path) -> dict[str, object]:
    output.mkdir(parents=True, exist_ok=True)
    faker = Faker("en_US")
    faker.seed_instance(spec.seed)
    base = datetime.fromisoformat(spec.base_timestamp.replace("Z", "+00:00"))

    with zip_input.open(newline="", encoding="utf-8") as stream:
        zip_rows = list(csv.DictReader(stream))
    if len(zip_rows) < spec.counts["zip_codes"]:
        raise ValueError("ZIP input has fewer rows than requested")
    zip_rows = zip_rows[: spec.counts["zip_codes"]]

    with ExitStack() as stack:
        writers = {}
        for name, columns in ARTIFACT_COLUMNS.items():
            file = stack.enter_context((output / name).open("w", newline="", encoding="utf-8"))
            writer = csv.writer(file, lineterminator="\n")
            writer.writerow(columns)
            writers[name] = writer

        for actor_id in range(1, spec.counts["actors"] + 1):
            writers["actors.csv"].writerow(
                [actor_id, f"homefan{actor_id:05d}", _clean(faker.name(), spec.field_limits["display_name"])]
            )

        for index, row in enumerate(zip_rows, 1):
            population = 10000 + (index * 7919) % 90000
            households = population * (35 + index % 16) // 100
            writers["zip_codes.csv"].writerow(
                [row["code"], _clean(row["city"], spec.field_limits["city"]), row["state"], population, households, 25 + index % 30, 40000 + index * 137, 120000 + index * 997]
            )

        p = spec.per_parent
        actor_count = spec.counts["actors"]
        comment_id = photo_id = listing_vote_id = comment_vote_id = 0
        for listing_id in range(1, spec.counts["listings"] + 1):
            zip_index = (listing_id - 1) // p["listings_per_zip"]
            zip_code = zip_rows[zip_index]["code"]
            address = _clean(f"{100 + listing_id % 9900} {faker.street_name()}", spec.field_limits["street_address"])
            writers["listings.csv"].writerow(
                [listing_id, zip_code, address, 100000 + (listing_id * 7919) % 900000, 1 + listing_id % 6, 1 + listing_id % 4, 600 + (listing_id * 37) % 4400, 1900 + listing_id % 126, _timestamp(base, listing_id)]
            )
            for position in range(p["photos_per_listing"]):
                photo_id += 1
                writers["photos.csv"].writerow([photo_id, listing_id, f"https://images.zellit.test/listings/{listing_id}/{position}.webp", position])
            for position in range(p["comments_per_listing"]):
                comment_id += 1
                actor_id = _vote_actor(listing_id, position, actor_count, 17)
                writers["comments.csv"].writerow([comment_id, listing_id, actor_id, f"Synthetic benchmark comment {comment_id}.", _timestamp(base, spec.counts["listings"] + comment_id)])
                for vote_position in range(p["comment_votes_per_comment"]):
                    comment_vote_id += 1
                    vote_actor = _vote_actor(comment_id, vote_position, actor_count, 31)
                    writers["comment_votes.csv"].writerow([comment_vote_id, comment_id, vote_actor, 1 if (comment_id + vote_position) % 3 else -1])
            for position in range(p["listing_votes_per_listing"]):
                listing_vote_id += 1
                actor_id = _vote_actor(listing_id, position, actor_count, 23)
                writers["listing_votes.csv"].writerow([listing_vote_id, listing_id, actor_id, 1 if (listing_id + position) % 3 else -1])

    manifest = build_manifest(output, schema_version=spec.schema_version, generator_version=spec.generator_version, seed=spec.seed)
    write_manifest(manifest, output / "manifest.candidate.json")
    return manifest
