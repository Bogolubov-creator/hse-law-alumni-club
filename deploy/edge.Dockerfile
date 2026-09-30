# Caddy сохраняет свою версию; исправленные Go-зависимости закреплены в go.mod/go.sum.
FROM golang:1.27.1-alpine@sha256:8a5910f31396cd4d89662f56c68b3ae31d374308270a1c3bd96672ee5ed43414 AS edge-build
ENV CGO_ENABLED=0 GOTOOLCHAIN=local GOMAXPROCS=2
WORKDIR /caddy
COPY deploy/caddy/go.mod deploy/caddy/go.sum ./
RUN --mount=type=cache,target=/go/pkg/mod go mod download
COPY deploy/caddy/main.go ./
RUN --mount=type=cache,target=/go/pkg/mod --mount=type=cache,target=/root/.cache/go-build \
    go build -mod=readonly -p 2 -trimpath -ldflags='-s -w' -o /usr/bin/caddy .

FROM caddy:2.11.4-alpine@sha256:6aeddd44c3078b0f9a35206472a11420648a79c184603ef95957d0a20044cb2b AS caddy
ARG VCS_REF
LABEL org.opencontainers.image.revision=$VCS_REF
COPY --from=edge-build /usr/bin/caddy /usr/bin/caddy
COPY deploy/caddy/LICENSE /usr/share/licenses/club-caddy/LICENSE

FROM node:24.21.0-alpine@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1 AS web-build
RUN npm install --global corepack@0.36.0 && corepack enable
WORKDIR /repo
COPY pnpm-workspace.yaml package.json tsconfig.base.json pnpm-lock.yaml ./
COPY packages/shared/package.json packages/shared/
COPY frontend/package.json frontend/
COPY packages/server-auth/package.json packages/server-auth/
COPY backend/package.json backend/
COPY scripts/package.json scripts/
RUN pnpm --filter @club/web... --filter club-pravo-hse install --frozen-lockfile
COPY packages/shared packages/shared
COPY frontend frontend
# Адреса становятся частью SPA при сборке; секреты в build args не передаются.
ARG VITE_SITE_URL=http://localhost
ARG VITE_MEDIA_URL=http://localhost
ENV VITE_SITE_URL=$VITE_SITE_URL VITE_MEDIA_URL=$VITE_MEDIA_URL
RUN pnpm --filter @club/shared build && pnpm --filter @club/web build

FROM caddy AS web
COPY --from=web-build /repo/frontend/dist /srv
COPY deploy/web.Caddyfile /etc/caddy/Caddyfile
EXPOSE 80
