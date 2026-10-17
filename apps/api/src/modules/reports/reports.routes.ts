import { Router } from 'express';
import { attachmentHeader } from '../../lib/csv.js';
import { param } from '../../lib/params.js';
import { currentUser, requireAuth } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import { reportQuerySchema } from './reports.schema.js';
import * as reportsService from './reports.service.js';

/** Teacher-only reporting under /teacher. */
export const reportsRouter = Router();

reportsRouter.use(requireAuth, requireRole('TEACHER', 'ADMIN'));

reportsRouter.get('/assignments/:id/report', async (req, res) => {
  const { format } = reportQuerySchema.parse(req.query);
  const report = await reportsService.getAssignmentReport(param(req, 'id'), currentUser(req));
  if (format === 'json') {
    res.json(report);
    return;
  }
  res
    .type('text/csv; charset=utf-8')
    .set('Content-Disposition', attachmentHeader(`bao-cao-${report.assignment.title}.csv`))
    .set('Cache-Control', 'no-store')
    .send(reportsService.reportToCsv(report));
});
