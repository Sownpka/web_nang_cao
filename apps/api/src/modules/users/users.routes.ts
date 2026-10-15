import { Router } from 'express';
import { currentUser, requireAuth } from '../../middleware/auth.js';
import * as usersService from './users.service.js';

export const meRouter = Router();

meRouter.get('/', requireAuth, async (req, res) => {
  res.json(await usersService.getMe(currentUser(req).id));
});
