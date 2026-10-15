import { Prisma, prisma } from '@judgehint/db';
import {
  Verdict,
  type FailedTestInfo,
  type Paginated,
  type SubmissionDetail,
  type SubmissionListItem,
} from '@judgehint/shared';
import { z } from 'zod';
import { HttpError } from '../../lib/httpError.js';
import { logger } from '../../lib/logger.js';
import { submissionsQueue } from '../../lib/queue.js';
import type { Actor } from '../problems/problems.service.js';
import { submissionListQuerySchema, type CreateSubmissionInput } from './submissions.schema.js';

const isStaff = (actor: Actor) => actor.role === 'TEACHER' || actor.role === 'ADMIN';
const PREVIEW_CHARS = 4 * 1024;

const listSelect = {
  id: true,
  language: true,
  verdict: true,
  passedCount: true,
  totalCount: true,
  runtimeMs: true,
  memoryKb: true,
  createdAt: true,
  problem: { select: { id: true, slug: true, title: true } },
  user: { select: { id: true, fullName: true, studentCode: true } },
} satisfies Prisma.SubmissionSelect;

type ListRow = Prisma.SubmissionGetPayload<{ select: typeof listSelect }>;

const toListItem = (s: ListRow): SubmissionListItem => ({ ...s, createdAt: s.createdAt.toISOString() });

export async function createSubmission(input: CreateSubmissionInput, actor: Actor): Promise<{ submissionId: string }> {
  const problem = await prisma.problem.findUnique({
    where: { id: input.problemId },
    select: { id: true, allowedLanguages: true, _count: { select: { testCases: true } } },
  });
  if (!problem) throw HttpError.notFound('Không tìm thấy bài tập');
  if (!problem.allowedLanguages.includes(input.language)) {
    throw new HttpError(400, 'LANGUAGE_NOT_ALLOWED', 'Bài này không cho phép ngôn ngữ đã chọn');
  }
  if (problem._count.testCases === 0) {
    throw HttpError.conflict('Bài chưa có test case, chưa thể nộp', 'NO_TESTS');
  }

  if (input.assignmentId) {
    const link = await prisma.assignmentProblem.findUnique({
      where: { assignmentId_problemId: { assignmentId: input.assignmentId, problemId: problem.id } },
      select: { assignment: { select: { classroomId: true, startsAt: true } } },
    });
    if (!link) throw HttpError.badRequest('Bài không thuộc bài tập lớp này');
    if (!isStaff(actor)) {
      const enrolled = await prisma.enrollment.findUnique({
        where: { userId_classroomId: { userId: actor.id, classroomId: link.assignment.classroomId } },
      });
      if (!enrolled) throw HttpError.forbidden('Bạn không thuộc lớp của bài tập này');
    }
    if (link.assignment.startsAt.getTime() > Date.now()) throw HttpError.badRequest('Bài tập lớp chưa bắt đầu');
  }

  const submission = await prisma.submission.create({
    data: {
      userId: actor.id,
      problemId: problem.id,
      assignmentId: input.assignmentId ?? null,
      language: input.language,
      code: input.code,
      totalCount: problem._count.testCases,
    },
    select: { id: true },
  });

  try {
    await submissionsQueue.add('judge', { submissionId: submission.id }, { jobId: submission.id });
  } catch (err) {
    logger.error({ err: (err as Error).message, submissionId: submission.id }, 'failed to enqueue submission');
    await prisma.submission.update({ where: { id: submission.id }, data: { verdict: Verdict.SYSTEM_ERROR } });
    throw new HttpError(503, 'QUEUE_UNAVAILABLE', 'Hệ thống chấm đang bận, vui lòng thử lại sau');
  }
  return { submissionId: submission.id };
}

export async function listSubmissions(
  actor: Actor,
  query: z.output<typeof submissionListQuerySchema>,
): Promise<Paginated<SubmissionListItem>> {
  const where: Prisma.SubmissionWhereInput = {
    // Students only ever see their own submissions.
    ...(query.mine || !isStaff(actor) ? { userId: actor.id } : {}),
    ...(query.problemId ? { problemId: query.problemId } : {}),
  };
  const [total, rows] = await prisma.$transaction([
    prisma.submission.count({ where }),
    prisma.submission.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      select: listSelect,
    }),
  ]);
  return { items: rows.map(toListItem), total, page: query.page, pageSize: query.pageSize };
}

/**
 * For failures on hidden tests, students only get the exception name: full stderr could carry the
 * hidden input out (e.g. `raise Exception(input())`).
 */
export function summarizeHiddenStderr(stderr: string | null): string | null {
  if (!stderr) return null;
  const lines = stderr.trim().split('\n').reverse();
  for (const line of lines) {
    const match = /^\s*((?:[A-Za-z_][\w.]*)?(?:Error|Exception|Interrupt|Exit))(?=:|\s|$)/.exec(line);
    if (match) return `${match[1]} (chi tiết bị ẩn vì lỗi xảy ra ở test ẩn)`;
  }
  return 'Chương trình dừng với lỗi (chi tiết bị ẩn vì lỗi xảy ra ở test ẩn)';
}

const clip = (s: string) => (s.length > PREVIEW_CHARS ? `${s.slice(0, PREVIEW_CHARS)}\n…` : s);

export async function getSubmission(id: string, actor: Actor): Promise<SubmissionDetail> {
  const s = await prisma.submission.findUnique({
    where: { id },
    select: { ...listSelect, code: true, stderr: true, failedTestId: true, failedTestIndex: true, actualOutput: true, judgedAt: true },
  });
  if (!s) throw HttpError.notFound('Không tìm thấy bài nộp');
  if (s.user.id !== actor.id && !isStaff(actor)) throw HttpError.forbidden('Bạn chỉ xem được bài nộp của mình');

  let failedTest: FailedTestInfo | null = null;
  let stderr = s.stderr;
  if (s.failedTestIndex !== null) {
    const tc = s.failedTestId
      ? await prisma.testCase.findUnique({ where: { id: s.failedTestId }, select: { isHidden: true, input: true, expected: true } })
      : null;
    // A test deleted after judging is treated as hidden.
    const isHidden = tc?.isHidden ?? true;
    const reveal = !isHidden || isStaff(actor);
    failedTest = {
      number: s.failedTestIndex + 1,
      isHidden,
      ...(reveal && tc ? { input: clip(tc.input), expected: clip(tc.expected), actual: s.actualOutput ?? '' } : {}),
    };
    if (isHidden && !isStaff(actor)) stderr = summarizeHiddenStderr(stderr);
  }

  return {
    ...toListItem(s),
    code: s.code,
    stderr,
    failedTest,
    judgedAt: s.judgedAt?.toISOString() ?? null,
  };
}
