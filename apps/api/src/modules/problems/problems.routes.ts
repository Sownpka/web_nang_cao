import { Router } from 'express';
import { param } from '../../lib/params.js';
import { currentUser, requireAuth } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import { testCasesRouter } from '../testcases/testcases.routes.js';
import { problemInputSchema, problemListQuerySchema } from './problems.schema.js';
import * as problemsService from './problems.service.js';

export const problemsRouter = Router();
const staff = requireRole('TEACHER', 'ADMIN');

problemsRouter.use(requireAuth);

problemsRouter.get('/', async (req, res) => {
  const query = problemListQuerySchema.parse(req.query);
  res.json(await problemsService.listProblems(currentUser(req), query));
});

problemsRouter.post('/', staff, async (req, res) => {
  const input = problemInputSchema.parse(req.body);
  const problem = await problemsService.createProblem(input, currentUser(req));
  res.status(201).json({ id: problem.id, slug: problem.slug });
});

problemsRouter.get('/:id/manage', staff, async (req, res) => {
  res.json(await problemsService.getProblemForManage(param(req, 'id'), currentUser(req)));
});

problemsRouter.put('/:id', staff, async (req, res) => {
  const input = problemInputSchema.parse(req.body);
  const problem = await problemsService.updateProblem(param(req, 'id'), input, currentUser(req));
  res.json({ id: problem.id, slug: problem.slug });
});

problemsRouter.delete('/:id', staff, async (req, res) => {
  await problemsService.deleteProblem(param(req, 'id'), currentUser(req));
  res.status(204).end();
});

problemsRouter.use('/:id/testcases', staff, testCasesRouter);

// Registered last so it does not shadow the id-based routes above.
problemsRouter.get('/:slug', async (req, res) => {
  res.json(await problemsService.getProblemBySlug(param(req, 'slug'), currentUser(req)));
});
