from __future__ import annotations

from dataclasses import dataclass

from redis.asyncio import Redis

from .config import Settings


@dataclass(frozen=True, slots=True)
class ZipEntry:
    zip: str
    city: str


class StoredZipDataError(ValueError):
    pass


class RedisZipRepository:
    def __init__(self, client: Redis, settings: Settings) -> None:
        self._client = client
        self._settings = settings

    async def lookup(self, prefix: str, limit: int = 10) -> list[ZipEntry]:
        members = await self._client.zrange(
            self._settings.data_key,
            f"[{prefix}",
            f"[{prefix}\xff",
            bylex=True,
            offset=0,
            num=max(0, min(limit, 10)),
        )
        return [self._decode_member(member) for member in members]

    async def is_ready(self) -> bool:
        pipe = self._client.pipeline(transaction=False)
        pipe.ping()
        pipe.zcard(self._settings.data_key)
        pipe.hgetall(self._settings.metadata_key)
        ping_result, cardinality, metadata = await pipe.execute()
        if not ping_result or cardinality != self._settings.expected_count:
            return False

        count = metadata.get(b"count", metadata.get("count"))
        sha256 = metadata.get(b"sha256", metadata.get("sha256"))
        if count is None or sha256 is None:
            return False

        if isinstance(count, bytes):
            count = count.decode()
        if isinstance(sha256, bytes):
            sha256 = sha256.decode()

        return count == str(self._settings.expected_count) and sha256 == self._settings.expected_sha256

    @staticmethod
    def _decode_member(member: bytes | str) -> ZipEntry:
        if isinstance(member, bytes):
            member = member.decode()

        zip_code, separator, city = member.partition("\t")
        if not separator or len(zip_code) != 5 or not zip_code.isascii() or not zip_code.isdigit():
            raise StoredZipDataError(f"invalid stored zip member: {member!r}")

        return ZipEntry(zip=zip_code, city=city)
