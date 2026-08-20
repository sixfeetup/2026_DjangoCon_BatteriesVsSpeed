#!/usr/bin/env bash
python -m manage migrate
python -m manage collectstatic --noinput

python -m manage tailwind runserver 0.0.0.0:8000
