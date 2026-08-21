from __future__ import annotations

import pytest
from model_bakery import baker


@pytest.fixture
def api_user(db):
    """
    Create a user of this API
    """
    api_user = baker.make("users.User")
    api_user.set_password("password")
    api_user.save()
    return api_user


def test_api_me(tp, api, api_user):
    """
    Test the API endpoint /api/me/ to ensure it returns the currently authenticated user.
    """
    with api.login(api_user):
        response = api.get("/api/v1/users/me/")
        tp.response_200(response)
        data = response.json()
        assert data["id"] == api_user.id
        assert data["email"] == api_user.email
