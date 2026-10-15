# Sandbox image for judging JavaScript submissions.
# The worker runs it read-only as nobody with no network; code arrives via env and lives in tmpfs /tmp.
FROM node:20-alpine
ENV NODE_ENV=production
WORKDIR /tmp
USER 65534:65534
