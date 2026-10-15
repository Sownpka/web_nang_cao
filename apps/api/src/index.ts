import { createServer } from 'node:http';
import { prisma } from '@judgehint/db';
import { createApp } from './app.js';
import { env } from './config.js';
import { logger } from './lib/logger.js';
import { closeQueues } from './lib/queue.js';
import { redis } from './lib/redis.js';

const app = createApp();
const server = createServer(app);

server.listen(env.API_PORT, () => {
  logger.info(`API listening on http://localhost:${env.API_PORT}`);
});

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(`${signal} received, shutting down`);
  server.close();
  await Promise.allSettled([prisma.$disconnect(), redis.quit(), closeQueues()]);
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
