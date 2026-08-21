from __future__ import annotations

import pytest
from django.db import IntegrityError
from django.db import transaction

from listings.models import Actor
from listings.models import Comment
from listings.models import CommentVote
from listings.models import DatasetMetadata
from listings.models import Listing
from listings.models import ListingVote
from listings.models import Photo
from listings.models import ZipCode

pytestmark = pytest.mark.django_db


def test_explicit_table_names():
    assert {
        model._meta.db_table
        for model in (
            ZipCode,
            Actor,
            Listing,
            Photo,
            Comment,
            ListingVote,
            CommentVote,
            DatasetMetadata,
        )
    } == {
        "zellit_zip_code",
        "zellit_actor",
        "zellit_listing",
        "zellit_photo",
        "zellit_comment",
        "zellit_listing_vote",
        "zellit_comment_vote",
        "zellit_dataset_metadata",
    }


@pytest.mark.parametrize(
    ("field", "value"),
    [("code", "１２３４５"), ("state", "in"), ("population", -1)],
)
def test_zip_database_constraints(zip_code, field, value):
    setattr(zip_code, field, value)
    with pytest.raises(IntegrityError), transaction.atomic():
        zip_code.save()


@pytest.mark.parametrize(
    ("field", "value"),
    [("price", 0), ("square_feet", 0), ("year_built", 1599), ("year_built", 2101)],
)
def test_listing_value_constraints(listing, field, value):
    setattr(listing, field, value)
    with pytest.raises(IntegrityError), transaction.atomic():
        listing.save()


@pytest.mark.parametrize("model_name", ["listing", "comment"])
def test_vote_value_and_actor_uniqueness(model_name, request, actor):
    target = request.getfixturevalue(model_name)
    model = ListingVote if model_name == "listing" else CommentVote
    relation = {model_name: target, "actor": actor}
    model.objects.create(**relation, value=1)
    with pytest.raises(IntegrityError), transaction.atomic():
        model.objects.create(**relation, value=-1)
    other = Actor.objects.create(handle="other", display_name="Other")
    with pytest.raises(IntegrityError), transaction.atomic():
        model.objects.create(**{model_name: target, "actor": other}, value=0)


def test_photo_position_unique(listing):
    Photo.objects.create(listing=listing, position=0, url="https://images.zellit.test/1")
    with pytest.raises(IntegrityError), transaction.atomic():
        Photo.objects.create(
            listing=listing, position=0, url="https://images.zellit.test/2"
        )


def test_required_indexes():
    assert ("zip_code", "id") in {
        tuple(index.fields) for index in Listing._meta.indexes
    }
    assert ("listing", "id") in {
        tuple(index.fields) for index in Comment._meta.indexes
    }


def test_deterministic_string_representations(zip_code, actor, listing, comment):
    assert str(zip_code) == "46201 — Indianapolis, IN"
    assert str(actor) == "@homefan00001"
    assert str(listing) == f"Listing {listing.id}: 123 Example Street"
    assert str(comment) == f"Comment {comment.id} by {actor.id}"


def test_listing_delete_cascades_domain_children(listing, comment, actor):
    Photo.objects.create(listing=listing, position=0, url="https://images.zellit.test/1")
    ListingVote.objects.create(listing=listing, actor=actor, value=1)
    CommentVote.objects.create(comment=comment, actor=actor, value=1)
    listing.delete()
    assert not Photo.objects.exists()
    assert not Comment.objects.exists()
    assert not ListingVote.objects.exists()
    assert not CommentVote.objects.exists()
    assert Actor.objects.filter(pk=actor.pk).exists()
    assert ZipCode.objects.exists()
