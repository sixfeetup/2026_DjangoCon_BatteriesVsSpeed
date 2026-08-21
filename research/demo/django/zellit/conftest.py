from __future__ import annotations

import json
import logging

import pytest
from test_plus.test import APITestCase

logging.disable(logging.CRITICAL)


@pytest.fixture()
def api(client):
    """
    Add useful data handling methods to the test client
    """
    t = APITestCase()
    t.client = client
    return t


@pytest.fixture()
def post(api):
    """
    As of the commit date, 2025-02-25, we're not using these, but I'm sure we will at some point
    """

    def make_post(url, data):
        return api.client.post(
            url, data=json.dumps(data), content_type="application/json"
        )

    return make_post


@pytest.fixture()
def put(api):
    """
    As of the commit date, 2025-02-25, we're not using these, but I'm sure we will at some point
    """

    def make_put(url, data):
        return api.client.put(
            url, data=json.dumps(data), content_type="application/json"
        )

    return make_put


@pytest.fixture(autouse=True)
def use_test_settings(settings):
    settings.CACHES = {
        "default": {"BACKEND": "django.core.cache.backends.dummy.DummyCache"}
    }

    settings.CELERY_TASK_ALWAYS_EAGER = True

    settings.DEBUG = False

    settings.EMAIL_BACKEND = "django.core.mail.backends.locmem.EmailBackend"

    settings.MIDDLEWARE = [
        middleware
        for middleware in settings.MIDDLEWARE
        if middleware != "whitenoise.middleware.WhiteNoiseMiddleware"
    ]

    # User a faster password hasher
    settings.PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]

    settings.STATICFILES_STORAGE = (
        "django.contrib.staticfiles.storage.StaticFilesStorage"
    )

    settings.WHITENOISE_AUTOREFRESH = True
