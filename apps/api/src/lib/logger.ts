import { pino } from 'pino';
import { env, isProd } from '../config.js';

export const logger = pino({
  name: 'api',
  level: env.NODE_ENV === 'test' ? 'silent' : isProd ? 'info' : 'debug',
  // Request logs include headers: never write tokens or session cookies to the log.
  redact: {
    paths: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
    censor: '[redacted]',
  },
  transport: isProd ? undefined : { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:HH:MM:ss' } },
});
