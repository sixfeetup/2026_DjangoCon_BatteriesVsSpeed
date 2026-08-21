from __future__ import annotations

import json
import logging

import dramatiq
import pytest
from test_plus.test import APITestCase

logging.disable(logging.CRITICAL)


@pytest.fixture()
def broker():
    """Return the empty Dramatiq stub broker configured for tests."""
    broker = dramatiq.get_broker()
    broker.flush_all()
    return broker


@pytest.fixture()
def worker(broker):
    """Run a Dramatiq worker for the duration of a test."""
    worker = dramatiq.Worker(broker, worker_timeout=100)
    worker.start()
    yield worker
    worker.stop()


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
