from __future__ import annotations

from collections import Counter
from dataclasses import asdict, dataclass
from hashlib import sha256
from importlib.metadata import version
from pathlib import Path
import csv
import json
import re

from faker import Faker

SEED = 20260811
COUNT = 50_000
SCHEMA_VERSION = 1
GENERATOR_VERSION = 1
SHOWCASE = {"46201": "Indianapolis", "46202": "Indianapolis"}
ZIP_PATTERN = re.compile(r"[0-9]{5}", re.ASCII)


@dataclass(frozen=True)
class DatasetManifest:
    schema_version: int
    generator_version: int
    seed: int
    count: int
    faker_version: str
    sha256: str


class DatasetVerificationError(ValueError):
    pass


def _sanitize_city(city: str) -> str:
    return city.replace("\t", " ").replace("\r", " ").replace("\n", " ")


def _build_records(seed: int, count: int) -> list[dict[str, str]]:
    if count < len(SHOWCASE):
        raise ValueError("count must be at least the number of showcase records")
    if count > 100_000:
        raise ValueError("count must not exceed the five-digit ZIP space")

    Faker.seed(seed)
    fake = Faker("en_US")
    fake.seed_instance(seed)

    records: dict[str, str] = dict(SHOWCASE)
    while len(records) < count:
        zip_code = f"{fake.random_int(min=0, max=99_999):05d}"
        if zip_code in records:
            continue
        records[zip_code] = _sanitize_city(fake.city())

    return [{"zip": zip_code, "city": records[zip_code]} for zip_code in sorted(records)]


def _load_records(path: Path) -> list[dict[str, str]]:
    records: list[dict[str, str]] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line:
            continue
        record = json.loads(line)
        if not isinstance(record, dict):
            raise DatasetVerificationError("record must be an object")
        if set(record) != {"zip", "city"}:
            raise DatasetVerificationError("record keys mismatch")
        if not isinstance(record["zip"], str) or not isinstance(record["city"], str):
            raise DatasetVerificationError("record values must be strings")
        records.append(record)
    return records


def _records_to_bytes(records: list[dict[str, str]]) -> bytes:
    payload = "".join(
        json.dumps(record, ensure_ascii=False, separators=(",", ":")) + "\n"
        for record in records
    )
    return payload.encode("utf-8")


def _select_prefixes(zips: list[str]) -> list[str]:
    counts = Counter(zip_code[:3] for zip_code in zips)
    eligible = sorted(prefix for prefix, total in counts.items() if total >= 10)
    desired_prefixes = min(100, len(eligible))
    if desired_prefixes == 0:
        return []
    if desired_prefixes == 1:
        return [eligible[0]]
    return [
        eligible[round(i * (len(eligible) - 1) / (desired_prefixes - 1))]
        for i in range(desired_prefixes)
    ]


def _write_jsonl(path: Path, records: list[dict[str, str]]) -> bytes:
    payload = _records_to_bytes(records)
    path.write_bytes(payload)
    return payload


def _write_manifest(path: Path, manifest: DatasetManifest) -> None:
    path.write_text(json.dumps(asdict(manifest), indent=2, sort_keys=True) + "\n", encoding="utf-8")


def _write_env(path: Path, manifest: DatasetManifest) -> None:
    path.write_text(
        f"ZIP_DATASET_COUNT={manifest.count}\nZIP_DATASET_SHA256={manifest.sha256}\n",
        encoding="utf-8",
    )


def _write_prefixes(path: Path, prefixes: list[str]) -> None:
    with path.open("w", newline="", encoding="utf-8") as stream:
        writer = csv.DictWriter(stream, fieldnames=["q"])
        writer.writeheader()
        for prefix in prefixes:
            writer.writerow({"q": prefix})


def _load_manifest(path: Path) -> DatasetManifest:
    data = json.loads(path.read_text(encoding="utf-8"))
    expected_keys = {
        "count",
        "faker_version",
        "generator_version",
        "schema_version",
        "seed",
        "sha256",
    }
    if set(data) != expected_keys:
        raise DatasetVerificationError("manifest keys mismatch")
    if not isinstance(data["schema_version"], int):
        raise DatasetVerificationError("manifest schema_version must be an integer")
    if not isinstance(data["generator_version"], int):
        raise DatasetVerificationError("manifest generator_version must be an integer")
    if not isinstance(data["seed"], int):
        raise DatasetVerificationError("manifest seed must be an integer")
    if not isinstance(data["count"], int):
        raise DatasetVerificationError("manifest count must be an integer")
    if not isinstance(data["faker_version"], str):
        raise DatasetVerificationError("manifest faker_version must be a string")
    if not isinstance(data["sha256"], str):
        raise DatasetVerificationError("manifest sha256 must be a string")
    return DatasetManifest(
        schema_version=data["schema_version"],
        generator_version=data["generator_version"],
        seed=data["seed"],
        count=data["count"],
        faker_version=data["faker_version"],
        sha256=data["sha256"],
    )


