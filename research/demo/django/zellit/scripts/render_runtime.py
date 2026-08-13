#!/usr/bin/env python3
"""Normalize a committed runtime preset or an explicitly labeled custom runtime."""
from __future__ import annotations

import argparse
import json
import os
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PRESETS = ROOT / "runtime-presets.json"
ENV_NAMES = {
    "runtime_label": "RUNTIME_LABEL",
    "database_mode": "DJANGO_DATABASE_MODE",
    "worker_class": "GUNICORN_WORKER_CLASS",
    "bind": "GUNICORN_BIND",
    "workers": "GUNICORN_WORKERS",
    "threads": "GUNICORN_THREADS",
    "worker_connections": "GUNICORN_WORKER_CONNECTIONS",
    "timeout": "GUNICORN_TIMEOUT",
    "keepalive": "GUNICORN_KEEPALIVE",
    "conn_max_age": "DJANGO_CONN_MAX_AGE",
    "gevent_pool_max": "DJANGO_GEVENT_POOL_MAX",
    "access_log_enabled": "GUNICORN_ACCESS_LOG_ENABLED",
    "log_level": "DJANGO_LOG_LEVEL",
}
INTEGER_FIELDS = {
    "workers": (1, 256), "threads": (1, 256),
    "worker_connections": (1, 1_000_000), "timeout": (1, 3600),
    "keepalive": (0, 3600), "conn_max_age": (0, 86400),
    "gevent_pool_max": (1, 10000),
}
OVERRIDABLE_FIELDS = set(ENV_NAMES) - {"runtime_label"}
LABEL_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$")


def _bool(value: object) -> bool:
    if isinstance(value, bool):
        return value
    normalized = str(value).lower()
    if normalized in {"1", "true", "yes", "on"}:
        return True
    if normalized in {"0", "false", "no", "off"}:
        return False
    raise ValueError("access_log_enabled must be a boolean")


def normalize(mode: str, environ: dict[str, str] | None = None) -> dict[str, object]:
    environ = os.environ if environ is None else environ
    document = json.loads(PRESETS.read_text())
    values = dict(document["defaults"])
    if mode == "custom":
        label = environ.get("RUNTIME_LABEL", "").strip()
        values["runtime_label"] = label
        values["preset"] = "custom"
        required = ("DJANGO_DATABASE_MODE", "GUNICORN_WORKER_CLASS")
        missing = [name for name in required if not environ.get(name, "").strip()]
        if missing:
            raise ValueError("custom mode requires " + ", ".join(missing))
    elif mode in document["presets"]:
        values.update(document["presets"][mode])
        values["preset"] = mode
    else:
        raise ValueError(f"unknown runtime preset: {mode}")

    for field in OVERRIDABLE_FIELDS:
        name = ENV_NAMES[field]
        if name in environ:
            values[field] = environ[name]

    label = str(values.get("runtime_label", "")).strip()
    if not LABEL_RE.fullmatch(label):
        raise ValueError("runtime label must be non-empty and contain only safe characters")
    values["runtime_label"] = label
    if values.get("database_mode") not in {"standard", "geventpool"}:
        raise ValueError("database_mode must be standard or geventpool")
    if values.get("worker_class") not in {"sync", "gevent"}:
        raise ValueError("worker_class must be sync or gevent")
    if (values["worker_class"] == "gevent") != (values["database_mode"] == "geventpool"):
        raise ValueError("gevent workers and geventpool database mode must be selected together")
    if not str(values.get("bind", "")).strip():
        raise ValueError("bind must not be empty")
    for field, (minimum, maximum) in INTEGER_FIELDS.items():
        try:
            value = int(values[field])
        except (KeyError, TypeError, ValueError) as error:
            raise ValueError(f"{field} must be an integer") from error
        if not minimum <= value <= maximum:
            raise ValueError(f"{field} must be between {minimum} and {maximum}")
        values[field] = value
    values["access_log_enabled"] = _bool(values["access_log_enabled"])
    values["log_level"] = str(values["log_level"]).upper()
    if values["log_level"] not in {"CRITICAL", "ERROR", "WARNING", "INFO", "DEBUG"}:
        raise ValueError("log_level is invalid")
    values["schema_version"] = document["schema_version"]
    return values


def write_env(runtime: dict[str, object], path: Path) -> None:
    lines = []
    for field, name in ENV_NAMES.items():
        value = runtime[field]
        if isinstance(value, bool):
            value = str(value).lower()
        lines.append(f"{name}={value}")
    path.write_text("\n".join(lines) + "\n")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("mode")
    parser.add_argument("--env-file", type=Path, required=True)
    parser.add_argument("--json-file", type=Path, required=True)
    args = parser.parse_args()
    try:
        runtime = normalize(args.mode)
    except ValueError as error:
        parser.error(str(error))
    write_env(runtime, args.env_file)
    args.json_file.write_text(json.dumps(runtime, indent=2, sort_keys=True) + "\n")


if __name__ == "__main__":
    main()
