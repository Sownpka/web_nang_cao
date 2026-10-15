# Sandbox image for judging Python submissions.
# The worker runs it read-only as nobody with no network; code arrives via env and lives in tmpfs /tmp.
FROM python:3.12-alpine
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONIOENCODING=utf-8
WORKDIR /tmp
USER 65534:65534
