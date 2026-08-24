from __future__ import annotations

import importlib.util
import json
import os
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
RENDERER = ROOT / "scripts" / "render_runtime.py"
GUNICORN_CONFIG = ROOT / "gunicorn.conf.py"


def test_gevent_post_fork_installs_psycopg_wait_callback(monkeypatch):
    import psycopg2.extensions

    original = psycopg2.extensions.get_wait_callback()
    monkeypatch.setenv("GUNICORN_WORKER_CLASS", "gevent")
    spec = importlib.util.spec_from_file_location("zellit_gunicorn", GUNICORN_CONFIG)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    try:
        module.post_fork(None, None)
        callback = psycopg2.extensions.get_wait_callback()
        assert callback is not None
        assert callback.__module__ == "psycogreen.gevent"
    finally:
        psycopg2.extensions.set_wait_callback(original)


def render(tmp_path, mode, **environment):
    env_file = tmp_path / "runtime.env"
    json_file = tmp_path / "runtime.json"
    env = os.environ.copy()
    for name in (
        "RUNTIME_LABEL", "DJANGO_DATABASE_MODE", "DJANGO_CONN_MAX_AGE",
        "DJANGO_GEVENT_POOL_MAX", "GUNICORN_BIND", "GUNICORN_WORKER_CLASS",
        "GUNICORN_WORKERS", "GUNICORN_THREADS", "GUNICORN_WORKER_CONNECTIONS",
        "GUNICORN_TIMEOUT", "GUNICORN_KEEPALIVE", "GUNICORN_ACCESS_LOG_ENABLED",
        "DJANGO_LOG_LEVEL",
    ):
        env.pop(name, None)
    env.update(environment)
    result = subprocess.run(
        [sys.executable, str(RENDERER), mode, "--env-file", str(env_file),
         "--json-file", str(json_file)],
        cwd=ROOT, env=env, text=True, capture_output=True,
    )
    runtime = json.loads(json_file.read_text()) if json_file.exists() else None
    return result, runtime, env_file


def test_gevent_preset_normalizes_all_effective_fields(tmp_path):
    result, runtime, env_file = render(tmp_path, "gevent-1")
    assert result.returncode == 0, result.stderr
    assert runtime["runtime_label"] == "gevent-1"
    assert runtime["worker_class"] == "gevent"
    assert runtime["workers"] == 1
    assert runtime["database_mode"] == "geventpool"
    assert runtime["gevent_pool_max"] == 20
    assert runtime["worker_connections"] == 10000
    assert set(runtime) == {
        "access_log_enabled", "bind", "conn_max_age", "database_mode",
        "gevent_pool_max", "keepalive", "log_level", "preset", "runtime_label",
        "schema_version", "threads", "timeout", "worker_class",
        "worker_connections", "workers",
    }
    assert "DJANGO_DATABASE_MODE=geventpool" in env_file.read_text()


def test_gevent_2_preset_preserves_twenty_connections_per_container(tmp_path):
    result, runtime, _ = render(tmp_path, "gevent-2")
    assert result.returncode == 0, result.stderr
    assert runtime["runtime_label"] == "gevent-2"
    assert runtime["worker_class"] == "gevent"
    assert runtime["workers"] == 2
    assert runtime["database_mode"] == "geventpool"
    assert runtime["gevent_pool_max"] == 10


def test_sync_preset_normalizes_standard_backend(tmp_path):
    result, runtime, _ = render(tmp_path, "sync-1")
    assert result.returncode == 0, result.stderr
    assert runtime["runtime_label"] == "sync-1"
    assert runtime["worker_class"] == "sync"
    assert runtime["workers"] == 1
    assert runtime["database_mode"] == "standard"
    assert runtime["conn_max_age"] == 60


def test_custom_mode_requires_and_preserves_a_safe_label(tmp_path):
    result, runtime, _ = render(
        tmp_path,
        "custom",
        RUNTIME_LABEL="sync-4-demo",
        DJANGO_DATABASE_MODE="standard",
        GUNICORN_WORKER_CLASS="sync",
        GUNICORN_WORKERS="4",
    )
    assert result.returncode == 0, result.stderr
    assert runtime["preset"] == "custom"
    assert runtime["runtime_label"] == "sync-4-demo"
    assert runtime["workers"] == 4


@pytest.mark.parametrize(
    ("mode", "environment"),
    [
        ("missing", {}),
        ("custom", {}),
        ("custom", {"RUNTIME_LABEL": "bad label", "DJANGO_DATABASE_MODE": "standard", "GUNICORN_WORKER_CLASS": "sync"}),
        ("custom", {"RUNTIME_LABEL": "custom", "DJANGO_DATABASE_MODE": "other", "GUNICORN_WORKER_CLASS": "sync"}),
        ("custom", {"RUNTIME_LABEL": "custom", "DJANGO_DATABASE_MODE": "standard", "GUNICORN_WORKER_CLASS": "other"}),
        ("custom", {"RUNTIME_LABEL": "custom", "DJANGO_DATABASE_MODE": "standard", "GUNICORN_WORKER_CLASS": "sync", "GUNICORN_WORKERS": "0"}),
        ("custom", {"RUNTIME_LABEL": "custom", "DJANGO_DATABASE_MODE": "standard", "GUNICORN_WORKER_CLASS": "sync", "GUNICORN_THREADS": "many"}),
    ],
)
def test_invalid_runtime_inputs_fail(tmp_path, mode, environment):
    result, runtime, _ = render(tmp_path, mode, **environment)
    assert result.returncode != 0
    assert runtime is None


def inspect_database(mode, conn_max_age="0", pool_max="20"):
    env = os.environ.copy()
    env.update(
        DJANGO_DATABASE_MODE=mode,
        DJANGO_CONN_MAX_AGE=conn_max_age,
        DJANGO_GEVENT_POOL_MAX=pool_max,
    )
    code = (
        "import json; from config.settings import DATABASES; "
        "print(json.dumps(DATABASES['default'], sort_keys=True))"
    )
    result = subprocess.run(
        [sys.executable, "-c", code], cwd=ROOT, env=env,
        text=True, capture_output=True, check=True,
    )
    return json.loads(result.stdout.strip().splitlines()[-1])


def test_settings_select_only_normalized_standard_backend():
    database = inspect_database("standard", "60")
    assert database["ENGINE"] == "django.db.backends.postgresql"
    assert database["CONN_MAX_AGE"] == 60
    assert "OPTIONS" not in database


def test_settings_select_only_normalized_geventpool_backend():
    database = inspect_database("geventpool", "0", "20")
    assert database["ENGINE"] == "django_db_geventpool.backends.postgresql_psycopg2"
    assert database["CONN_MAX_AGE"] == 0
    assert database["OPTIONS"] == {"MAX_CONNS": 20}
