import { prisma } from '@judgehint/db';
import type { AssignmentDetail, AssignmentSummary, Leaderboard } from '@judgehint/shared';
import { z } from 'zod';
import { HttpError } from '../../lib/httpError.js';
import { classroomAccess, requireClassroomManager, toAssignmentSummary } from '../classrooms/classrooms.service.js';
import { getLeaderboard, refreshLeaderboard } from '../leaderboard/leaderboard.service.js';
import type { Actor } from '../problems/problems.service.js';
import { assignmentInputSchema } from './assignments.schema.js';

type Input = z.output<typeof assignmentInputSchema>;

const summarySelect = {
  id: true,
  classroomId: true,
  title: true,
  startsAt: true,
  endsAt: true,
  problems: { select: { points: true } },
} as const;

async function findAssignment(id: string) {
  const a = await prisma.assignment.findUnique({ where: { id }, select: { id: true, classroomId: true } });
  if (!a) throw HttpError.notFound('Không tìm thấy bài tập');
  return a;
}

async function assertProblemsExist(input: Input) {
  const ids = input.problems.map((p) => p.problemId);
  const found = await prisma.problem.count({ where: { id: { in: ids } } });
  if (found !== ids.length) throw HttpError.badRequest('Có bài tập không tồn tại trong danh sách');
}

const problemRows = (input: Input) => input.problems.map((p, order) => ({ problemId: p.problemId, points: p.points, order }));

export async function listAssignments(classroomId: string, actor: Actor): Promise<AssignmentSummary[]> {
  await classroomAccess(classroomId, actor);
  const rows = await prisma.assignment.findMany({ where: { classroomId }, orderBy: { startsAt: 'desc' }, select: summarySelect });
  return rows.map(toAssignmentSummary);
}

export async function createAssignment(classroomId: string, input: Input, actor: Actor): Promise<AssignmentDetail> {
  await requireClassroomManager(classroomId, actor);
  await assertProblemsExist(input);
  const a = await prisma.assignment.create({
    data: {
      classroomId,
      title: input.title,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      problems: { create: problemRows(input) },
    },
    select: { id: true },
  });
  return getAssignment(a.id, actor);
}

export async function getAssignment(id: string, actor: Actor): Promise<AssignmentDetail> {
  const { classroomId } = await findAssignment(id);
  const { canManage, classroom } = await classroomAccess(classroomId, actor);
  const a = await prisma.assignment.findUniqueOrThrow({
    where: { id },
    select: {
      ...summarySelect,
      problems: {
        orderBy: { order: 'asc' },
        select: { points: true, problem: { select: { id: true, slug: true, title: true, difficulty: true } } },
      },
    },
  });
  const board = canManage ? null : await getLeaderboard(id);
  return {
    ...toAssignmentSummary(a),
    classroom: { id: classroom.id, name: classroom.name },
    problems: a.problems.map((p) => ({ ...p.problem, points: p.points })),
    canManage,
    myRow: board?.rows.find((r) => r.userId === actor.id) ?? null,
  };
}

export async function updateAssignment(id: string, input: Input, actor: Actor): Promise<AssignmentDetail> {
  const { classroomId } = await findAssignment(id);
  await requireClassroomManager(classroomId, actor);
  await assertProblemsExist(input);
  await prisma.$transaction([
    prisma.assignmentProblem.deleteMany({ where: { assignmentId: id } }),
    prisma.assignment.update({
      where: { id },
      data: { title: input.title, startsAt: input.startsAt, endsAt: input.endsAt, problems: { create: problemRows(input) } },
    }),
  ]);
  // Points, problems or the time window may have changed.
  await refreshLeaderboard(id);
  return getAssignment(id, actor);
}

export async function deleteAssignment(id: string, actor: Actor): Promise<void> {
  const { classroomId } = await findAssignment(id);
  await requireClassroomManager(classroomId, actor);
  // Submissions keep existing (assignmentId is set to null), they just stop counting.
  await prisma.assignment.delete({ where: { id } });
  await refreshLeaderboard(id);
}

export async function getAssignmentLeaderboard(id: string, actor: Actor): Promise<Leaderboard> {
  const { classroomId } = await findAssignment(id);
  await classroomAccess(classroomId, actor);
  return getLeaderboard(id);
}
