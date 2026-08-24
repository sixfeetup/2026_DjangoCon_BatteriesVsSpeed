from __future__ import annotations

from types import SimpleNamespace

from zellit_api.config import DatasetIdentity, Settings
from zellit_api.database import build_engine, build_session_factory, get_session


def settings() -> Settings:
    return Settings(
        database_url="postgresql+asyncpg://postgres@localhost:55433/postgres",
        pool_size=20,
        max_overflow=0,
        dataset=DatasetIdentity("1", "digest", {}),
    )


async def test_engine_uses_fixed_pool_contract() -> None:
    engine = build_engine(settings())

    assert engine.pool.size() == 20
    assert engine.pool._max_overflow == 0

    await engine.dispose()


def test_session_factory_does_not_expire_loaded_values() -> None:
    engine = build_engine(settings())

    factory = build_session_factory(engine)

    assert factory.kw["expire_on_commit"] is False


async def test_session_dependency_closes_request_session() -> None:
    class FakeSession:
        entered = False
        exited = False

        async def __aenter__(self):
            self.entered = True
            return self

        async def __aexit__(self, *args):
            self.exited = True

    session = FakeSession()
    request = SimpleNamespace(
        app=SimpleNamespace(
            state=SimpleNamespace(session_factory=lambda: session),
        )
    )

    yielded = [item async for item in get_session(request)]

    assert yielded == [session]
    assert session.entered is True
    assert session.exited is True
