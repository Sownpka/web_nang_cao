import { prisma } from '@judgehint/db';
import { MAX_TESTCASES_PER_PROBLEM, type TestCaseFull, type TestCaseSummary } from '@judgehint/shared';
import { z } from 'zod';
import { HttpError } from '../../lib/httpError.js';
import { findEditableProblem, type Actor } from '../problems/problems.service.js';
import { testCaseBulkSchema, testCaseInputSchema, testCaseUpdateSchema } from './testcases.schema.js';

const PREVIEW_CHARS = 200;

type CaseInput = z.output<typeof testCaseInputSchema>;

export async function listTestCases(problemId: string, actor: Actor): Promise<TestCaseSummary[]> {
  await findEditableProblem(problemId, actor);
  // Previews are cut in SQL so multi-MB inputs are not pulled into memory just to list them.
  const rows = await prisma.$queryRaw<TestCaseSummary[]>`
    SELECT id, "order", "isHidden",
           left(input, ${PREVIEW_CHARS}::int) AS "inputPreview",
           left(expected, ${PREVIEW_CHARS}::int) AS "expectedPreview",
           octet_length(input)::int AS "inputBytes",
           octet_length(expected)::int AS "expectedBytes"
    FROM "TestCase"
    WHERE "problemId" = ${problemId}
    ORDER BY "order" ASC`;
  return rows;
}

async function findCase(problemId: string, testId: string) {
  const tc = await prisma.testCase.findFirst({ where: { id: testId, problemId } });
  if (!tc) throw HttpError.notFound('Không tìm thấy test case');
  return tc;
}

const toFull = (tc: TestCaseFull): TestCaseFull => ({
  id: tc.id,
  order: tc.order,
  isHidden: tc.isHidden,
  input: tc.input,
  expected: tc.expected,
});

export async function getTestCase(problemId: string, testId: string, actor: Actor): Promise<TestCaseFull> {
  await findEditableProblem(problemId, actor);
  return toFull(await findCase(problemId, testId));
}

async function nextOrder(problemId: string): Promise<number> {
  const agg = await prisma.testCase.aggregate({ where: { problemId }, _max: { order: true } });
  return (agg._max.order ?? 0) + 1;
}

async function assertCapacity(problemId: string, adding: number) {
  const count = await prisma.testCase.count({ where: { problemId } });
  if (count + adding > MAX_TESTCASES_PER_PROBLEM) {
    throw HttpError.badRequest(`Mỗi bài tối đa ${MAX_TESTCASES_PER_PROBLEM} test`);
  }
}

export async function createTestCase(problemId: string, input: CaseInput, actor: Actor): Promise<TestCaseFull> {
  await findEditableProblem(problemId, actor);
  await assertCapacity(problemId, 1);
  const tc = await prisma.testCase.create({ data: { ...input, problemId, order: await nextOrder(problemId) } });
  return toFull(tc);
}

export async function bulkCreateTestCases(
  problemId: string,
  input: z.output<typeof testCaseBulkSchema>,
  actor: Actor,
): Promise<{ created: number }> {
  await findEditableProblem(problemId, actor);
  if (!input.replace) await assertCapacity(problemId, input.cases.length);

  await prisma.$transaction(async (tx) => {
    let start = 1;
    if (input.replace) {
      await tx.testCase.deleteMany({ where: { problemId } });
    } else {
      const agg = await tx.testCase.aggregate({ where: { problemId }, _max: { order: true } });
      start = (agg._max.order ?? 0) + 1;
    }
    await tx.testCase.createMany({
      data: input.cases.map((c, i) => ({ ...c, problemId, order: start + i })),
    });
  });
  return { created: input.cases.length };
}

export async function updateTestCase(
  problemId: string,
  testId: string,
  input: z.output<typeof testCaseUpdateSchema>,
  actor: Actor,
): Promise<TestCaseFull> {
  await findEditableProblem(problemId, actor);
  await findCase(problemId, testId);
  return toFull(await prisma.testCase.update({ where: { id: testId }, data: input }));
}

export async function deleteTestCase(problemId: string, testId: string, actor: Actor): Promise<void> {
  await findEditableProblem(problemId, actor);
  await findCase(problemId, testId);
  await prisma.testCase.delete({ where: { id: testId } });
}
