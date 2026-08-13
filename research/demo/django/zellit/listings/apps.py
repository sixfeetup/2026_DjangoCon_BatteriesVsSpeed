from __future__ import annotations

from django.apps import AppConfig


class ListingsConfig(AppConfig):
    default_auto_field = "django.db.models.AutoField"
    name = "listings"
    verbose_name = "Zellit listings"
