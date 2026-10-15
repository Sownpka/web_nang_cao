import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { env } from './config.js';
import { logger } from './lib/logger.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { healthRouter } from './modules/health/health.routes.js';
import { problemsRouter } from './modules/problems/problems.routes.js';
import { submissionsRouter } from './modules/submissions/submissions.routes.js';
import { meRouter } from './modules/users/users.routes.js';

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1); // behind nginx / Cloudflare Tunnel in production

  app.use(helmet());
  app.use(cors({ origin: env.WEB_ORIGIN, credentials: true }));
  // Test cases can be large; body-parser skips the second parser once a body is parsed.
  app.use('/api/problems', express.json({ limit: '8mb' }));
  app.use(express.json({ limit: '256kb' }));
  app.use(cookieParser());
  // Request logs never include bodies, so student code is not logged.
  app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === '/api/health' } }));

  const api = express.Router();
  api.use('/health', healthRouter);
  api.use('/auth', authRouter);
  api.use('/me', meRouter);
  api.use('/problems', problemsRouter);
  api.use('/submissions', submissionsRouter);
  app.use('/api', api);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
