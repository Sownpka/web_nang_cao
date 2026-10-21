/**
 * Idempotent demo seed. Run with `pnpm db:seed`.
 *
 * Demo accounts (development only; all share the password below):
 *   admin@judgehint.local    ADMIN
 *   teacher@judgehint.local  TEACHER
 *   sv1@judgehint.local      STUDENT (studentCode 24100001)
 *   sv2@judgehint.local      STUDENT (studentCode 24100002)
 *   sv3@judgehint.local      STUDENT (studentCode 24100003)
 */
import bcrypt from 'bcryptjs';
import { prisma, type Role } from '@judgehint/db';
import { seedProblems } from './problems.js';

// A public deployment should set SEED_DEMO_PASSWORD; it only applies when an account is created.
const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD || 'judgehint123';
const DEMO_JOIN_CODE = 'WEB2026';
const DEMO_ASSIGNMENT_TITLE = 'Bài tập tuần 1';

interface SeedUser {
  email: string;
  fullName: string;
  role: Role;
  studentCode?: string;
}

const users: SeedUser[] = [
  { email: 'admin@judgehint.local', fullName: 'Quản trị viên', role: 'ADMIN' },
  { email: 'teacher@judgehint.local', fullName: 'Giảng viên Demo', role: 'TEACHER' },
  { email: 'sv1@judgehint.local', fullName: 'Nguyễn Văn An', role: 'STUDENT', studentCode: '24100001' },
  { email: 'sv2@judgehint.local', fullName: 'Trần Thị Bình', role: 'STUDENT', studentCode: '24100002' },
  { email: 'sv3@judgehint.local', fullName: 'Lê Minh Châu', role: 'STUDENT', studentCode: '24100003' },
];

async function seedUsers() {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const result: Record<string, string> = {};
  for (const u of users) {
    const row = await prisma.user.upsert({
      where: { email: u.email },
      update: { fullName: u.fullName, role: u.role, studentCode: u.studentCode ?? null },
      create: { ...u, passwordHash },
    });
    result[u.email] = row.id;
  }
  return result;
}

async function seedProblemsFor(authorId: string) {
  const ids: string[] = [];
  for (const p of seedProblems) {
    const { tests, ...data } = p;
    const problem = await prisma.problem.upsert({
      where: { slug: p.slug },
      update: { ...data, authorId },
      create: { ...data, authorId },
    });
    // Replace test cases wholesale so edits in problems.ts are reflected on re-seed.
    await prisma.$transaction([
      prisma.testCase.deleteMany({ where: { problemId: problem.id } }),
      prisma.testCase.createMany({
        data: tests.map((t, i) => ({ ...t, problemId: problem.id, order: i + 1 })),
      }),
    ]);
    ids.push(problem.id);
  }
  return ids;
}

async function seedClassroom(teacherId: string, studentIds: string[], problemIds: string[]) {
  const classroom = await prisma.classroom.upsert({
    where: { joinCode: DEMO_JOIN_CODE },
    update: { teacherId },
    create: { name: 'Thiết kế Web nâng cao - N01', joinCode: DEMO_JOIN_CODE, teacherId },
  });

  await prisma.enrollment.createMany({
    data: studentIds.map((userId) => ({ userId, classroomId: classroom.id })),
    skipDuplicates: true,
  });

  const now = Date.now();
  const existing = await prisma.assignment.findFirst({
    where: { classroomId: classroom.id, title: DEMO_ASSIGNMENT_TITLE },
  });
  const window = { startsAt: new Date(now - 24 * 3600e3), endsAt: new Date(now + 14 * 24 * 3600e3) };
  const assignment = existing
    ? await prisma.assignment.update({ where: { id: existing.id }, data: window })
    : await prisma.assignment.create({
        data: { classroomId: classroom.id, title: DEMO_ASSIGNMENT_TITLE, ...window },
      });

  await prisma.assignmentProblem.deleteMany({ where: { assignmentId: assignment.id } });
  await prisma.assignmentProblem.createMany({
    data: problemIds.slice(0, 4).map((problemId, order) => ({
      assignmentId: assignment.id,
      problemId,
      points: 100,
      order,
    })),
  });
  return { classroom, assignment };
}

async function main() {
  const userIds = await seedUsers();
  const teacherId = userIds['teacher@judgehint.local']!;
  const studentIds = users.filter((u) => u.role === 'STUDENT').map((u) => userIds[u.email]!);

  const problemIds = await seedProblemsFor(teacherId);
  const { classroom, assignment } = await seedClassroom(teacherId, studentIds, problemIds);

  console.log(`Seeded ${users.length} users, ${problemIds.length} problems.`);
  console.log(`Classroom "${classroom.name}" (join code ${classroom.joinCode}), assignment "${assignment.title}".`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
