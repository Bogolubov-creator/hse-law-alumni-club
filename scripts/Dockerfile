# Контекст сборки – корень монорепо. Одноразовый прогон bootstrap'а.
FROM node:26.9.0-alpine@sha256:dbaa92e5758cbbcf85d65d5403fdb530fe3442cbe8c6dbfb7ef23365450d5070
RUN corepack enable
WORKDIR /repo
COPY pnpm-workspace.yaml package.json tsconfig.base.json pnpm-lock.yaml* ./
COPY packages/shared/package.json packages/shared/
COPY scripts/package.json scripts/
RUN pnpm install --frozen-lockfile
COPY packages/shared packages/shared
COPY scripts scripts
RUN pnpm --filter @club/shared build
CMD ["pnpm", "--filter", "@club/scripts", "bootstrap"]
