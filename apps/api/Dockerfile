# Контекст сборки – корень монорепо (см. docker-compose.yml).
FROM node:24.21.0-alpine@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1 AS build
RUN corepack enable
WORKDIR /repo
COPY pnpm-workspace.yaml package.json tsconfig.base.json pnpm-lock.yaml* ./
COPY packages/shared/package.json packages/shared/
COPY packages/server-auth/package.json packages/server-auth/
COPY apps/api/package.json apps/api/
# Воспроизводимая установка: точно по pnpm-lock.yaml (дрейф лок-файла = ошибка сборки).
RUN pnpm install --frozen-lockfile
COPY packages/shared packages/shared
COPY packages/server-auth packages/server-auth
COPY apps/api apps/api
RUN pnpm --filter @club/shared build && pnpm --filter @club/server-auth build && pnpm --filter @club/api build
RUN pnpm --filter @club/api deploy --prod /app
# Каталог зеркала и демонстрационные записи нужны явному импорту/bootstrap, не API.
RUN rm /app/node_modules/@club/shared/dist/seeds.js /app/node_modules/@club/shared/dist/seeds.d.ts \
    /app/node_modules/@club/shared/dist/dpo-mirror-catalog.generated.js \
    /app/node_modules/@club/shared/dist/dpo-mirror-catalog.generated.d.ts

FROM node:24.21.0-alpine@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1 AS runtime
ARG VCS_REF
LABEL org.opencontainers.image.revision=$VCS_REF
ENV NODE_ENV=production
# В рабочем образе запускается только Node; менеджеры пакетов нужны на этапе сборки.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack /opt/yarn-* \
    && rm -f /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /usr/local/bin/yarn /usr/local/bin/yarnpkg
WORKDIR /app
RUN mkdir -p /data/uploads && chown node:node /data/uploads
COPY --from=build /app .
# Не root: процесс работает под встроенным непривилегированным пользователем node.
USER node
EXPOSE 3000
CMD ["node", "dist/server.js"]
