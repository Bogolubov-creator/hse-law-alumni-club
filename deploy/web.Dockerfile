FROM python:3.14.10-alpine@sha256:cfe4b5079e5852da965ae14f74a6e2b137ece05b918d27c575fb70de3c85db2b AS build
RUN pip install --no-cache-dir uv==0.13.6
WORKDIR /repo
COPY frontend/pyproject.toml frontend/uv.lock frontend/
COPY frontend/club_web frontend/club_web
COPY frontend/public frontend/public
COPY data data
ENV UV_PROJECT_ENVIRONMENT=/opt/venv UV_COMPILE_BYTECODE=1
RUN uv sync --project frontend --frozen --no-dev --no-editable && \
    /opt/venv/bin/python -m club_web.build --output /opt/venv/lib/python3.14/site-packages/club_web/public && \
    rm /opt/venv/lib/python3.14/site-packages/club_web/mirror.py /opt/venv/lib/python3.14/site-packages/club_web/sync_changes.py /opt/venv/lib/python3.14/site-packages/club_web/build.py && \
    /opt/venv/bin/python -m compileall -q -b -s /opt/venv/lib/python3.14/site-packages -p /app /opt/venv/lib/python3.14/site-packages/club_web && \
    find /opt/venv/lib/python3.14/site-packages/club_web -name '*.py' -delete && \
    find /opt/venv/lib/python3.14/site-packages/club_web -type d -name __pycache__ -exec rm -rf {} + && \
    rm -rf /opt/venv/lib/python3.14/site-packages/club_web/browser /opt/venv/lib/python3.14/site-packages/club_web/styles && \
    find /opt/venv -name direct_url.json -delete

FROM python:3.14.10-alpine@sha256:cfe4b5079e5852da965ae14f74a6e2b137ece05b918d27c575fb70de3c85db2b
ARG VCS_REF
LABEL org.opencontainers.image.revision=$VCS_REF
RUN apk upgrade --no-cache && apk add --no-cache ca-certificates && \
    addgroup -g 1000 club && adduser -D -u 1000 -G club club && \
    rm -rf /usr/local/lib/python3.14/site-packages/pip* /usr/local/bin/pip*
COPY --from=build /opt/venv /opt/venv
ENV PATH=/opt/venv/bin:$PATH PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 WEB_HOST=0.0.0.0 WEB_PORT=80 API_INTERNAL_URL=http://api:3000
WORKDIR /app
USER club
EXPOSE 80
CMD ["python", "-m", "club_web.main"]
