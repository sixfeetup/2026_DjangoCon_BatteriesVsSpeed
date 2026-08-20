from __future__ import annotations

import logging
from typing import Annotated

from django.http import HttpRequest
from django.http import JsonResponse
from django.middleware.csrf import get_token
from ninja import Field
from ninja import NinjaAPI
from ninja import Schema
from ninja.security import django_auth
from redis.exceptions import RedisError

from zip_codes import service

logger = logging.getLogger(__name__)

api = NinjaAPI(auth=django_auth)
public_api = NinjaAPI(urls_namespace="zip")


class ZipResponse(Schema):
    zip: str
    city: str


@public_api.get("/zip-codes", response=list[ZipResponse])
def zip_codes(
    request: HttpRequest,
    q: Annotated[str, Field(pattern=r"^[0-9]{1,5}$")],
):
    try:
        entries = service.get_repository().lookup(q, limit=10)
    except RedisError:
        logger.exception("ZIP lookup failed")
        return JsonResponse(
            {"detail": "ZIP lookup temporarily unavailable"}, status=503
        )
    return [ZipResponse(zip=entry.zip, city=entry.city) for entry in entries]


def csrf(request: HttpRequest) -> JsonResponse:
    """
    This view returns a CSRF Token for our React frontend to consume
    and use
    """
    token = get_token(request)
    return JsonResponse({"token": token})
