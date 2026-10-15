import { Router } from 'express';
import { param } from '../../lib/params.js';
import { currentUser, requireAuth } from '../../middleware/auth.js';
import { rateLimit } from '../../middleware/rateLimit.js';
import { createSubmissionSchema, submissionListQuerySchema } from './submissions.schema.js';
import * as submissionsService from './submissions.service.js';

export const submissionsRouter = Router();

submissionsRouter.use(requireAuth);

const submitLimiter = rateLimit({
  name: 'submit',
  limit: 1,
  windowSec: 5,
  key: (req) => req.user?.id,
  message: 'Bạn nộp bài quá nhanh, vui lòng chờ 5 giây',
});

// All roles may submit: teachers use it to check their own problems.
submissionsRouter.post('/', submitLimiter, async (req, res) => {
  const input = createSubmissionSchema.parse(req.body);
  res.status(202).json(await submissionsService.createSubmission(input, currentUser(req)));
});

submissionsRouter.get('/', async (req, res) => {
  const query = submissionListQuerySchema.parse(req.query);
  res.json(await submissionsService.listSubmissions(currentUser(req), query));
});

submissionsRouter.get('/:id', async (req, res) => {
  res.json(await submissionsService.getSubmission(param(req, 'id'), currentUser(req)));
});
