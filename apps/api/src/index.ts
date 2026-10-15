import { createServer } from 'node:http';
import { prisma } from '@judgehint/db';
import { createApp } from './app.js';
import { env } from './config.js';
import { logger } from './lib/logger.js';
import { closeQueues } from './lib/queue.js';
import { redis } from './lib/redis.js';
import { startJudgeEventBridge } from './realtime/judgeEvents.js';
import { createSocketServer } from './realtime/socket.js';

const app = createApp();
const server = createServer(app);
const io = createSocketServer(server);
const stopBridge = await startJudgeEventBridge(io, redis);

server.listen(env.API_PORT, () => {
  logger.info(`API listening on http://localhost:${env.API_PORT}`);
});

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(`${signal} received, shutting down`);
  await new Promise<void>((resolve) => io.close(() => resolve()));
  await Promise.allSettled([stopBridge(), prisma.$disconnect(), redis.quit(), closeQueues()]);
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
