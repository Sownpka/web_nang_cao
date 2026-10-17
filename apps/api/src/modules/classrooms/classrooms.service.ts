import { randomInt } from 'node:crypto';
import { Prisma, prisma } from '@judgehint/db';
import {
  assignmentStatus,
  JOIN_CODE_ALPHABET,
  JOIN_CODE_LENGTH,
  type AssignmentSummary,
  type ClassroomDetail,
  type ClassroomSummary,
} from '@judgehint/shared';
import { HttpError } from '../../lib/httpError.js';
import { refreshLeaderboardsOfClassroom } from '../leaderboard/leaderboard.service.js';
import type { Actor } from '../problems/problems.service.js';
import type { ClassroomInput, JoinClassroomInput } from './classrooms.schema.js';

export interface ClassroomAccess {
  classroom: { id: string; name: string; joinCode: string; teacherId: string };
  /** Teacher of the class or admin. */
  canManage: boolean;
}

/** Loads a classroom the actor belongs to (teacher, enrolled student or admin). */
export async function classroomAccess(classroomId: string, actor: Actor): Promise<ClassroomAccess> {
  const classroom = await prisma.classroom.findUnique({
    where: { id: classroomId },
    select: { id: true, name: true, joinCode: true, teacherId: true },
  });
  if (!classroom) throw HttpError.notFound('Không tìm thấy lớp học');
  const canManage = actor.role === 'ADMIN' || classroom.teacherId === actor.id;
  if (!canManage) {
    const enrolled = await prisma.enrollment.findUnique({
      where: { userId_classroomId: { userId: actor.id, classroomId } },
    });
    if (!enrolled) throw HttpError.forbidden('Bạn không thuộc lớp học này');
  }
  return { classroom, canManage };
}

export async function requireClassroomManager(classroomId: string, actor: Actor): Promise<ClassroomAccess> {
  const access = await classroomAccess(classroomId, actor);
  if (!access.canManage) throw HttpError.forbidden('Chỉ giảng viên của lớp mới thực hiện được thao tác này');
  return access;
}

export function toAssignmentSummary(a: {
  id: string;
  classroomId: string;
  title: string;
  startsAt: Date;
  endsAt: Date;
  problems: { points: number }[];
}): AssignmentSummary {
  return {
    id: a.id,
    classroomId: a.classroomId,
    title: a.title,
    startsAt: a.startsAt.toISOString(),
    endsAt: a.endsAt.toISOString(),
    status: assignmentStatus(a.startsAt, a.endsAt),
    problemCount: a.problems.length,
    totalPoints: a.problems.reduce((s, p) => s + p.points, 0),
  };
}

function newJoinCode(): string {
  let code = '';
  for (let i = 0; i < JOIN_CODE_LENGTH; i++) code += JOIN_CODE_ALPHABET[randomInt(JOIN_CODE_ALPHABET.length)];
  return code;
}

const summarySelect = {
  id: true,
  name: true,
  joinCode: true,
  teacherId: true,
  teacher: { select: { id: true, fullName: true } },
  _count: { select: { enrollments: true, assignments: true } },
} satisfies Prisma.ClassroomSelect;

type SummaryRow = Prisma.ClassroomGetPayload<{ select: typeof summarySelect }>;

function toSummary(c: SummaryRow, actor: Actor): ClassroomSummary {
  const canManage = actor.role === 'ADMIN' || c.teacherId === actor.id;
  return {
    id: c.id,
    name: c.name,
    teacher: c.teacher,
    studentCount: c._count.enrollments,
    assignmentCount: c._count.assignments,
    joinCode: canManage ? c.joinCode : null,
  };
}

export async function createClassroom(input: ClassroomInput, actor: Actor): Promise<ClassroomSummary> {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const c = await prisma.classroom.create({
        data: { name: input.name, joinCode: newJoinCode(), teacherId: actor.id },
        select: summarySelect,
      });
      return toSummary(c, actor);
    } catch (err) {
      // Join code collision: try another one.
      if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')) throw err;
    }
  }
  throw new HttpError(500, 'JOIN_CODE_EXHAUSTED', 'Không tạo được mã lớp, vui lòng thử lại');
}

/** Teachers see the classes they teach (admins all), students the ones they joined. */
export async function listClassrooms(actor: Actor): Promise<ClassroomSummary[]> {
  const where: Prisma.ClassroomWhereInput =
    actor.role === 'ADMIN'
      ? {}
      : actor.role === 'TEACHER'
        ? { OR: [{ teacherId: actor.id }, { enrollments: { some: { userId: actor.id } } }] }
        : { enrollments: { some: { userId: actor.id } } };
  const rows = await prisma.classroom.findMany({ where, orderBy: { createdAt: 'desc' }, select: summarySelect });
  return rows.map((c) => toSummary(c, actor));
}

export async function getClassroom(classroomId: string, actor: Actor): Promise<ClassroomDetail> {
  const { canManage } = await classroomAccess(classroomId, actor);
  const c = await prisma.classroom.findUniqueOrThrow({
    where: { id: classroomId },
    select: {
      ...summarySelect,
      assignments: {
        orderBy: { startsAt: 'desc' },
        select: { id: true, classroomId: true, title: true, startsAt: true, endsAt: true, problems: { select: { points: true } } },
      },
    },
  });
  // The roster (with emails) is for the teacher only.
  const members = canManage
    ? await prisma.enrollment.findMany({
        where: { classroomId },
        orderBy: { joinedAt: 'asc' },
        select: { joinedAt: true, user: { select: { id: true, fullName: true, studentCode: true, email: true } } },
      })
    : null;
  return {
    ...toSummary(c, actor),
    canManage,
    assignments: c.assignments.map(toAssignmentSummary),
    members: members?.map((e) => ({ ...e.user, joinedAt: e.joinedAt.toISOString() })) ?? null,
  };
}

export async function joinClassroom(input: JoinClassroomInput, actor: Actor): Promise<ClassroomSummary> {
  const c = await prisma.classroom.findUnique({ where: { joinCode: input.joinCode }, select: summarySelect });
  if (!c) throw HttpError.notFound('Mã lớp không đúng');
  if (c.teacherId === actor.id) throw HttpError.badRequest('Bạn là giảng viên của lớp này');
  // Joining twice is harmless.
  await prisma.enrollment.upsert({
    where: { userId_classroomId: { userId: actor.id, classroomId: c.id } },
    update: {},
    create: { userId: actor.id, classroomId: c.id },
  });
  await refreshLeaderboardsOfClassroom(c.id);
  return toSummary(await prisma.classroom.findUniqueOrThrow({ where: { id: c.id }, select: summarySelect }), actor);
}

export async function removeMember(classroomId: string, userId: string, actor: Actor): Promise<void> {
  await requireClassroomManager(classroomId, actor);
  const { count } = await prisma.enrollment.deleteMany({ where: { classroomId, userId } });
  if (!count) throw HttpError.notFound('Sinh viên không thuộc lớp này');
  await refreshLeaderboardsOfClassroom(classroomId);
}
