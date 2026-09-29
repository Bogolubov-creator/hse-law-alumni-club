# Контекст сборки – корень монорепо. Одноразовый прогон bootstrap'а.
FROM node:24.21.0-alpine@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1
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
