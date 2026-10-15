import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { QUEUE_SUBMISSIONS, type SubmissionJobData } from '@judgehint/shared';
import { env } from '../config.js';

const connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });

export const submissionsQueue = new Queue<SubmissionJobData>(QUEUE_SUBMISSIONS, {
  connection,
  defaultJobOptions: {
    // Retries only cover sandbox/infrastructure failures; the worker marks SYSTEM_ERROR on the last one.
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: 1000,
    removeOnFail: 1000,
  },
});

export async function closeQueues() {
  await submissionsQueue.close();
  await connection.quit();
}
