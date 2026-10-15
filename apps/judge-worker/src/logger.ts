import { pino } from 'pino';
import { env, isProd } from './config.js';

export const logger = pino({
  name: 'judge-worker',
  level: env.NODE_ENV === 'test' ? 'silent' : isProd ? 'info' : 'debug',
  transport: isProd ? undefined : { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:HH:MM:ss' } },
});
