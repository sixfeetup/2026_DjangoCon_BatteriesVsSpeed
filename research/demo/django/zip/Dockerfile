FROM python:3.14.4-slim-bookworm AS builder-py

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONPATH=/code
ENV PYTHONUNBUFFERED=1
ENV PYTHONWARNINGS=ignore

# Install dependencies into the system prefix (/usr/local) so the release
# stage can copy them, and compile bytecode for faster startup.
ENV UV_PROJECT_ENVIRONMENT=/usr/local
ENV UV_COMPILE_BYTECODE=1
ENV UV_LINK_MODE=copy

COPY --from=ghcr.io/astral-sh/uv:0.11.29 /uv /uvx /bin/

RUN --mount=type=cache,target=/var/cache/apt,sharing=locked,id=apt \
    apt update && \
    apt install -y build-essential gcc git libpq-dev postgresql-client

COPY ./pyproject.toml ./uv.lock /code/

RUN --mount=type=cache,target=/root/.cache/uv,id=uv \
    cd /code && uv sync --frozen --no-dev

RUN rm -f `find . -iname "*.c"` && \
    rm -f `find . -iname "*.pyc"` && \
    rm -f `find . -iname "*.pyx"` && \
    rm -rf `find . -iname "__pycache__"`

FROM node:22-slim AS builder-js

WORKDIR /build/frontend

COPY ./frontend/package.json ./frontend/package-lock.json ./
RUN --mount=type=cache,target=/root/.npm,id=npm npm ci

COPY ./frontend ./
RUN npm run build

FROM python:3.14.4-slim-bookworm AS release

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

COPY --from=ghcr.io/astral-sh/uv:0.11.29 /uv /uvx /bin/
COPY --from=builder-py /usr/local /usr/local
COPY . /code/
COPY --from=builder-js /build/frontend/dist/ /code/static/
COPY --from=builder-js /build/frontend/dist/.vite/manifest.json /code/vite-manifest.json

WORKDIR /code

# Tailwind download
RUN DATABASE_URL=sqlite://:memory: SECRET_KEY=nope-nope-nope python -m manage tailwind --skip-checks download_cli
RUN DATABASE_URL=sqlite://:memory: SECRET_KEY=nope-nope-nope python -m manage tailwind --skip-checks build

RUN chmod +x /code/scripts/serve.sh /code/scripts/render_runtime.py

CMD ["gunicorn", "-c", "/code/gunicorn.conf.py", "config.wsgi"]

ENV X_IMAGE_TAG=v0.0.0

LABEL Description="AlphaKit Image" Vendor="REVSYS"
LABEL Version="${X_IMAGE_TAG}"
