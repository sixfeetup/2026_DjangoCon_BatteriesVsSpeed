from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class DatasetSpec:
    schema_version: str
    generator_version: str
    seed: int
    base_timestamp: str
    counts: dict[str, int]
    per_parent: dict[str, int]
    field_limits: dict[str, int]

    @classmethod
    def load(cls, path: Path) -> "DatasetSpec":
        data = json.loads(path.read_text())
        spec = cls(**data)
        spec.validate()
        return spec

    def validate(self) -> None:
        required = {
            "zip_codes",
            "actors",
            "listings",
            "photos",
            "comments",
            "listing_votes",
            "comment_votes",
        }
        if set(self.counts) != required or any(value <= 0 for value in self.counts.values()):
            raise ValueError("spec must contain positive canonical entity counts")
        p = self.per_parent
        if self.counts["listings"] != self.counts["zip_codes"] * p["listings_per_zip"]:
            raise ValueError("listing count does not match ZIP cardinality")
        for child, parent, key in (
            ("photos", "listings", "photos_per_listing"),
            ("comments", "listings", "comments_per_listing"),
            ("listing_votes", "listings", "listing_votes_per_listing"),
            ("comment_votes", "comments", "comment_votes_per_comment"),
        ):
            if self.counts[child] != self.counts[parent] * p[key]:
                raise ValueError(f"{child} count does not match {parent} cardinality")
        if self.counts["actors"] < max(
            p["listing_votes_per_listing"], p["comment_votes_per_comment"]
        ):
            raise ValueError("too few actors to create unique votes")
