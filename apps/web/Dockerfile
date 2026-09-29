# Контекст сборки – корень монорепо.
FROM node:24.21.0-alpine@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1 AS build
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
# VITE_LOCAL_REVIEW – только локальные стенды (баннер «проект» на legal).
# Сюда намеренно НЕ пробрасываем: прод-образ не должен получать этот флаг.
ARG VITE_SITE_URL=http://localhost
ARG VITE_DIRECTUS_URL=http://localhost:8055
ENV VITE_SITE_URL=$VITE_SITE_URL
ENV VITE_DIRECTUS_URL=$VITE_DIRECTUS_URL
RUN pnpm --filter @club/shared build && pnpm --filter @club/web build

# Статика отдаётся отдельным Caddy внутри контейнера; внешний Caddy проксирует на него.
FROM caddy:2.11.4-alpine@sha256:6aeddd44c3078b0f9a35206472a11420648a79c184603ef95957d0a20044cb2b AS runtime
COPY --from=build /repo/apps/web/dist /srv
COPY apps/web/Caddyfile.static /etc/caddy/Caddyfile
EXPOSE 80
