from __future__ import annotations

import pytest
from django.utils import timezone

from listings.models import Actor
from listings.models import Comment
from listings.models import Listing
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
