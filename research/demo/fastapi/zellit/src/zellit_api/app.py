from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from typing import Annotated, cast

from fastapi import Depends, FastAPI, HTTPException, Path, Query, Request
from fastapi.responses import JSONResponse
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from .config import Settings
from .database import build_engine, build_session_factory, get_session
from .repository import ZellitRepository, ZipCodeNotFound
from .schemas import ListingsResponse

logger = logging.getLogger(__name__)
NOT_READY = {"detail": "Zellit dataset is not ready"}

ZipPath = Annotated[str, Path(pattern=r"^[0-9]{5}$")]
LimitQuery = Annotated[int, Query(ge=1, le=50)]
OffsetQuery = Annotated[int, Query(ge=0, le=199)]
SessionDep = Annotated[AsyncSession, Depends(get_session)]


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = cast(Settings | None, getattr(app.state, "settings", None))
    settings = settings or Settings.from_env()
    engine = build_engine(settings)
    app.state.settings = settings
    app.state.engine = engine
    app.state.session_factory = build_session_factory(engine)
    app.state.repository = ZellitRepository()
    try:
        yield
    finally:
        await engine.dispose()


def create_app(settings: Settings | None = None) -> FastAPI:
    application = FastAPI(lifespan=lifespan)
    application.state.settings = settings

    @application.get(
        "/api/v1/zip-codes/{zip_code}/listings",
        response_model=ListingsResponse,
    )
    async def get_listings(
        request: Request,
        session: SessionDep,
        zip_code: ZipPath,
        limit: LimitQuery = 20,
        offset: OffsetQuery = 0,
    ) -> dict[str, object]:
        try:
            return await request.app.state.repository.get_listings(
                session, zip_code, limit, offset
            )
        except ZipCodeNotFound as error:
            raise HTTPException(status_code=404, detail="ZIP code not found") from error

    @application.get("/health")
    async def health(request: Request, session: SessionDep) -> JSONResponse:
        try:
            ready = await request.app.state.repository.is_ready(
                session, request.app.state.settings.dataset
            )
        except SQLAlchemyError:
            logger.exception("Zellit readiness check failed")
            ready = False
        return JSONResponse(
            status_code=200 if ready else 503,
            content={"status": "ready"} if ready else NOT_READY,
        )

    return application


app = create_app()
