from __future__ import annotations

from django.db.models import Avg
from django.db.models import Count
from django.db.models import IntegerField
from django.db.models import OuterRef
from django.db.models import Prefetch
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
        zipcode = ZipCode.objects.only(
            "code", "city", "state", "population", "households", "median_age",
            "median_household_income", "median_home_value",
        ).get(pk=zip_code)
    except ZipCode.DoesNotExist as error:
        raise ZipCodeNotFound from error

    market = Listing.objects.filter(zip_code_id=zip_code).aggregate(
        listing_count=Count("id"),
        average_price=Coalesce(
            Cast(Round(Avg("price")), IntegerField()), 0
        ),
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
    comments = (
        Comment.objects.select_related("actor")
        .annotate(vote_score=Coalesce(Subquery(comment_score), 0))
        .order_by("id")
    )
    queryset = (
        Listing.objects.filter(zip_code_id=zip_code)
        .annotate(
            vote_score=Coalesce(Subquery(listing_score), 0),
            comment_count=Coalesce(Subquery(comment_total), 0),
        )
        .prefetch_related(
            Prefetch("photos", queryset=Photo.objects.order_by("position")),
            Prefetch("comments", queryset=comments),
        )
        .order_by("id")[offset : offset + limit]
    )
    listings = list(queryset)
    payload = []
    for listing in listings:
        payload.append(
            {
                "id": listing.id,
                "street_address": listing.street_address,
                "price": listing.price,
                "bedrooms": listing.bedrooms,
                "bathrooms": listing.bathrooms,
                "square_feet": listing.square_feet,
                "year_built": listing.year_built,
                "listed_at": listing.listed_at,
                "vote_score": listing.vote_score,
                "comment_count": listing.comment_count,
                "photos": [
                    {"position": photo.position, "url": photo.url}
                    for photo in listing.photos.all()
                ],
                "comments": [
                    {
                        "id": comment.id,
                        "author": comment.actor.handle,
                        "body": comment.body,
                        "created_at": comment.created_at,
                        "vote_score": comment.vote_score,
                    }
                    for comment in listing.comments.all()
                ],
            }
        )
    return {
        "zip_code": {
            "code": zipcode.code,
            "city": zipcode.city,
            "state": zipcode.state,
            "demographics": {
                "population": zipcode.population,
                "households": zipcode.households,
                "median_age": zipcode.median_age,
                "median_household_income": zipcode.median_household_income,
                "median_home_value": zipcode.median_home_value,
            },
        },
        "market": {
            "listing_count": market["listing_count"],
            "average_price": market["average_price"],
        },
        "pagination": {"limit": limit, "offset": offset, "returned": len(payload)},
        "listings": payload,
    }
