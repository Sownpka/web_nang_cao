import { Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { prisma } from '@judgehint/db';
import { QUEUE_RUNS, QUEUE_SUBMISSIONS, type RunJobData, type SubmissionJobData } from '@judgehint/shared';
import { env } from './config.js';
import { docker } from './docker.js';
import { judgeSubmission, markSystemError, redisPublisher } from './judgeSubmission.js';
import { logger } from './logger.js';
import { LANGUAGES } from './runner/languages.js';
import { removeLeftoverContainers } from './runner/dockerRunner.js';
import { processRun } from './runSamples.js';

// BullMQ workers require maxRetriesPerRequest = null on their connection.
const connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
const runsConnection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
// Publishing needs its own connection: the worker connection blocks on queue reads.
const publisherConnection = new Redis(env.REDIS_URL);
const publish = redisPublisher(publisherConnection);

async function checkSandbox() {
  try {
    const info = await docker.version();
    logger.info(`Docker daemon reachable (engine ${info.Version})`);
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'Docker daemon not reachable — judging will fail until it is up');
    return;
  }
  for (const spec of Object.values(LANGUAGES)) {
    try {
      await docker.getImage(spec!.image).inspect();
    } catch {
      logger.warn(`Sandbox image ${spec!.image} missing — run \`pnpm build:sandbox\``);
    }
  }
  await sweepLeftovers();
}

/** How often to look for sandbox containers abandoned by a crashed worker. */
const SWEEP_INTERVAL_MS = 60_000;

async function sweepLeftovers() {
  const removed = await removeLeftoverContainers().catch(() => 0);
  if (removed) logger.info(`Removed ${removed} leftover sandbox container(s)`);
}

async function main() {
  await checkSandbox();
  // Not only at start-up: a crashed worker's container is only safe to remove once its deadline passes.
  setInterval(() => void sweepLeftovers(), SWEEP_INTERVAL_MS).unref();

  const worker = new Worker<SubmissionJobData>(
    QUEUE_SUBMISSIONS,
    async (job) => {
      const { submissionId } = job.data;
      try {
        await judgeSubmission(submissionId, publish);
      } catch (err) {
        const attempts = job.opts.attempts ?? 1;
        // Infrastructure failure: let BullMQ retry, and give up with SYSTEM_ERROR on the last attempt.
        if (job.attemptsMade + 1 >= attempts) {
          await markSystemError(submissionId, (err as Error).message, publish).catch((e: Error) =>
            logger.error({ submissionId, err: e.message }, 'could not mark SYSTEM_ERROR'),
          );
          return;
        }
        throw err;
      }
    },
    { connection, concurrency: env.JUDGE_CONCURRENCY },
  );

  worker.on('ready', () =>
    logger.info(`Listening on queue "${QUEUE_SUBMISSIONS}" with concurrency ${env.JUDGE_CONCURRENCY}`),
  );
  worker.on('failed', (job, err) =>
    logger.warn({ jobId: job?.id, attempt: job?.attemptsMade, err: err.message }, 'judge attempt failed, will retry'),
  );
  worker.on('error', (err) => logger.error({ err: err.message }, 'worker error'));

  // "Chạy thử" jobs: one at a time so sample runs never starve real submissions.
  const runsWorker = new Worker<RunJobData>(QUEUE_RUNS, (job) => processRun(job.data, publisherConnection, publish), {
    connection: runsConnection,
    concurrency: 1,
  });
  runsWorker.on('error', (err) => logger.error({ err: err.message }, 'runs worker error'));

  const shutdown = async (signal: string) => {
    logger.info(`${signal} received, draining worker`);
    await Promise.allSettled([worker.close(), runsWorker.close()]);
    await Promise.allSettled([connection.quit(), runsConnection.quit(), publisherConnection.quit(), prisma.$disconnect()]);
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

// One bad job must never take the worker down.
process.on('unhandledRejection', (reason) => logger.error({ reason }, 'unhandled rejection'));

main().catch((err) => {
  logger.fatal({ err }, 'worker failed to start');
  process.exit(1);
});
