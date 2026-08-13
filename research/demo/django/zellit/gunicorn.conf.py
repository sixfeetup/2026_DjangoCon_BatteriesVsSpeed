# vim: ft=python
# pylint: disable=missing-docstring, line-too-long, invalid-name
from __future__ import annotations

import os

BASE_DIR = os.environ["H"] if os.environ.get("H", None) else "/code"

errorlog = "-"
bind = "unix:/run/gunicorn.sock"
log_level = "ERROR"
workers = 1
worker_tmp_dir = "/dev/shm"

worker_class = "gevent"
keepalive = 32
worker_connections = 10000

pythonpath = BASE_DIR
chdir = BASE_DIR


def post_fork(server, worker):
    from gevent import monkey

    monkey.patch_all()
