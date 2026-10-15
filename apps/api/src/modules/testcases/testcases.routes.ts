import { Router } from 'express';
import { param } from '../../lib/params.js';
import { currentUser } from '../../middleware/auth.js';
import { testCaseBulkSchema, testCaseInputSchema, testCaseUpdateSchema } from './testcases.schema.js';
import * as testCasesService from './testcases.service.js';

/** Mounted at /problems/:id/testcases behind requireAuth + TEACHER/ADMIN. */
export const testCasesRouter = Router({ mergeParams: true });

testCasesRouter.get('/', async (req, res) => {
  res.json(await testCasesService.listTestCases(param(req, 'id'), currentUser(req)));
});

testCasesRouter.post('/', async (req, res) => {
  const input = testCaseInputSchema.parse(req.body);
  res.status(201).json(await testCasesService.createTestCase(param(req, 'id'), input, currentUser(req)));
});

testCasesRouter.post('/bulk', async (req, res) => {
  const input = testCaseBulkSchema.parse(req.body);
  res.status(201).json(await testCasesService.bulkCreateTestCases(param(req, 'id'), input, currentUser(req)));
});

testCasesRouter.get('/:testId', async (req, res) => {
  res.json(await testCasesService.getTestCase(param(req, 'id'), param(req, 'testId'), currentUser(req)));
});

testCasesRouter.put('/:testId', async (req, res) => {
  const input = testCaseUpdateSchema.parse(req.body);
  res.json(await testCasesService.updateTestCase(param(req, 'id'), param(req, 'testId'), input, currentUser(req)));
});

testCasesRouter.delete('/:testId', async (req, res) => {
  await testCasesService.deleteTestCase(param(req, 'id'), param(req, 'testId'), currentUser(req));
  res.status(204).end();
});
