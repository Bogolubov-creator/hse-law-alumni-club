FROM python:3.14.8-alpine@sha256:8acac70227ce3b34da9453120c375cc5b66cd0b062d4dc6bc74286f81a3819e1 AS build
RUN apk add --no-cache build-base mariadb-connector-c-dev pkgconf
RUN pip install --no-cache-dir uv==0.12.22
WORKDIR /repo/scripts
COPY backend/pyproject.toml /repo/backend/
COPY backend/club_api /repo/backend/club_api
COPY data/domain-data.json data/faq-data.json data/dpo-catalog.json /repo/data/
COPY scripts/pyproject.toml scripts/uv.lock ./
COPY scripts/club_ops ./club_ops
RUN uv sync --frozen --no-dev --no-editable --python /usr/local/bin/python
RUN .venv/bin/python -m compileall -q -b -s /repo -p /app .venv/lib/python3.14/site-packages/club_api .venv/lib/python3.14/site-packages/club_ops \
    && find .venv/lib/python3.14/site-packages/club_api .venv/lib/python3.14/site-packages/club_ops -type f -name '*.py' -delete \
    && find .venv/lib/python3.14/site-packages/club_api .venv/lib/python3.14/site-packages/club_ops -type d -name __pycache__ -exec rm -rf {} + \
    && rm .venv/lib/python3.14/site-packages/club_api-0.1.0.dist-info/direct_url.json .venv/lib/python3.14/site-packages/club_ops-0.1.0.dist-info/direct_url.json

FROM python:3.14.8-alpine@sha256:8acac70227ce3b34da9453120c375cc5b66cd0b062d4dc6bc74286f81a3819e1
ARG VCS_REF
LABEL org.opencontainers.image.revision=$VCS_REF
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PATH=/opt/venv/bin:$PATH
RUN apk upgrade --no-cache && apk add --no-cache mariadb-connector-c
RUN addgroup -g 1000 club && adduser -D -H -u 1000 -G club club \
    && rm -rf /usr/local/lib/python3.14/site-packages/pip* /usr/local/bin/pip*
WORKDIR /app
COPY --from=build /repo/scripts/.venv /opt/venv
USER club
CMD ["python", "-m", "club_ops.cli", "bootstrap"]
