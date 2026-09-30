# Контекст сборки – корень монорепо. Одноразовый прогон bootstrap'а.
FROM node:26.10.0-alpine@sha256:0b36e8c136b94cd4fcf02188228e76c31ad5872eef3fec8cbd2eee500cfd9e80 AS build
RUN npm install --global corepack@0.36.0 && corepack enable
WORKDIR /repo
COPY pnpm-workspace.yaml package.json tsconfig.base.json pnpm-lock.yaml* ./
COPY packages/shared/package.json packages/shared/
COPY packages/server-auth/package.json packages/server-auth/
COPY scripts/package.json scripts/
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN pnpm --filter @club/scripts... --filter club-pravo-hse install --frozen-lockfile
COPY packages/shared packages/shared
COPY packages/server-auth packages/server-auth
COPY scripts scripts
RUN pnpm --filter @club/shared build && pnpm --filter @club/server-auth build && pnpm --filter @club/scripts build
RUN pnpm --filter @club/scripts deploy --prod /app
RUN rm /app/pnpm-lock.yaml /app/pnpm-workspace.yaml \
    /app/node_modules/.modules.yaml /app/node_modules/.pnpm-workspace-state-v1.json \
    /app/node_modules/.pnpm/lock.yaml

FROM node:26.10.0-alpine@sha256:0b36e8c136b94cd4fcf02188228e76c31ad5872eef3fec8cbd2eee500cfd9e80
ARG VCS_REF
LABEL org.opencontainers.image.revision=$VCS_REF
ENV NODE_ENV=production
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack /opt/yarn-* \
    && rm -f /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /usr/local/bin/yarn /usr/local/bin/yarnpkg
WORKDIR /app
COPY --from=build /app .
USER node
CMD ["node", "dist/native-bootstrap.js"]
