from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    SmallInteger,
    String,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class ZipCode(Base):
    __tablename__ = "zellit_zip_code"
    __table_args__ = (
        CheckConstraint("code ~ '^[0-9]{5}$'", name="zip_code_ascii_digits"),
        CheckConstraint("state ~ '^[A-Z]{2}$'", name="zip_state_upper_ascii"),
        CheckConstraint(
            "population >= 0 AND households >= 0 AND median_age >= 0 "
            "AND median_household_income >= 0 AND median_home_value >= 0",
            name="zip_demographics_nonnegative",
        ),
    )

    code: Mapped[str] = mapped_column(String(5), primary_key=True)
    city: Mapped[str] = mapped_column(String(100))
    state: Mapped[str] = mapped_column(String(2))
    population: Mapped[int] = mapped_column(Integer)
    households: Mapped[int] = mapped_column(Integer)
    median_age: Mapped[int] = mapped_column(SmallInteger)
    median_household_income: Mapped[int] = mapped_column(Integer)
    median_home_value: Mapped[int] = mapped_column(Integer)


class Actor(Base):
    __tablename__ = "zellit_actor"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    handle: Mapped[str] = mapped_column(String(50), unique=True)
    display_name: Mapped[str] = mapped_column(String(100))


class Listing(Base):
    __tablename__ = "zellit_listing"
    __table_args__ = (
        Index("listing_zip_id_idx", "zip_code_id", "id"),
        CheckConstraint("price > 0", name="listing_price_gt_0"),
        CheckConstraint("bedrooms >= 0", name="listing_bedrooms_gte_0"),
        CheckConstraint("bathrooms >= 0", name="listing_bathrooms_gte_0"),
        CheckConstraint("square_feet > 0", name="listing_sqft_gt_0"),
        CheckConstraint(
            "year_built >= 1600 AND year_built <= 2100",
            name="listing_year_range",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    zip_code_id: Mapped[str] = mapped_column(
        String(5), ForeignKey("zellit_zip_code.code", ondelete="CASCADE")
    )
    street_address: Mapped[str] = mapped_column(String(150))
    price: Mapped[int] = mapped_column(Integer)
    bedrooms: Mapped[int] = mapped_column(SmallInteger)
    bathrooms: Mapped[int] = mapped_column(SmallInteger)
    square_feet: Mapped[int] = mapped_column(Integer)
    year_built: Mapped[int] = mapped_column(SmallInteger)
    listed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class Photo(Base):
    __tablename__ = "zellit_photo"
    __table_args__ = (
        UniqueConstraint(
            "listing_id", "position", name="photo_listing_position_unique"
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    listing_id: Mapped[int] = mapped_column(
        ForeignKey("zellit_listing.id", ondelete="CASCADE")
    )
    url: Mapped[str] = mapped_column(String(250))
    position: Mapped[int] = mapped_column(SmallInteger)


class Comment(Base):
    __tablename__ = "zellit_comment"
    __table_args__ = (Index("comment_listing_id_idx", "listing_id", "id"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    listing_id: Mapped[int] = mapped_column(
        ForeignKey("zellit_listing.id", ondelete="CASCADE")
    )
    actor_id: Mapped[int] = mapped_column(
        ForeignKey("zellit_actor.id", ondelete="CASCADE")
    )
    body: Mapped[str] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class ListingVote(Base):
    __tablename__ = "zellit_listing_vote"
    __table_args__ = (
        CheckConstraint("value IN (-1, 1)", name="listing_vote_value"),
        UniqueConstraint(
            "listing_id", "actor_id", name="listing_vote_actor_unique"
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    listing_id: Mapped[int] = mapped_column(
        ForeignKey("zellit_listing.id", ondelete="CASCADE")
    )
    actor_id: Mapped[int] = mapped_column(
        ForeignKey("zellit_actor.id", ondelete="CASCADE")
    )
    value: Mapped[int] = mapped_column(SmallInteger)


class CommentVote(Base):
    __tablename__ = "zellit_comment_vote"
    __table_args__ = (
        CheckConstraint("value IN (-1, 1)", name="comment_vote_value"),
        UniqueConstraint(
            "comment_id", "actor_id", name="comment_vote_actor_unique"
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    comment_id: Mapped[int] = mapped_column(
        ForeignKey("zellit_comment.id", ondelete="CASCADE")
    )
    actor_id: Mapped[int] = mapped_column(
        ForeignKey("zellit_actor.id", ondelete="CASCADE")
    )
    value: Mapped[int] = mapped_column(SmallInteger)


class DatasetMetadata(Base):
    __tablename__ = "zellit_dataset_metadata"
    __table_args__ = (
        CheckConstraint("id = 1", name="dataset_metadata_singleton"),
    )

    id: Mapped[int] = mapped_column(SmallInteger, primary_key=True, default=1)
    schema_version: Mapped[str] = mapped_column(String(32))
    generator_version: Mapped[str] = mapped_column(String(32))
    seed: Mapped[int] = mapped_column(BigInteger)
    dataset_digest: Mapped[str] = mapped_column(String(64))
    row_counts: Mapped[dict[str, int]] = mapped_column(JSONB)
    generated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    loaded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
