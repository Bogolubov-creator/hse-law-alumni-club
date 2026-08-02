# Контекст сборки — корень монорепо. Одноразовый прогон bootstrap'а.
FROM node:20.20.2-alpine@sha256:fb4cd12c85ee03686f6af5362a0b0d56d50c58a04632e6c0fb8363f609372293
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
