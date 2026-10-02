FROM python:3.15.0rc2-alpine@sha256:a73535961d3114b7b2e6948ef2dd8d295b885a76d3c23e87e688856713c1cbac AS build
RUN apk add --no-cache build-base mariadb-connector-c-dev pkgconf
RUN pip install --no-cache-dir uv==0.12.22
WORKDIR /repo/backend
COPY backend/pyproject.toml backend/uv.lock ./
COPY data/domain-data.json data/faq-data.json /repo/data/
COPY backend/club_api ./club_api
RUN uv sync --frozen --no-dev --no-editable --python /usr/local/bin/python
RUN .venv/bin/python -m compileall -q -b -s /repo -p /app .venv/lib/python3.14/site-packages/club_api \
    && find .venv/lib/python3.14/site-packages/club_api -type f -name '*.py' -delete \
    && find .venv/lib/python3.14/site-packages/club_api -type d -name __pycache__ -exec rm -rf {} + \
    && rm .venv/lib/python3.14/site-packages/club_api-0.1.0.dist-info/direct_url.json

FROM python:3.15.0rc2-alpine@sha256:a73535961d3114b7b2e6948ef2dd8d295b885a76d3c23e87e688856713c1cbac AS runtime
ARG VCS_REF
LABEL org.opencontainers.image.revision=$VCS_REF
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PATH=/opt/venv/bin:$PATH
RUN apk upgrade --no-cache && apk add --no-cache mariadb-connector-c
RUN addgroup -g 1000 club && adduser -D -H -u 1000 -G club club \
    && mkdir -p /data/uploads && chown club:club /data/uploads \
    && rm -rf /usr/local/lib/python3.14/site-packages/pip* /usr/local/bin/pip*
WORKDIR /app
COPY --from=build /repo/backend/.venv /opt/venv
USER club
EXPOSE 3000
CMD ["python", "-m", "club_api.main"]
