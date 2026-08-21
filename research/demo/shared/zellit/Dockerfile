FROM ghcr.io/astral-sh/uv:0.11.26 AS uv
FROM python:3.12.12-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy

COPY --from=uv /uv /uvx /bin/
WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project
COPY src ./src
COPY data/spec.json data/zip_codes.csv data/manifest.json data/benchmark_requests.csv ./data/
RUN uv sync --frozen --no-dev
ENTRYPOINT ["/app/.venv/bin/zellit-data"]
