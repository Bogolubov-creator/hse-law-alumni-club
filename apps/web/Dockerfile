# Контекст сборки – корень монорепо.
FROM node:26.8.1-alpine@sha256:2d984a15c9b54fd0aeb608b8e0d0d83529eb34d2966db27a1fb4f1edc3d298a3 AS build
RUN corepack enable
WORKDIR /repo
COPY pnpm-workspace.yaml package.json tsconfig.base.json pnpm-lock.yaml* ./
COPY packages/shared/package.json packages/shared/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile
COPY packages/shared packages/shared
COPY apps/web apps/web
# Build-time конфигурация SPA. Vite инлайнит эти значения в бандл на этапе сборки,
# поэтому их нельзя задать в рантайме – только как build-arg (см. docker-compose.yml).
# VITE_SITE_URL – абсолютный домен для og/JSON-LD/canonical в index.html;
# VITE_DIRECTUS_URL – база Studio/ассетов для офисной админ-панели.
ARG VITE_SITE_URL=http://localhost
ARG VITE_DIRECTUS_URL=http://localhost:8055
ENV VITE_SITE_URL=$VITE_SITE_URL
ENV VITE_DIRECTUS_URL=$VITE_DIRECTUS_URL
RUN pnpm --filter @club/shared build && pnpm --filter @club/web build

# Статика отдаётся отдельным Caddy внутри контейнера; внешний Caddy проксирует на него.
FROM caddy:2.11.4-alpine@sha256:5f5c8640aae01df9654968d946d8f1a56c497f1dd5c5cda4cf95ab7c14d58648 AS runtime
COPY --from=build /repo/apps/web/dist /srv
COPY apps/web/Caddyfile.static /etc/caddy/Caddyfile
EXPOSE 80
