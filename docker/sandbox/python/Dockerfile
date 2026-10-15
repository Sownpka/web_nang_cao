# Sandbox image for judging Python submissions. Runs as nobody; limits are applied by the worker.
FROM python:3.12-alpine
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1
WORKDIR /sandbox
USER 65534:65534
CMD ["python3", "main.py"]
