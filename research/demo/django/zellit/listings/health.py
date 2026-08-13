from __future__ import annotations

import logging
import os

from django.db import DatabaseError
from django.http import JsonResponse

from listings.models import DatasetMetadata

logger = logging.getLogger(__name__)
NOT_READY = {"detail": "Zellit dataset is not ready"}


def health(request):
    expected_counts = {
        "zip_codes": int(os.getenv("ZELLIT_EXPECTED_ZIP_CODES", "0")),
        "actors": int(os.getenv("ZELLIT_EXPECTED_ACTORS", "0")),
        "listings": int(os.getenv("ZELLIT_EXPECTED_LISTINGS", "0")),
        "photos": int(os.getenv("ZELLIT_EXPECTED_PHOTOS", "0")),
        "comments": int(os.getenv("ZELLIT_EXPECTED_COMMENTS", "0")),
        "listing_votes": int(os.getenv("ZELLIT_EXPECTED_LISTING_VOTES", "0")),
        "comment_votes": int(os.getenv("ZELLIT_EXPECTED_COMMENT_VOTES", "0")),
    }
    try:
        metadata = DatasetMetadata.objects.only(
            "schema_version", "dataset_digest", "row_counts"
        ).get(pk=1)
        ready = (
            metadata.schema_version == os.getenv("ZELLIT_DATASET_SCHEMA_VERSION")
            and metadata.dataset_digest == os.getenv("ZELLIT_DATASET_DIGEST")
            and metadata.row_counts == expected_counts
        )
    except (DatasetMetadata.DoesNotExist, DatabaseError):
        logger.exception("Zellit readiness check failed")
        ready = False
    return JsonResponse({"status": "ready"} if ready else NOT_READY, status=200 if ready else 503)
