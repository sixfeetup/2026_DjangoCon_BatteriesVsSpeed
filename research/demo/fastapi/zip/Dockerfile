FROM ghcr.io/astral-sh/uv:0.9.9 AS uv
FROM python:3.14.4-slim-bookworm
COPY --from=uv /uv /uvx /bin/
WORKDIR /app
ENV PYTHONUNBUFFERED=1
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project
COPY src ./src
RUN uv sync --frozen --no-dev
EXPOSE 8000
CMD ["uv", "run", "--frozen", "uvicorn", "zip_api.app:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1", "--no-access-log"]
