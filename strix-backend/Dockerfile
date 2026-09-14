# OSIRIS Strix backend — FastAPI wrapper around the Strix pentesting CLI.
#
# Strix itself launches Docker sandbox containers, so this image ships the
# Docker CLI and expects the host Docker socket to be mounted in (see
# docker-compose.yml). It does NOT run a Docker daemon of its own.
FROM python:3.12-slim

# Docker CLI (to talk to the mounted host socket) + build essentials some
# strix dependencies may need.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        docker.io \
        git \
        curl \
        ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /srv

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py ./

EXPOSE 8700

# Single worker on purpose: job state lives in-process, and concurrency is
# bounded by MAX_CONCURRENT_JOBS inside the app.
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8700", "--workers", "1"]
