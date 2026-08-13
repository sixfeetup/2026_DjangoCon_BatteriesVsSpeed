from __future__ import annotations

from django.http import HttpRequest
from django.http import JsonResponse
from django.middleware.csrf import get_token
from ninja import NinjaAPI
from ninja.security import django_auth

api = NinjaAPI(auth=django_auth)


def csrf(request: HttpRequest) -> JsonResponse:
    """
    This view returns a CSRF Token for our React frontend to consume
    and use
    """
    token = get_token(request)
    return JsonResponse({"token": token})
