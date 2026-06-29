# Контекст сборки — корень монорепо.
FROM node:20-alpine AS build
RUN corepack enable
WORKDIR /repo
COPY pnpm-workspace.yaml package.json tsconfig.base.json pnpm-lock.yaml* ./
COPY packages/shared/package.json packages/shared/
COPY apps/web/package.json apps/web/
RUN pnpm install --no-frozen-lockfile
COPY packages/shared packages/shared
COPY apps/web apps/web
RUN pnpm --filter @club/shared build && pnpm --filter @club/web build

# Статика отдаётся отдельным Caddy внутри контейнера; внешний Caddy проксирует на него.
FROM caddy:2-alpine AS runtime
COPY --from=build /repo/apps/web/dist /srv
COPY apps/web/Caddyfile.static /etc/caddy/Caddyfile
EXPOSE 80
