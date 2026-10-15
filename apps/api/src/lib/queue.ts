import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { QUEUE_RUNS, QUEUE_SUBMISSIONS, type RunJobData, type SubmissionJobData } from '@judgehint/shared';
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

/** Sample runs are throwaway: no retries, nothing kept once processed. */
export const runsQueue = new Queue<RunJobData>(QUEUE_RUNS, {
  connection,
  defaultJobOptions: { attempts: 1, removeOnComplete: true, removeOnFail: true },
});

export async function closeQueues() {
  await Promise.allSettled([submissionsQueue.close(), runsQueue.close()]);
  await connection.quit();
}
