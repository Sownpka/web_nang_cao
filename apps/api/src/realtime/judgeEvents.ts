import type { Redis } from 'ioredis';
import { JUDGE_EVENTS_CHANNEL, userRoom, type JudgeEvent } from '@judgehint/shared';
import { logger } from '../lib/logger.js';
import type { IoServer } from './socket.js';

/** Routes one worker event to the owner's sockets. */
export function forwardJudgeEvent(io: IoServer, event: JudgeEvent): void {
  switch (event.type) {
    case 'progress': {
      const { type: _t, userId, ...payload } = event;
      io.to(userRoom(userId)).emit('submission:progress', payload);
      break;
    }
    case 'done': {
      const { type: _t, userId, ...payload } = event;
      io.to(userRoom(userId)).emit('submission:done', payload);
      break;
    }
    case 'run-progress': {
      const { type: _t, userId, ...payload } = event;
      io.to(userRoom(userId)).emit('run:progress', payload);
      break;
    }
    case 'run-done':
      io.to(userRoom(event.userId)).emit('run:done', event.result);
      break;
  }
}

/**
 * Subscribes to the worker's Redis channel and relays events over Socket.IO. Every API instance
 * subscribes, so each one reaches the sockets connected to it. Returns a stop function.
 */
export async function startJudgeEventBridge(io: IoServer, redis: Redis): Promise<() => Promise<void>> {
  // A connection in subscriber mode cannot run other commands, so use a dedicated one.
  const subscriber = redis.duplicate();
  subscriber.on('message', (_channel: string, message: string) => {
    try {
      forwardJudgeEvent(io, JSON.parse(message) as JudgeEvent);
    } catch (err) {
      logger.warn({ err: (err as Error).message }, 'ignored malformed judge event');
    }
  });
  await subscriber.subscribe(JUDGE_EVENTS_CHANNEL);
  return async () => {
    await subscriber.quit();
  };
}
