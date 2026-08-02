# Контекст сборки – корень монорепо. Одноразовый прогон bootstrap'а.
FROM node:26.5.1-alpine@sha256:233761595746769ebfdb6090f44fc7cdf818ae0ce62d2b37e0367723b9823e36
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
