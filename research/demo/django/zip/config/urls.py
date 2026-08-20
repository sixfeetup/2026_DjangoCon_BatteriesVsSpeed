from __future__ import annotations

from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include
from django.urls import path

from ak.views import ForbiddenView
from ak.views import HomepageView
from ak.views import InternalServerErrorView
from ak.views import NotFoundView
from ak.views import OKView
from config.api import api
from config.api import csrf
from config.api import public_api
from users.views import router as user_router
from zip_codes.views import health

api.add_router("/users/", user_router)

urlpatterns = [
    path("", HomepageView.as_view(), name="home"),
    path("admin/", admin.site.urls),
    path("200", OKView.as_view(), name="ok"),
    path("403", ForbiddenView.as_view(), name="forbidden"),
    path("404", NotFoundView.as_view(), name="not_found"),
    path("500", InternalServerErrorView.as_view(), name="internal_server_error"),
    path("health", health, name="zip_health"),
    path("health/diagnostics/", include("health_check.urls")),
    path("api/v1/", api.urls),
    path("", public_api.urls),
    path("api/csrf/", csrf),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
