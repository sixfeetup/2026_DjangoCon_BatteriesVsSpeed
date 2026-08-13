from __future__ import annotations

from ninja import ModelSchema

from users.models import User


class UserSchema(ModelSchema):
    class Meta:
        model = User
        fields = [
            "id",
            "email",
            "first_name",
            "last_name",
            "date_joined",
            "is_active",
            "is_staff",
            "is_superuser",
        ]
