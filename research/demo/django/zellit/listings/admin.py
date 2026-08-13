from __future__ import annotations

from django.contrib import admin

from listings.models import Actor
from listings.models import Comment
from listings.models import CommentVote
from listings.models import DatasetMetadata
from listings.models import Listing
from listings.models import ListingVote
from listings.models import Photo
from listings.models import ZipCode


@admin.register(ZipCode)
class ZipCodeAdmin(admin.ModelAdmin):
    list_display = ("code", "city", "state", "population", "median_home_value")
    search_fields = ("^code", "city")
    list_filter = ("state",)
    ordering = ("code",)


@admin.register(Actor)
class ActorAdmin(admin.ModelAdmin):
    list_display = ("id", "handle", "display_name")
    search_fields = ("^handle", "display_name")
    ordering = ("id",)


@admin.register(Listing)
class ListingAdmin(admin.ModelAdmin):
    list_display = ("id", "street_address", "zip_code", "price", "listed_at")
    search_fields = ("=id", "street_address", "^zip_code__code")
    list_filter = ("zip_code__state", "bedrooms", "bathrooms")
    autocomplete_fields = ("zip_code",)
    ordering = ("id",)


@admin.register(Photo)
class PhotoAdmin(admin.ModelAdmin):
    list_display = ("id", "listing_id", "position", "url")
    search_fields = ("=id", "=listing__id")
    raw_id_fields = ("listing",)
    ordering = ("id",)


@admin.register(Comment)
class CommentAdmin(admin.ModelAdmin):
    list_display = ("id", "listing_id", "actor_id", "created_at")
    search_fields = ("=id", "=listing__id", "actor__handle", "body")
    raw_id_fields = ("listing", "actor")
    ordering = ("id",)


@admin.register(ListingVote)
class ListingVoteAdmin(admin.ModelAdmin):
    list_display = ("id", "listing_id", "actor_id", "value")
    search_fields = ("=id", "=listing__id", "actor__handle")
    list_filter = ("value",)
    raw_id_fields = ("listing", "actor")
    ordering = ("id",)


@admin.register(CommentVote)
class CommentVoteAdmin(admin.ModelAdmin):
    list_display = ("id", "comment_id", "actor_id", "value")
    search_fields = ("=id", "=comment__id", "actor__handle")
    list_filter = ("value",)
    raw_id_fields = ("comment", "actor")
    ordering = ("id",)


@admin.register(DatasetMetadata)
class DatasetMetadataAdmin(admin.ModelAdmin):
    list_display = ("schema_version", "generator_version", "seed", "loaded_at")
    readonly_fields = (
        "id",
        "schema_version",
        "generator_version",
        "seed",
        "dataset_digest",
        "row_counts",
        "generated_at",
        "loaded_at",
    )

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return bool(request.user.is_superuser)
