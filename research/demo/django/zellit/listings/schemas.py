from __future__ import annotations

from datetime import datetime

from ninja import Schema


class DemographicsSchema(Schema):
    population: int
    households: int
    median_age: int
    median_household_income: int
    median_home_value: int


class ZipCodeSchema(Schema):
    code: str
    city: str
    state: str
    demographics: DemographicsSchema


class MarketSchema(Schema):
    listing_count: int
    average_price: int


class PaginationSchema(Schema):
    limit: int
    offset: int
    returned: int


class PhotoSchema(Schema):
    position: int
    url: str


class CommentSchema(Schema):
    id: int
    author: str
    body: str
    created_at: datetime
    vote_score: int


class ListingSchema(Schema):
    id: int
    street_address: str
    price: int
    bedrooms: int
    bathrooms: int
    square_feet: int
    year_built: int
    listed_at: datetime
    vote_score: int
    comment_count: int
    photos: list[PhotoSchema]
    comments: list[CommentSchema]


class ListingsResponseSchema(Schema):
    zip_code: ZipCodeSchema
    market: MarketSchema
    pagination: PaginationSchema
    listings: list[ListingSchema]


class DetailSchema(Schema):
    detail: str
