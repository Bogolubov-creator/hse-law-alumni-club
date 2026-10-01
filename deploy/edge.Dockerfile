FROM golang:1.27.1-alpine@sha256:8a5910f31396cd4d89662f56c68b3ae31d374308270a1c3bd96672ee5ed43414 AS edge-source
ENV CGO_ENABLED=0 GOTOOLCHAIN=local GOMAXPROCS=2
RUN apk add --no-cache patch
WORKDIR /caddy
COPY deploy/caddy/go.mod deploy/caddy/go.sum ./locked/
COPY deploy/caddy/go.mod deploy/caddy/go.sum ./
RUN --mount=type=cache,target=/go/pkg/mod go mod download
COPY deploy/caddy/main.go ./
COPY deploy/caddy/compatibility.patch deploy/caddy/vendor.sh deploy/caddy/prepare.sh ./
COPY deploy/caddy/tests ./tests
RUN --mount=type=cache,target=/go/pkg/mod sh prepare.sh

FROM edge-source AS edge-lock-update
RUN --mount=type=cache,target=/go/pkg/mod --mount=type=cache,target=/root/.cache/go-build \
    sh vendor.sh tidy

FROM scratch AS edge-lock-export
COPY --from=edge-lock-update /caddy/go.mod /caddy/go.sum /

FROM edge-source AS edge-build
RUN --mount=type=cache,target=/go/pkg/mod --mount=type=cache,target=/root/.cache/go-build \
    cmp go.mod locked/go.mod && cmp go.sum locked/go.sum && \
    sh vendor.sh vendor && \
    go build -mod=vendor -p 2 -trimpath -ldflags='-s -w' -o /usr/bin/caddy . && \
    go version -m /usr/bin/caddy > /caddy/build-info.txt && \
    grep -E 'dep[[:space:]]+cel.dev/cel-go[[:space:]]+v0.32.0[[:space:]]' /caddy/build-info.txt && \
    grep -E 'dep[[:space:]]+github.com/KimMachineGun/automemlimit[[:space:]]+v1.0.0[[:space:]]' /caddy/build-info.txt && \
    ! grep -F 'github.com/google/cel-go' /caddy/build-info.txt

FROM edge-build AS edge-test
RUN --mount=type=cache,target=/go/pkg/mod --mount=type=cache,target=/root/.cache/go-build \
    go test -mod=vendor -p 2 -v ./...
FROM edge-test AS edge-check
RUN --mount=type=cache,target=/go/pkg/mod --mount=type=cache,target=/root/.cache/go-build \
    go install -p 2 golang.org/x/vuln/cmd/govulncheck@v1.8.0 && \
    GOMEMLIMIT=2GiB GOFLAGS=-mod=vendor \
    /go/bin/govulncheck -show verbose,traces ./...

FROM caddy:2.11.4-alpine@sha256:6aeddd44c3078b0f9a35206472a11420648a79c184603ef95957d0a20044cb2b AS caddy
ARG VCS_REF
LABEL org.opencontainers.image.revision=$VCS_REF
COPY --from=edge-build /usr/bin/caddy /usr/bin/caddy
COPY deploy/caddy/LICENSE /usr/share/licenses/club-caddy/LICENSE
LABEL club.caddy.backports="d0e93c2,b2693fb,df77f8b"

FROM node:24.21.0-alpine@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1 AS web-build
RUN npm install --global corepack@0.36.0 && corepack enable
WORKDIR /repo
COPY pnpm-workspace.yaml package.json tsconfig.base.json pnpm-lock.yaml ./
COPY packages/shared/package.json packages/shared/
COPY frontend/package.json frontend/
RUN pnpm --filter @club/web... --filter club-pravo-hse install --frozen-lockfile
COPY packages/shared packages/shared
COPY frontend frontend
ARG VITE_SITE_URL=http://localhost
ARG VITE_MEDIA_URL=http://localhost
ENV VITE_SITE_URL=$VITE_SITE_URL VITE_MEDIA_URL=$VITE_MEDIA_URL
RUN pnpm --filter @club/shared build && pnpm --filter @club/web build

FROM caddy AS web
COPY --from=web-build /repo/frontend/dist /srv
COPY deploy/web.Caddyfile /etc/caddy/Caddyfile
EXPOSE 80
