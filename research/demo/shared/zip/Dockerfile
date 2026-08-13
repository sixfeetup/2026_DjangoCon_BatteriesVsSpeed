FROM ghcr.io/astral-sh/uv:0.9.9 AS uv
FROM python:3.14.4-slim-bookworm
COPY --from=uv /uv /uvx /bin/
WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project
COPY src ./src
RUN uv sync --frozen --no-dev
ENTRYPOINT ["uv", "run", "--frozen", "zip-data"]
