from __future__ import annotations

from django.core.validators import MinValueValidator
from django.db import models
from django.db.models import Q


class ZipCode(models.Model):
    code = models.CharField(max_length=5, primary_key=True)
    city = models.CharField(max_length=100)
    state = models.CharField(max_length=2)
    population = models.PositiveIntegerField()
    households = models.PositiveIntegerField()
    median_age = models.PositiveSmallIntegerField()
    median_household_income = models.PositiveIntegerField()
    median_home_value = models.PositiveIntegerField()

    class Meta:
        db_table = "zellit_zip_code"
        constraints = [
            models.CheckConstraint(
                condition=Q(code__regex=r"^[0-9]{5}$"), name="zip_code_ascii_digits"
            ),
            models.CheckConstraint(
                condition=Q(state__regex=r"^[A-Z]{2}$"), name="zip_state_upper_ascii"
            ),
            models.CheckConstraint(
                condition=(
                    Q(population__gte=0)
                    & Q(households__gte=0)
                    & Q(median_age__gte=0)
                    & Q(median_household_income__gte=0)
                    & Q(median_home_value__gte=0)
                ),
                name="zip_demographics_nonnegative",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.code} — {self.city}, {self.state}"


class Actor(models.Model):
    handle = models.CharField(max_length=50, unique=True)
    display_name = models.CharField(max_length=100)

    class Meta:
        db_table = "zellit_actor"

    def __str__(self) -> str:
        return f"@{self.handle}"


class Listing(models.Model):
    zip_code = models.ForeignKey(
        ZipCode, on_delete=models.CASCADE, related_name="listings"
    )
    street_address = models.CharField(max_length=150)
    price = models.PositiveIntegerField(validators=[MinValueValidator(1)])
    bedrooms = models.PositiveSmallIntegerField()
    bathrooms = models.PositiveSmallIntegerField()
    square_feet = models.PositiveIntegerField(validators=[MinValueValidator(1)])
    year_built = models.PositiveSmallIntegerField()
    listed_at = models.DateTimeField()

    class Meta:
        db_table = "zellit_listing"
        indexes = [models.Index(fields=["zip_code", "id"], name="listing_zip_id_idx")]
        constraints = [
            models.CheckConstraint(condition=Q(price__gt=0), name="listing_price_gt_0"),
            models.CheckConstraint(
                condition=Q(bedrooms__gte=0), name="listing_bedrooms_gte_0"
            ),
            models.CheckConstraint(
                condition=Q(bathrooms__gte=0), name="listing_bathrooms_gte_0"
            ),
            models.CheckConstraint(
                condition=Q(square_feet__gt=0), name="listing_sqft_gt_0"
            ),
            models.CheckConstraint(
                condition=Q(year_built__gte=1600) & Q(year_built__lte=2100),
                name="listing_year_range",
            ),
        ]

    def __str__(self) -> str:
        return f"Listing {self.pk}: {self.street_address}"


class Photo(models.Model):
    listing = models.ForeignKey(
        Listing, on_delete=models.CASCADE, related_name="photos"
    )
    url = models.URLField(max_length=250)
    position = models.PositiveSmallIntegerField()

    class Meta:
        db_table = "zellit_photo"
        constraints = [
            models.UniqueConstraint(
                fields=["listing", "position"], name="photo_listing_position_unique"
            )
        ]

    def __str__(self) -> str:
        return f"Listing {self.listing_id} photo {self.position}"


class Comment(models.Model):
    listing = models.ForeignKey(
        Listing, on_delete=models.CASCADE, related_name="comments"
    )
    actor = models.ForeignKey(
        Actor, on_delete=models.CASCADE, related_name="comments"
    )
    body = models.CharField(max_length=500)
    created_at = models.DateTimeField()

    class Meta:
        db_table = "zellit_comment"
        indexes = [
            models.Index(fields=["listing", "id"], name="comment_listing_id_idx")
        ]

    def __str__(self) -> str:
        return f"Comment {self.pk} by {self.actor_id}"


class ListingVote(models.Model):
    listing = models.ForeignKey(
        Listing, on_delete=models.CASCADE, related_name="votes"
    )
    actor = models.ForeignKey(
        Actor, on_delete=models.CASCADE, related_name="listing_votes"
    )
    value = models.SmallIntegerField()

    class Meta:
        db_table = "zellit_listing_vote"
        constraints = [
            models.CheckConstraint(
                condition=Q(value__in=(-1, 1)), name="listing_vote_value"
            ),
            models.UniqueConstraint(
                fields=["listing", "actor"], name="listing_vote_actor_unique"
            ),
        ]

    def __str__(self) -> str:
        return f"Listing {self.listing_id} vote by {self.actor_id}: {self.value:+d}"


class CommentVote(models.Model):
    comment = models.ForeignKey(
        Comment, on_delete=models.CASCADE, related_name="votes"
    )
    actor = models.ForeignKey(
        Actor, on_delete=models.CASCADE, related_name="comment_votes"
    )
    value = models.SmallIntegerField()

    class Meta:
        db_table = "zellit_comment_vote"
        constraints = [
            models.CheckConstraint(
                condition=Q(value__in=(-1, 1)), name="comment_vote_value"
            ),
            models.UniqueConstraint(
                fields=["comment", "actor"], name="comment_vote_actor_unique"
            ),
        ]

    def __str__(self) -> str:
        return f"Comment {self.comment_id} vote by {self.actor_id}: {self.value:+d}"


class DatasetMetadata(models.Model):
    id = models.PositiveSmallIntegerField(primary_key=True, default=1, editable=False)
    schema_version = models.CharField(max_length=32)
    generator_version = models.CharField(max_length=32)
    seed = models.PositiveBigIntegerField()
    dataset_digest = models.CharField(max_length=64)
    row_counts = models.JSONField()
    generated_at = models.DateTimeField()
    loaded_at = models.DateTimeField()

    class Meta:
        db_table = "zellit_dataset_metadata"
        constraints = [
            models.CheckConstraint(condition=Q(id=1), name="dataset_metadata_singleton")
        ]

    def __str__(self) -> str:
        return f"Dataset {self.schema_version} ({self.dataset_digest[:12]})"
