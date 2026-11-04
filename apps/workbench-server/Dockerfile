# Workbench companion service (pure Python, ~40 MB RAM). uv only builds the virtualenv: the
# final image holds Python, the venv and the code, without uv or its cache.
FROM python:3.12-slim AS build
COPY --from=ghcr.io/astral-sh/uv:0.9 /uv /usr/local/bin/uv
WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN UV_NO_CACHE=1 UV_COMPILE_BYTECODE=1 uv sync --frozen --no-dev --no-install-project

FROM python:3.12-slim
WORKDIR /app
COPY --from=build /app/.venv ./.venv
COPY workbench_server ./workbench_server
ENV PATH="/app/.venv/bin:$PATH" PYTHONUNBUFFERED=1 WB_DB=/data/workbench.db
VOLUME /data
EXPOSE 8000
CMD ["uvicorn", "workbench_server.app:create_app", "--factory", "--host", "0.0.0.0", "--port", "8000", "--no-access-log"]
