from __future__ import annotations

from django.http import HttpRequest
from django.http import HttpResponse
from ninja import Router

from users.schemas import UserSchema

router = Router()


@router.get("/me/")
def me(request: HttpRequest, response: HttpResponse):
    return UserSchema.from_orm(request.user)
