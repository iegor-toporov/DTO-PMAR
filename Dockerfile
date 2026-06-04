# syntax=docker/dockerfile:1
FROM python:3.12-slim

# System libraries for geospatial stack
RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential \
        g++ \
        cmake \
        libgdal-dev \
        gdal-bin \
        libgeos-dev \
        libproj-dev \
        proj-bin \
        libhdf5-dev \
        libnetcdf-dev \
        libspatialindex-dev \
        curl \
        git \
    && rm -rf /var/lib/apt/lists/*

# Non-root user
RUN useradd -m -u 1000 appuser

WORKDIR /app

# Install Python dependencies before copying full source (layer cache)
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt \
    && pip install --no-cache-dir gevent gunicorn

# Install pygeoapi from local source (pinned dev version not on PyPI)
COPY venv/pygeoapi/ ./venv/pygeoapi/
RUN pip install --no-cache-dir ./venv/pygeoapi/

# Install private PMAR package (token injected at build time, never stored in image)
RUN --mount=type=secret,id=git_token \
    if [ -f /run/secrets/git_token ]; then \
        TOKEN=$(tr -d '[:space:]' < /run/secrets/git_token) && \
        GIT_TERMINAL_PROMPT=0 pip install --no-cache-dir \
            "git+https://iegor-toporov:${TOKEN}@github.com/iegor-toporov/pmar.git"; \
    fi

# Copy application source
COPY processes/ ./processes/
COPY pygeoapi-config.yml ./
COPY scripts/entrypoint.sh ./scripts/entrypoint.sh
COPY worker/ ./worker/

RUN chown -R appuser:appuser /app
USER appuser

EXPOSE 5001

HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
    CMD curl -f http://localhost:5001/ || exit 1

ENTRYPOINT ["/app/scripts/entrypoint.sh"]
