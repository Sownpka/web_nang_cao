import { Prisma, prisma, type Problem } from '@judgehint/db';
import {
  slugify,
  type Paginated,
  type ProblemDetail,
  type ProblemListItem,
  type ProblemManage,
  type Role,
} from '@judgehint/shared';
import { z } from 'zod';
import { HttpError } from '../../lib/httpError.js';
import { problemListQuerySchema, type ProblemInputParsed } from './problems.schema.js';

export interface Actor {
  id: string;
  role: Role;
}

type ListQuery = z.output<typeof problemListQuerySchema>;

const isStaff = (actor: Actor) => actor.role === 'TEACHER' || actor.role === 'ADMIN';
export const canEditProblem = (p: Pick<Problem, 'authorId'>, actor: Actor) =>
  actor.role === 'ADMIN' || (actor.role === 'TEACHER' && p.authorId === actor.id);

/** Loads a problem by id and checks the actor may modify it. */
export async function findEditableProblem(id: string, actor: Actor): Promise<Problem> {
  const problem = await prisma.problem.findUnique({ where: { id } });
  if (!problem) throw HttpError.notFound('Không tìm thấy bài tập');
  if (!canEditProblem(problem, actor)) throw HttpError.forbidden('Bạn chỉ có thể sửa bài do mình tạo');
  return problem;
}

export async function listProblems(actor: Actor, query: ListQuery): Promise<Paginated<ProblemListItem>> {
  const where: Prisma.ProblemWhereInput = {
    ...(query.difficulty ? { difficulty: query.difficulty } : {}),
    ...(query.q
      ? {
          OR: [
            { title: { contains: query.q, mode: 'insensitive' } },
            { slug: { contains: slugify(query.q) || query.q } },
          ],
        }
      : {}),
    ...(query.mine && isStaff(actor) ? { authorId: actor.id } : {}),
  };

  const [total, rows] = await prisma.$transaction([
    prisma.problem.count({ where }),
    prisma.problem.findMany({
      where,
      orderBy: [{ difficulty: 'asc' }, { createdAt: 'asc' }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      select: { id: true, slug: true, title: true, difficulty: true, allowedLanguages: true, authorId: true, createdAt: true },
    }),
  ]);

  // Per-user status for just this page of problems.
  const stats = rows.length
    ? await prisma.submission.groupBy({
        by: ['problemId', 'verdict'],
        where: { userId: actor.id, problemId: { in: rows.map((r) => r.id) } },
      })
    : [];
  const attempted = new Set(stats.map((s) => s.problemId));
  const solved = new Set(stats.filter((s) => s.verdict === 'ACCEPTED').map((s) => s.problemId));

  return {
    items: rows.map((r) => ({
      ...r,
      createdAt: r.createdAt.toISOString(),
      solved: solved.has(r.id),
      attempted: attempted.has(r.id),
    })),
    total,
    page: query.page,
    pageSize: query.pageSize,
  };
}

export async function getProblemBySlug(slug: string, actor: Actor): Promise<ProblemDetail> {
  const problem = await prisma.problem.findUnique({
    where: { slug },
    include: {
      // Hidden tests never leave the server through this endpoint.
      testCases: { where: { isHidden: false }, orderBy: { order: 'asc' }, select: { order: true, input: true, expected: true } },
      _count: { select: { testCases: true } },
    },
  });
  if (!problem) throw HttpError.notFound('Không tìm thấy bài tập');

  return {
    id: problem.id,
    slug: problem.slug,
    title: problem.title,
    statementMd: problem.statementMd,
    difficulty: problem.difficulty,
    timeLimitMs: problem.timeLimitMs,
    memoryLimitMb: problem.memoryLimitMb,
    allowedLanguages: problem.allowedLanguages,
    aiHintsEnabled: problem.aiHintsEnabled,
    samples: problem.testCases,
    totalTests: problem._count.testCases,
    canEdit: canEditProblem(problem, actor),
  };
}

export async function getProblemForManage(id: string, actor: Actor): Promise<ProblemManage> {
  const problem = await findEditableProblem(id, actor);
  const [totalTests, submissionCount] = await Promise.all([
    prisma.testCase.count({ where: { problemId: id } }),
    prisma.submission.count({ where: { problemId: id } }),
  ]);
  return {
    id: problem.id,
    slug: problem.slug,
    title: problem.title,
    statementMd: problem.statementMd,
    difficulty: problem.difficulty,
    timeLimitMs: problem.timeLimitMs,
    memoryLimitMb: problem.memoryLimitMb,
    allowedLanguages: problem.allowedLanguages,
    aiHintsEnabled: problem.aiHintsEnabled,
    referenceSolution: problem.referenceSolution,
    authorId: problem.authorId,
    totalTests,
    submissionCount,
  };
}

/** Picks a free slug: an explicit slug must be unique, a derived one gets a numeric suffix. */
async function resolveSlug(input: ProblemInputParsed, excludeId?: string): Promise<string> {
  const taken = async (slug: string) =>
    !!(await prisma.problem.findFirst({ where: { slug, ...(excludeId ? { NOT: { id: excludeId } } : {}) }, select: { id: true } }));

  if (input.slug) {
    if (await taken(input.slug)) throw HttpError.conflict('Slug đã được dùng cho bài khác', 'SLUG_TAKEN');
    return input.slug;
  }
  const base = slugify(input.title) || 'bai-tap';
  for (let i = 1; i < 100; i++) {
    const candidate = i === 1 ? base : `${base}-${i}`;
    if (!(await taken(candidate))) return candidate;
  }
  throw HttpError.conflict('Không tạo được slug, vui lòng nhập slug thủ công', 'SLUG_TAKEN');
}

function rethrowSlugConflict(err: unknown): never {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
    throw HttpError.conflict('Slug đã được dùng cho bài khác', 'SLUG_TAKEN');
  }
  throw err;
}

export async function createProblem(input: ProblemInputParsed, actor: Actor) {
  const slug = await resolveSlug(input);
  try {
    return await prisma.problem.create({ data: { ...input, slug, authorId: actor.id } });
  } catch (err) {
    rethrowSlugConflict(err);
  }
}

export async function updateProblem(id: string, input: ProblemInputParsed, actor: Actor) {
  const existing = await findEditableProblem(id, actor);
  // Keep the current slug unless one is given explicitly; links to the problem stay stable.
  const slug = input.slug ? await resolveSlug(input, id) : existing.slug;
  try {
    return await prisma.problem.update({ where: { id }, data: { ...input, slug } });
  } catch (err) {
    rethrowSlugConflict(err);
  }
}

export async function deleteProblem(id: string, actor: Actor): Promise<void> {
  await findEditableProblem(id, actor);
  const [submissions, assignments] = await Promise.all([
    prisma.submission.count({ where: { problemId: id } }),
    prisma.assignmentProblem.count({ where: { problemId: id } }),
  ]);
  if (submissions > 0) throw HttpError.conflict('Bài đã có bài nộp, không thể xóa', 'HAS_SUBMISSIONS');
  if (assignments > 0) throw HttpError.conflict('Bài đang nằm trong một bài tập lớp, hãy gỡ ra trước', 'IN_ASSIGNMENT');
  await prisma.problem.delete({ where: { id } });
}
