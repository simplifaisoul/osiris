FROM python:3.12.10-slim AS builder
WORKDIR /build
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
COPY pyproject.toml ./
COPY app ./app
RUN pip install --no-cache-dir --upgrade pip==25.1.1 && pip install --no-cache-dir .

FROM python:3.12.10-slim AS runtime
ENV PATH="/opt/venv/bin:$PATH" PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
RUN groupadd --system --gid 10001 kam && useradd --system --uid 10001 --gid kam kam
WORKDIR /app
COPY --from=builder /opt/venv /opt/venv
COPY --chown=kam:kam app ./app
COPY --chown=kam:kam scripts ./scripts
USER 10001:10001
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--no-server-header"]
