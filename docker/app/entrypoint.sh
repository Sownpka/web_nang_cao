#!/bin/sh
# Entrypoint of the "app" image. Usage: entrypoint.sh api | worker | migrate
set -eu
cd /repo

# Loads $1 from the environment, else from /secrets (generated once and kept in a volume), so
# `docker compose up` works without anyone writing secrets into the repo.
ensure_secret() {
  name=$1
  eval "value=\${$name:-}"
  if [ -z "$value" ]; then
    file="/secrets/$(echo "$name" | tr 'A-Z' 'a-z')"
    if [ ! -s "$file" ]; then
      mkdir -p /secrets
      node -e "process.stdout.write(require('crypto').randomBytes(48).toString('hex'))" > "$file"
      echo "[entrypoint] generated $name in $file"
    fi
    value=$(cat "$file")
    export "$name=$value"
  fi
}

case "${1:-}" in
  api)
    ensure_secret JWT_ACCESS_SECRET
    ensure_secret JWT_REFRESH_SECRET
    # A dev .env points the LLM at the host's loopback, which inside a container is the container itself.
    case "${LLM_BASE_URL:-}" in
      *://localhost*|*://127.0.0.1*)
        LLM_BASE_URL=$(echo "$LLM_BASE_URL" | sed -E 's#://(localhost|127\.0\.0\.1)#://host.docker.internal#')
        export LLM_BASE_URL
        ;;
    esac
    exec pnpm --filter @judgehint/api start
    ;;
  worker)
    exec pnpm --filter @judgehint/judge-worker start
    ;;
  migrate)
    pnpm exec prisma migrate deploy
    # SEED_DEMO: "auto" seeds only an empty database, "always" re-seeds, "never" skips.
    case "${SEED_DEMO:-auto}" in
      always) pnpm db:seed ;;
      never) ;;
      *) if pnpm exec tsx docker/app/dbIsEmpty.ts; then pnpm db:seed; else echo "[migrate] database has users, skipping seed"; fi ;;
    esac
    ;;
  *)
    echo "usage: entrypoint.sh api|worker|migrate" >&2
    exit 64
    ;;
esac
