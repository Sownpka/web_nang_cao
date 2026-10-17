import { Router } from 'express';
import { param } from '../../lib/params.js';
import { currentUser, requireAuth } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import { assignmentInputSchema } from '../assignments/assignments.schema.js';
import * as assignmentsService from '../assignments/assignments.service.js';
import { classroomInputSchema, joinClassroomSchema } from './classrooms.schema.js';
import * as classroomsService from './classrooms.service.js';

export const classroomsRouter = Router();
const staff = requireRole('TEACHER', 'ADMIN');

classroomsRouter.use(requireAuth);

classroomsRouter.get('/', async (req, res) => {
  res.json(await classroomsService.listClassrooms(currentUser(req)));
});

classroomsRouter.post('/', staff, async (req, res) => {
  const input = classroomInputSchema.parse(req.body);
  res.status(201).json(await classroomsService.createClassroom(input, currentUser(req)));
});

classroomsRouter.post('/join', requireRole('STUDENT'), async (req, res) => {
  const input = joinClassroomSchema.parse(req.body);
  res.json(await classroomsService.joinClassroom(input, currentUser(req)));
});

classroomsRouter.get('/:id', async (req, res) => {
  res.json(await classroomsService.getClassroom(param(req, 'id'), currentUser(req)));
});

classroomsRouter.delete('/:id/members/:userId', staff, async (req, res) => {
  await classroomsService.removeMember(param(req, 'id'), param(req, 'userId'), currentUser(req));
  res.status(204).end();
});

classroomsRouter.get('/:id/assignments', async (req, res) => {
  res.json(await assignmentsService.listAssignments(param(req, 'id'), currentUser(req)));
});

classroomsRouter.post('/:id/assignments', staff, async (req, res) => {
  const input = assignmentInputSchema.parse(req.body);
  res.status(201).json(await assignmentsService.createAssignment(param(req, 'id'), input, currentUser(req)));
});
