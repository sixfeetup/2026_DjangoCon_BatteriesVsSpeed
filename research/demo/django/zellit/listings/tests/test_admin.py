from __future__ import annotations

import pytest
from django.contrib import admin
from django.contrib.auth import get_user_model
from django.test import RequestFactory

from listings.admin import DatasetMetadataAdmin
from listings.models import Actor
from listings.models import Comment
from listings.models import CommentVote
from listings.models import DatasetMetadata
from listings.models import Listing
from listings.models import ListingVote
from listings.models import Photo
from listings.models import ZipCode


@pytest.mark.parametrize(
    "model",
    [ZipCode, Actor, Listing, Photo, Comment, ListingVote, CommentVote, DatasetMetadata],
)
def test_every_domain_model_is_registered(model):
    assert model in admin.site._registry


@pytest.mark.django_db
def test_dataset_metadata_is_read_only_for_staff():
    user = get_user_model().objects.create_user("staff@example.com", is_staff=True)
    request = RequestFactory().get("/admin/")
    request.user = user
    model_admin = DatasetMetadataAdmin(DatasetMetadata, admin.site)
    assert not model_admin.has_add_permission(request)
    assert not model_admin.has_change_permission(request)
    assert not model_admin.has_delete_permission(request)


def test_large_relations_do_not_use_inlines():
    for model in (Listing, Photo, Comment, ListingVote, CommentVote):
        assert admin.site._registry[model].inlines == ()
