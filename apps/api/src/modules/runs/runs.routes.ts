import { Router } from 'express';
import { param } from '../../lib/params.js';
import { currentUser, requireAuth } from '../../middleware/auth.js';
import { rateLimit } from '../../middleware/rateLimit.js';
import { runSamplesSchema } from './runs.schema.js';
import * as runsService from './runs.service.js';

/** Mounted at /api: POST /problems/:id/run-samples and GET /runs/:runId. */
export const runsRouter = Router();

const runLimiter = rateLimit({
  name: 'run',
  limit: 1,
  windowSec: 3,
  key: (req) => req.user?.id,
  message: 'Bạn chạy thử quá nhanh, vui lòng chờ vài giây',
});

runsRouter.post('/problems/:id/run-samples', requireAuth, runLimiter, async (req, res) => {
  const input = runSamplesSchema.parse(req.body);
  res.status(202).json(await runsService.createRun(param(req, 'id'), input, currentUser(req)));
});

runsRouter.get('/runs/:runId', requireAuth, async (req, res) => {
  res.json(await runsService.getRun(param(req, 'runId'), currentUser(req)));
});
