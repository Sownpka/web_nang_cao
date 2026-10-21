# Production images for JudgeHint, built from the repo root (see docker-compose.yml).
#   target "app": api, judge-worker and the one-shot migrate job (TypeScript run directly with tsx)
#   target "web": the built React app served by nginx, which also proxies /api and /socket.io
FROM node:20-alpine AS deps
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
WORKDIR /repo
# Manifests first so dependency layers are cached across source edits.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc tsconfig.base.json ./
COPY apps/api/package.json apps/api/
COPY apps/judge-worker/package.json apps/judge-worker/
COPY apps/web/package.json apps/web/
COPY packages/db/package.json packages/db/
COPY packages/shared/package.json packages/shared/
COPY e2e/package.json e2e/
# postinstall runs `prisma generate`, which needs the schema.
COPY prisma prisma
RUN pnpm install --frozen-lockfile

FROM deps AS source
COPY packages packages
COPY apps apps
COPY seed seed
COPY docker/app docker/app

FROM source AS app
ENV NODE_ENV=production
# Runs as root: the worker needs the Docker socket. Student code never runs here, only in sandboxes.
ENTRYPOINT ["sh", "/repo/docker/app/entrypoint.sh"]

FROM source AS web-build
RUN pnpm --filter @judgehint/web build

FROM nginx:1.27-alpine AS web
COPY docker/app/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=web-build /repo/apps/web/dist /usr/share/nginx/html
