from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
RENDERER = ROOT / "scripts" / "render_runtime.py"


def render(tmp_path, mode, **environment):
    env_file = tmp_path / "runtime.env"
    json_file = tmp_path / "runtime.json"
    env = os.environ.copy()
    for name in (
        "RUNTIME_LABEL",
        "GUNICORN_BIND",
        "GUNICORN_WORKER_CLASS",
        "GUNICORN_WORKERS",
        "GUNICORN_THREADS",
        "GUNICORN_WORKER_CONNECTIONS",
        "GUNICORN_TIMEOUT",
        "GUNICORN_KEEPALIVE",
        "GUNICORN_ACCESS_LOG_ENABLED",
        "LOG_LEVEL",
    ):
        env.pop(name, None)
    env.update(environment)
    result = subprocess.run(
        [
            sys.executable,
            str(RENDERER),
            mode,
            "--env-file",
            str(env_file),
            "--json-file",
            str(json_file),
        ],
        cwd=ROOT,
        env=env,
        text=True,
        capture_output=True,
    )
    runtime = json.loads(json_file.read_text()) if json_file.exists() else None
    return result, runtime, env_file


def test_gevent_preset_normalizes_all_effective_fields(tmp_path):
    result, runtime, env_file = render(tmp_path, "gevent-1")
    assert result.returncode == 0, result.stderr
    assert runtime == {
        "access_log_enabled": False,
        "bind": "0.0.0.0:8000",
        "keepalive": 32,
        "log_level": "ERROR",
        "preset": "gevent-1",
        "runtime_label": "gevent-1",
        "schema_version": 1,
        "threads": 1,
        "timeout": 30,
        "worker_class": "gevent",
        "worker_connections": 10000,
        "workers": 1,
    }
    assert "GUNICORN_WORKER_CLASS=gevent" in env_file.read_text()


def test_sync_preset_normalizes_one_sync_worker(tmp_path):
    result, runtime, _ = render(tmp_path, "sync-1")
    assert result.returncode == 0, result.stderr
    assert runtime["runtime_label"] == "sync-1"
    assert runtime["worker_class"] == "sync"
    assert runtime["workers"] == 1
    assert runtime["worker_connections"] == 1000


def test_custom_mode_requires_and_preserves_safe_label(tmp_path):
    result, runtime, _ = render(
        tmp_path,
        "custom",
        RUNTIME_LABEL="sync-4-demo",
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
        (
            "custom",
            {"RUNTIME_LABEL": "bad label", "GUNICORN_WORKER_CLASS": "sync"},
        ),
        (
            "custom",
            {"RUNTIME_LABEL": "custom", "GUNICORN_WORKER_CLASS": "other"},
        ),
        (
            "custom",
            {
                "RUNTIME_LABEL": "custom",
                "GUNICORN_WORKER_CLASS": "sync",
                "GUNICORN_WORKERS": "0",
            },
        ),
        (
            "custom",
            {
                "RUNTIME_LABEL": "custom",
                "GUNICORN_WORKER_CLASS": "sync",
                "GUNICORN_THREADS": "many",
            },
        ),
    ],
)
def test_invalid_runtime_inputs_fail(tmp_path, mode, environment):
    result, runtime, _ = render(tmp_path, mode, **environment)
    assert result.returncode != 0
    assert runtime is None
