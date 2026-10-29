# Workbench companion service (pure Python, ~40 MB RAM)
FROM python:3.12-slim
COPY --from=ghcr.io/astral-sh/uv:0.9 /uv /usr/local/bin/uv
WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project
COPY workbench_server ./workbench_server
ENV PATH="/app/.venv/bin:$PATH" PYTHONUNBUFFERED=1 WB_DB=/data/workbench.db
VOLUME /data
EXPOSE 8000
CMD ["uvicorn", "workbench_server.app:create_app", "--factory", "--host", "0.0.0.0", "--port", "8000", "--no-access-log"]
