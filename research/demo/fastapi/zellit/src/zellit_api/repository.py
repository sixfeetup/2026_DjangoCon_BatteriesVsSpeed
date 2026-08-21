from __future__ import annotations

from collections import defaultdict

from sqlalchemy import Integer, cast, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from .config import DatasetIdentity
from .models import (
    Actor,
    Comment,
    CommentVote,
    DatasetMetadata,
    Listing,
    ListingVote,
    Photo,
    ZipCode,
)


class ZipCodeNotFound(Exception):
    pass


class ZellitRepository:
    async def get_listings(
        self,
        session: AsyncSession,
        zip_code: str,
        limit: int,
        offset: int,
    ) -> dict[str, object]:
        zip_row = (
            await session.execute(
                select(
                    ZipCode.code,
                    ZipCode.city,
                    ZipCode.state,
                    ZipCode.population,
                    ZipCode.households,
                    ZipCode.median_age,
                    ZipCode.median_household_income,
                    ZipCode.median_home_value,
                ).where(ZipCode.code == zip_code)
            )
        ).mappings().one_or_none()
        if zip_row is None:
            raise ZipCodeNotFound

        market = (
            await session.execute(
                select(
                    func.count(Listing.id).label("listing_count"),
                    func.coalesce(
                        cast(func.round(func.avg(Listing.price)), Integer), 0
                    ).label("average_price"),
                ).where(Listing.zip_code_id == zip_code)
            )
        ).mappings().one()

        listing_score = (
            select(func.coalesce(func.sum(ListingVote.value), 0))
            .where(ListingVote.listing_id == Listing.id)
            .correlate(Listing)
            .scalar_subquery()
        )
        comment_count = (
            select(func.count(Comment.id))
            .where(Comment.listing_id == Listing.id)
            .correlate(Listing)
            .scalar_subquery()
        )
        listing_rows = (
            await session.execute(
                select(
                    Listing.id,
                    Listing.street_address,
                    Listing.price,
                    Listing.bedrooms,
                    Listing.bathrooms,
                    Listing.square_feet,
                    Listing.year_built,
                    Listing.listed_at,
                    listing_score.label("vote_score"),
                    comment_count.label("comment_count"),
                )
                .where(Listing.zip_code_id == zip_code)
                .order_by(Listing.id)
                .offset(offset)
                .limit(limit)
            )
        ).mappings().all()
        listing_ids = [row["id"] for row in listing_rows]

        photo_rows = (
            await session.execute(
                select(Photo.listing_id, Photo.position, Photo.url)
                .where(Photo.listing_id.in_(listing_ids))
                .order_by(Photo.listing_id, Photo.position)
            )
        ).mappings().all()

        comment_score = (
            select(func.coalesce(func.sum(CommentVote.value), 0))
            .where(CommentVote.comment_id == Comment.id)
            .correlate(Comment)
            .scalar_subquery()
        )
        comment_rows = (
            await session.execute(
                select(
                    Comment.listing_id,
                    Comment.id,
                    Actor.handle.label("author"),
                    Comment.body,
                    Comment.created_at,
                    comment_score.label("vote_score"),
                )
                .join(Actor, Actor.id == Comment.actor_id)
                .where(Comment.listing_id.in_(listing_ids))
                .order_by(Comment.listing_id, Comment.id)
            )
        ).mappings().all()

        photos_by_listing: dict[int, list[dict[str, object]]] = defaultdict(list)
        for photo in photo_rows:
            photos_by_listing[photo["listing_id"]].append(
                {"position": photo["position"], "url": photo["url"]}
            )

        comments_by_listing: dict[int, list[dict[str, object]]] = defaultdict(list)
        for comment in comment_rows:
            comments_by_listing[comment["listing_id"]].append(
                {
                    "id": comment["id"],
                    "author": comment["author"],
                    "body": comment["body"],
                    "created_at": comment["created_at"],
                    "vote_score": int(comment["vote_score"]),
                }
            )

        listings = [
            {
                "id": row["id"],
                "street_address": row["street_address"],
                "price": row["price"],
                "bedrooms": row["bedrooms"],
                "bathrooms": row["bathrooms"],
                "square_feet": row["square_feet"],
                "year_built": row["year_built"],
                "listed_at": row["listed_at"],
                "vote_score": int(row["vote_score"]),
                "comment_count": int(row["comment_count"]),
                "photos": photos_by_listing[row["id"]],
                "comments": comments_by_listing[row["id"]],
            }
            for row in listing_rows
        ]
        return {
            "zip_code": {
                "code": zip_row["code"],
                "city": zip_row["city"],
                "state": zip_row["state"],
                "demographics": {
                    "population": zip_row["population"],
                    "households": zip_row["households"],
                    "median_age": zip_row["median_age"],
                    "median_household_income": zip_row[
                        "median_household_income"
                    ],
                    "median_home_value": zip_row["median_home_value"],
                },
            },
            "market": {
                "listing_count": int(market["listing_count"]),
                "average_price": int(market["average_price"]),
            },
            "pagination": {
                "limit": limit,
                "offset": offset,
                "returned": len(listings),
            },
            "listings": listings,
        }

    async def is_ready(
        self, session: AsyncSession, dataset: DatasetIdentity
    ) -> bool:
        row = (
            await session.execute(
                select(
                    DatasetMetadata.schema_version,
                    DatasetMetadata.dataset_digest,
                    DatasetMetadata.row_counts,
                ).where(DatasetMetadata.id == 1)
            )
        ).mappings().one_or_none()
        return bool(
            row
            and row["schema_version"] == dataset.schema_version
            and row["dataset_digest"] == dataset.digest
            and row["row_counts"] == dataset.row_counts
        )
