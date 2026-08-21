from __future__ import annotations

from datetime import timedelta

import pytest
from django.utils import timezone

from listings.models import Actor
from listings.models import Comment
from listings.models import CommentVote
from listings.models import Listing
from listings.models import ListingVote
from listings.models import Photo
from listings.models import ZipCode


@pytest.fixture
def zip_code(db):
    return ZipCode.objects.create(
        code="46201",
        city="Indianapolis",
        state="IN",
        population=30000,
        households=12000,
        median_age=36,
        median_household_income=68000,
        median_home_value=248000,
    )


@pytest.fixture
def actor(db):
    return Actor.objects.create(handle="homefan00001", display_name="Home Fan")


@pytest.fixture
def listing(zip_code):
    return Listing.objects.create(
        zip_code=zip_code,
        street_address="123 Example Street",
        price=325000,
        bedrooms=3,
        bathrooms=2,
        square_feet=1840,
        year_built=1998,
        listed_at=timezone.now(),
    )


@pytest.fixture
def comment(listing, actor):
    return Comment.objects.create(
        listing=listing,
        actor=actor,
        body="Synthetic benchmark comment.",
        created_at=timezone.now(),
    )


@pytest.fixture
def api_data(db):
    zipcode = ZipCode.objects.create(code="46201", city="Indianapolis", state="IN", population=30000, households=12000, median_age=36, median_household_income=68000, median_home_value=248000)
    actors = [Actor.objects.create(handle=f"actor{i:02}", display_name=f"Actor {i}") for i in range(12)]
    base = timezone.now()
    listing_ids = []
    for number in range(1, 61):
        listing = Listing.objects.create(zip_code=zipcode, street_address=f"{number} Example Street", price=100000 + number, bedrooms=3, bathrooms=2, square_feet=1800, year_built=2000, listed_at=base + timedelta(seconds=number))
        listing_ids.append(listing.id)
        for position in range(4):
            Photo.objects.create(listing=listing, position=position, url=f"https://images.zellit.test/{number}/{position}")
        for position in range(3):
            comment = Comment.objects.create(listing=listing, actor=actors[position], body=f"Comment {position}", created_at=base + timedelta(seconds=position))
            CommentVote.objects.create(comment=comment, actor=actors[4], value=1)
            CommentVote.objects.create(comment=comment, actor=actors[5], value=-1)
        for position in range(8):
            ListingVote.objects.create(listing=listing, actor=actors[position], value=1 if position < 6 else -1)
    return listing_ids
