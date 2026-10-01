FROM python:3.14.7-alpine@sha256:9e9fde4d32eedce0b661d9ab91e826b62dddf28e928c230ec55f1866cac66b01 AS build
RUN pip install --no-cache-dir uv==0.12.21
WORKDIR /repo/backend
COPY backend/pyproject.toml backend/uv.lock ./
COPY packages/shared/src/domain-data.json packages/shared/src/faq-data.json /repo/packages/shared/src/
COPY backend/club_api ./club_api
RUN uv sync --frozen --no-dev --no-editable --python /usr/local/bin/python
RUN .venv/bin/python -m compileall -q -b -s /repo -p /app .venv/lib/python3.14/site-packages/club_api \
    && find .venv/lib/python3.14/site-packages/club_api -type f -name '*.py' -delete \
    && find .venv/lib/python3.14/site-packages/club_api -type d -name __pycache__ -exec rm -rf {} + \
    && rm .venv/lib/python3.14/site-packages/club_api-0.1.0.dist-info/direct_url.json

FROM python:3.14.7-alpine@sha256:9e9fde4d32eedce0b661d9ab91e826b62dddf28e928c230ec55f1866cac66b01 AS runtime
ARG VCS_REF
LABEL org.opencontainers.image.revision=$VCS_REF
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PATH=/opt/venv/bin:$PATH
RUN addgroup -g 1000 club && adduser -D -H -u 1000 -G club club \
    && mkdir -p /data/uploads && chown club:club /data/uploads \
    && rm -rf /usr/local/lib/python3.14/site-packages/pip* /usr/local/bin/pip*
WORKDIR /app
COPY --from=build /repo/backend/.venv /opt/venv
USER club
EXPOSE 3000
CMD ["python", "-m", "club_api.main"]
