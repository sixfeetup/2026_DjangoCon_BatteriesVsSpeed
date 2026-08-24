from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class Demographics(BaseModel):
    population: int
    households: int
    median_age: int
    median_household_income: int
    median_home_value: int


class ZipCode(BaseModel):
    code: str
    city: str
    state: str
    demographics: Demographics


class Market(BaseModel):
    listing_count: int
    average_price: int


class Pagination(BaseModel):
    limit: int
    offset: int
    returned: int


class Photo(BaseModel):
    position: int
    url: str


class Comment(BaseModel):
    id: int
    author: str
    body: str
    created_at: datetime
    vote_score: int


class Listing(BaseModel):
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
    photos: list[Photo]
    comments: list[Comment]


class ListingsResponse(BaseModel):
    zip_code: ZipCode
    market: Market
    pagination: Pagination
    listings: list[Listing]
