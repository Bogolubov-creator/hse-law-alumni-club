# Контекст сборки — корень монорепо (см. docker-compose.yml).
FROM node:20-alpine AS build
RUN corepack enable
WORKDIR /repo
COPY pnpm-workspace.yaml package.json tsconfig.base.json pnpm-lock.yaml* ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
# Воспроизводимая установка: точно по pnpm-lock.yaml (дрейф лок-файла = ошибка сборки).
RUN pnpm install --frozen-lockfile
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN pnpm --filter @club/shared build && pnpm --filter @club/api build
RUN pnpm --filter @club/api deploy --prod /app

FROM node:20-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app .
# Не root: процесс работает под встроенным непривилегированным пользователем node.
USER node
EXPOSE 3000
CMD ["node", "dist/server.js"]