def _load_env(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line:
            continue
        if "=" not in line:
            raise DatasetVerificationError("environment line missing separator")
        key, value = line.split("=", 1)
        values[key] = value
    return values


def _validate_records(records: list[dict[str, str]]) -> None:
    zips = [record["zip"] for record in records]
    if len(zips) != len(set(zips)):
        raise DatasetVerificationError("zip values must be unique")
    if zips != sorted(zips):
        raise DatasetVerificationError("zip values must be sorted")
    for record in records:
        zip_code = record["zip"]
        city = record["city"]
        if not ZIP_PATTERN.fullmatch(zip_code):
            raise DatasetVerificationError("zip values must be five-digit ASCII strings")
        if not zip_code.isascii():
            raise DatasetVerificationError("zip values must be ASCII")
        if city != _sanitize_city(city):
            raise DatasetVerificationError("city values must be sanitized")
    record_map = {record["zip"]: record["city"] for record in records}
    for zip_code, city in SHOWCASE.items():
        if record_map.get(zip_code) != city:
            raise DatasetVerificationError("showcase records mismatch")


def _validate_prefixes(records: list[dict[str, str]], prefixes: list[str], count: int) -> None:
    zips = [record["zip"] for record in records]
    expected_prefixes = _select_prefixes(zips)
    if count == COUNT and len(prefixes) != 100:
        raise DatasetVerificationError("benchmark prefix corpus must contain 100 entries")
    if prefixes != expected_prefixes:
        raise DatasetVerificationError("benchmark prefix corpus mismatch")
    counts = Counter(zip_code[:3] for zip_code in zips)
    for prefix in prefixes:
        if counts[prefix] < 10:
            raise DatasetVerificationError("benchmark prefix is not eligible")


def generate_dataset(output_dir: Path, *, seed: int = SEED, count: int = COUNT) -> DatasetManifest:
    output_dir.mkdir(parents=True, exist_ok=True)
    records = _build_records(seed, count)
    payload = _write_jsonl(output_dir / "zip_codes.jsonl", records)
    checksum = sha256(payload).hexdigest()
    manifest = DatasetManifest(
        schema_version=SCHEMA_VERSION,
        generator_version=GENERATOR_VERSION,
        seed=seed,
        count=count,
        faker_version=version("faker"),
        sha256=checksum,
    )
    _write_manifest(output_dir / "manifest.json", manifest)
    _write_env(output_dir / "dataset.env", manifest)
    _write_prefixes(output_dir / "benchmark_prefixes.csv", _select_prefixes([record["zip"] for record in records]))
    return manifest


def verify_dataset(output_dir: Path) -> DatasetManifest:
    manifest = _load_manifest(output_dir / "manifest.json")
    jsonl_path = output_dir / "zip_codes.jsonl"
    payload = jsonl_path.read_bytes()
    checksum = sha256(payload).hexdigest()
    if checksum != manifest.sha256:
        raise DatasetVerificationError("checksum mismatch")

    if manifest.schema_version != SCHEMA_VERSION:
        raise DatasetVerificationError("manifest schema version mismatch")
    if manifest.generator_version != GENERATOR_VERSION:
        raise DatasetVerificationError("manifest generator version mismatch")

    records = _load_records(jsonl_path)
    if len(records) != manifest.count:
        raise DatasetVerificationError("record count mismatch")

    _validate_records(records)

    env_values = _load_env(output_dir / "dataset.env")
    if env_values.get("ZIP_DATASET_COUNT") != str(manifest.count):
        raise DatasetVerificationError("environment count mismatch")
    if env_values.get("ZIP_DATASET_SHA256") != manifest.sha256:
        raise DatasetVerificationError("environment checksum mismatch")

    prefix_path = output_dir / "benchmark_prefixes.csv"
    with prefix_path.open(newline="", encoding="utf-8") as stream:
        reader = csv.DictReader(stream)
        if reader.fieldnames != ["q"]:
            raise DatasetVerificationError("benchmark prefix header mismatch")
        prefixes = [row["q"] for row in reader]

    _validate_prefixes(records, prefixes, manifest.count)
    return manifest
