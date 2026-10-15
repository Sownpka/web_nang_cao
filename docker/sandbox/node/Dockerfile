# Sandbox image for judging JavaScript submissions. Runs as nobody; limits are applied by the worker.
FROM node:20-alpine
ENV NODE_ENV=production
WORKDIR /sandbox
USER 65534:65534
CMD ["node", "main.js"]
