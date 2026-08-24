# Shared Gunicorn hooks only; effective runtime values are passed by scripts/serve.sh.
from __future__ import annotations

import os

chdir = os.environ.get("H", "/code")
pythonpath = chdir
errorlog = "-"
worker_tmp_dir = "/dev/shm"


def post_fork(server, worker):
    if os.environ.get("GUNICORN_WORKER_CLASS") == "gevent":
        # Gunicorn's gevent worker patches the Python standard library before
        # loading the application. psycopg2 is a C extension and requires its
        # own wait callback so database I/O yields to other greenlets.
        from psycogreen.gevent import patch_psycopg

        patch_psycopg()
