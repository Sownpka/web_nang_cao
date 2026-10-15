import { mkdir } from 'node:fs/promises';
import Docker from 'dockerode';
import { Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { prisma } from '@judgehint/db';
import { QUEUE_SUBMISSIONS, type SubmissionJobData } from '@judgehint/shared';
import { env } from './config.js';
import { logger } from './logger.js';

const docker = new Docker();
// BullMQ workers require maxRetriesPerRequest = null on their connection.
const connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });

async function checkDocker() {
  try {
    const info = await docker.version();
    logger.info(`Docker daemon reachable (engine ${info.Version})`);
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'Docker daemon not reachable — judging will fail until it is up');
  }
}

async function main() {
  await mkdir(env.JUDGE_WORKDIR, { recursive: true });
  await checkDocker();

  const worker = new Worker<SubmissionJobData>(
    QUEUE_SUBMISSIONS,
    async (job) => {
      // Real sandbox judging lands in week 4 (runner/dockerRunner.ts).
      logger.info({ submissionId: job.data.submissionId }, 'received submission (judge not implemented yet)');
    },
    { connection, concurrency: env.JUDGE_CONCURRENCY },
  );

  worker.on('ready', () =>
    logger.info(`Listening on queue "${QUEUE_SUBMISSIONS}" with concurrency ${env.JUDGE_CONCURRENCY}`),
  );
  worker.on('failed', (job, err) => logger.error({ jobId: job?.id, err: err.message }, 'job failed'));
  worker.on('error', (err) => logger.error({ err: err.message }, 'worker error'));

  const shutdown = async (signal: string) => {
    logger.info(`${signal} received, draining worker`);
    await worker.close();
    await Promise.allSettled([connection.quit(), prisma.$disconnect()]);
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.fatal({ err }, 'worker failed to start');
  process.exit(1);
});
