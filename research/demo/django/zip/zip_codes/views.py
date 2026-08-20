from __future__ import annotations

import logging

from django.http import HttpRequest
from django.http import JsonResponse
from redis.exceptions import RedisError

from . import service

logger = logging.getLogger(__name__)


def health(request: HttpRequest) -> JsonResponse:
    try:
        ready = service.get_repository().is_ready()
    except RedisError:
        logger.exception("ZIP dataset readiness check failed")
        ready = False

    if not ready:
        return JsonResponse({"detail": "ZIP dataset is not ready"}, status=503)
    return JsonResponse({"status": "ready"})
