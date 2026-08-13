# Shared Gunicorn hooks only; effective runtime values are passed by scripts/serve.sh.
from __future__ import annotations

import os

chdir = os.environ.get("H", "/code")
pythonpath = chdir
errorlog = "-"
worker_tmp_dir = "/dev/shm"


def post_fork(server, worker):
    if os.environ.get("GUNICORN_WORKER_CLASS") == "gevent":
        from gevent import monkey

        monkey.patch_all()
