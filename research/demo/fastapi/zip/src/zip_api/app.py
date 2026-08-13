from __future__ import annotations

from contextlib import asynccontextmanager
from typing import Annotated, cast
import logging

from fastapi import FastAPI, Query, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from redis.asyncio import Redis
from redis.asyncio.retry import Retry
from redis.backoff import NoBackoff
from redis.exceptions import RedisError

from .config import Settings
from .repository import RedisZipRepository

logger = logging.getLogger(__name__)


class ZipResponse(BaseModel):
    zip: str
    city: str


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = cast(Settings | None, getattr(app.state, "settings", None)) or Settings.from_env()
    client = Redis.from_url(
        settings.redis_url,
        decode_responses=True,
        retry_on_timeout=False,
        retry=Retry(NoBackoff(), 0),
    )
    app.state.settings = settings
    app.state.redis = client
    app.state.repository = RedisZipRepository(client, settings)
    try:
        yield
    finally:
        await client.aclose()


def create_app(settings: Settings | None = None) -> FastAPI:
    app = FastAPI(lifespan=lifespan)
    app.state.settings = settings

    @app.get("/zip-codes", response_model=list[ZipResponse])
    async def zip_codes(
        request: Request,
        q: Annotated[str, Query(pattern=r"^[0-9]{1,5}$")],
    ) -> list[ZipResponse]:
        repository = request.app.state.repository
        try:
            entries = await repository.lookup(q, limit=10)
        except RedisError:
            logger.exception("ZIP lookup failed")
            return JSONResponse(
                status_code=503,
                content={"detail": "ZIP lookup temporarily unavailable"},
            )
        return [ZipResponse(zip=entry.zip, city=entry.city) for entry in entries]

    @app.get("/health")
    async def health(request: Request) -> JSONResponse:
        repository = request.app.state.repository
        try:
            ready = await repository.is_ready()
        except RedisError:
            logger.exception("ZIP dataset readiness check failed")
            return JSONResponse(
                status_code=503,
                content={"detail": "ZIP dataset is not ready"},
            )
        if not ready:
            return JSONResponse(
                status_code=503,
                content={"detail": "ZIP dataset is not ready"},
            )
        return JSONResponse(status_code=200, content={"status": "ready"})

    return app


app = create_app()
