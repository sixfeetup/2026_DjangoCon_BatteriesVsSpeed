from __future__ import annotations

from collections import defaultdict

from django.db.models import Avg
from django.db.models import Count
from django.db.models import F
from django.db.models import IntegerField
from django.db.models import OuterRef
from django.db.models import Subquery
from django.db.models import Sum
from django.db.models.functions import Cast
from django.db.models.functions import Coalesce
from django.db.models.functions import Round

from listings.models import Comment
from listings.models import CommentVote
from listings.models import Listing
from listings.models import ListingVote
from listings.models import Photo
from listings.models import ZipCode


class ZipCodeNotFound(Exception):
    pass


def listings_for_zip(zip_code: str, limit: int, offset: int) -> dict[str, object]:
    """Materialize the public response using exactly five database queries."""
    try:
        zipcode = ZipCode.objects.values(
            "code",
            "city",
            "state",
            "population",
            "households",
            "median_age",
            "median_household_income",
            "median_home_value",
        ).get(pk=zip_code)
    except ZipCode.DoesNotExist as error:
        raise ZipCodeNotFound from error

    market = Listing.objects.filter(zip_code_id=zip_code).aggregate(
        listing_count=Count("id"),
        average_price=Coalesce(Cast(Round(Avg("price")), IntegerField()), 0),
    )
    listing_score = (
        ListingVote.objects.filter(listing_id=OuterRef("pk"))
        .values("listing_id")
        .annotate(score=Sum("value"))
        .values("score")
    )
    comment_total = (
        Comment.objects.filter(listing_id=OuterRef("pk"))
        .values("listing_id")
        .annotate(total=Count("id"))
        .values("total")
    )
    comment_score = (
        CommentVote.objects.filter(comment_id=OuterRef("pk"))
        .values("comment_id")
        .annotate(score=Sum("value"))
        .values("score")
    )
    listings = list(
        Listing.objects.filter(zip_code_id=zip_code)
        .annotate(
            vote_score=Coalesce(Subquery(listing_score), 0),
            comment_count=Coalesce(Subquery(comment_total), 0),
        )
        .values(
            "id",
            "street_address",
            "price",
            "bedrooms",
            "bathrooms",
            "square_feet",
            "year_built",
            "listed_at",
            "vote_score",
            "comment_count",
        )
        .order_by("id")[offset : offset + limit]
    )
    listing_ids = [listing["id"] for listing in listings]

    photos_by_listing = defaultdict(list)
    for photo in (
        Photo.objects.filter(listing_id__in=listing_ids)
        .values("listing_id", "position", "url")
        .order_by("listing_id", "position")
    ):
        photos_by_listing[photo["listing_id"]].append(
            {"position": photo["position"], "url": photo["url"]}
        )

    comments_by_listing = defaultdict(list)
    for comment in (
        Comment.objects.filter(listing_id__in=listing_ids)
        .values("listing_id", "id", "body", "created_at")
        .annotate(
            author=F("actor__handle"),
            vote_score=Coalesce(Subquery(comment_score), 0),
        )
        .order_by("listing_id", "id")
    ):
        comments_by_listing[comment["listing_id"]].append(
            {
                "id": comment["id"],
                "author": comment["author"],
                "body": comment["body"],
                "created_at": comment["created_at"],
                "vote_score": comment["vote_score"],
            }
        )

    payload = [
        {
            **listing,
            "photos": photos_by_listing[listing["id"]],
            "comments": comments_by_listing[listing["id"]],
        }
        for listing in listings
    ]
    return {
        "zip_code": {
            "code": zipcode["code"],
            "city": zipcode["city"],
            "state": zipcode["state"],
            "demographics": {
                "population": zipcode["population"],
                "households": zipcode["households"],
                "median_age": zipcode["median_age"],
                "median_household_income": zipcode["median_household_income"],
                "median_home_value": zipcode["median_home_value"],
            },
        },
        "market": {
            "listing_count": market["listing_count"],
            "average_price": market["average_price"],
        },
        "pagination": {"limit": limit, "offset": offset, "returned": len(payload)},
        "listings": payload,
    }
