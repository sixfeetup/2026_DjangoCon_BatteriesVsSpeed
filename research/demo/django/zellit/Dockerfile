FROM python:3.12.12-slim-bookworm AS builder-py

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONPATH=/code
ENV PYTHONUNBUFFERED=1
ENV PYTHONWARNINGS=ignore

RUN --mount=type=cache,target=/var/cache/apt,sharing=locked,id=apt \
    apt update && \
    apt install -y build-essential gcc git libpq-dev postgresql-client

RUN --mount=type=cache,target=/root/.cache,id=pip \
    pip install -U pip uv

COPY ./requirements.txt ./code/requirements.txt

RUN --mount=type=cache,target=/root/.cache,id=pip \
    python -m uv pip install --system --requirement /code/requirements.txt

RUN rm -f `find . -iname "*.c"` && \
    rm -f `find . -iname "*.pyc"` && \
    rm -f `find . -iname "*.pyx"` && \
    rm -rf `find . -iname "__pycache__"`

FROM python:3.12.12-slim-bookworm AS release

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONPATH=/code
ENV PYTHONUNBUFFERED=1
ENV PYTHONWARNINGS=ignore

RUN mkdir /code

RUN --mount=type=cache,target=/var/cache/apt,sharing=locked,id=apt \
    apt update && \
    apt install --no-install-recommends -y git libpq-dev curl gnupg2 lsb-release apt-transport-https ca-certificates

# Add the PGDG apt repo
RUN echo "deb http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list

# Trust the PGDG gpg key
RUN curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc| gpg --dearmor -o /etc/apt/trusted.gpg.d/postgresql.gpg

RUN --mount=type=cache,target=/var/cache/apt,sharing=locked,id=apt \
    apt update \
    && apt -y install postgresql-client-17 git libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder-py /usr/local /usr/local
COPY . /code/

WORKDIR /code

# Tailwind download
RUN DATABASE_URL=sqlite://:memory: SECRET_KEY=nope-nope-nope python -m manage tailwind --skip-checks download_cli
RUN DATABASE_URL=sqlite://:memory: SECRET_KEY=nope-nope-nope python -m manage tailwind --skip-checks build

CMD ["gunicorn", "-c", "/code/gunicorn.conf.py", "config.wsgi"]

ENV X_IMAGE_TAG=v0.0.0

LABEL Description="AlphaKit Image" Vendor="REVSYS"
LABEL Version="${X_IMAGE_TAG}"
