import { Router } from 'express';
import { param } from '../../lib/params.js';
import { currentUser, requireAuth } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import { assignmentInputSchema } from './assignments.schema.js';
import * as assignmentsService from './assignments.service.js';

/** /assignments/:id routes; creation lives under /classrooms/:id/assignments. */
export const assignmentsRouter = Router();
const staff = requireRole('TEACHER', 'ADMIN');

assignmentsRouter.use(requireAuth);

assignmentsRouter.get('/:id', async (req, res) => {
  res.json(await assignmentsService.getAssignment(param(req, 'id'), currentUser(req)));
});

assignmentsRouter.put('/:id', staff, async (req, res) => {
  const input = assignmentInputSchema.parse(req.body);
  res.json(await assignmentsService.updateAssignment(param(req, 'id'), input, currentUser(req)));
});

assignmentsRouter.delete('/:id', staff, async (req, res) => {
  await assignmentsService.deleteAssignment(param(req, 'id'), currentUser(req));
  res.status(204).end();
});

assignmentsRouter.get('/:id/leaderboard', async (req, res) => {
  res.json(await assignmentsService.getAssignmentLeaderboard(param(req, 'id'), currentUser(req)));
});
