import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@judgehint/db';
import { createApp } from '../src/app.js';
import { createUser } from './helpers.js';

const app = createApp();
let problemIds: string[];

beforeAll(async () => {
  const author = await createUser('TEACHER');
  const make = (i: number) =>
    prisma.problem.create({
      data: { slug: `cls-${Date.now()}-${i}`, title: `Bài ${i}`, statementMd: 'Đề.', difficulty: 'EASY', allowedLanguages: ['python'], authorId: author.user.id },
    });
  problemIds = (await Promise.all([make(1), make(2)])).map((p) => p.id);
});

const auth = (r: request.Test, a: string) => r.set('Authorization', a);

async function classWithStudent() {
  const teacher = await createUser('TEACHER');
  const student = await createUser('STUDENT');
  const created = await auth(request(app).post('/api/classrooms').send({ name: 'Web nâng cao N01' }), teacher.auth);
  expect(created.status).toBe(201);
  const joined = await auth(request(app).post('/api/classrooms/join').send({ joinCode: created.body.joinCode.toLowerCase() }), student.auth);
  expect(joined.status).toBe(200);
  return { teacher, student, classroom: created.body as { id: string; joinCode: string } };
}

const assignmentBody = (overrides: Record<string, unknown> = {}) => ({
  title: 'Bài tập tuần 2',
  startsAt: new Date(Date.now() - 3600e3).toISOString(),
  endsAt: new Date(Date.now() + 3600e3).toISOString(),
  problems: problemIds.map((problemId, i) => ({ problemId, points: 100 + i * 50 })),
  ...overrides,
});

describe('classrooms', () => {
  it('teachers create classes with a 6-character join code; students cannot', async () => {
    const teacher = await createUser('TEACHER');
    const res = await auth(request(app).post('/api/classrooms').send({ name: 'Lớp A' }), teacher.auth);
    expect(res.body.joinCode).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);

    const student = await createUser('STUDENT');
    expect((await auth(request(app).post('/api/classrooms').send({ name: 'Lớp B' }), student.auth)).status).toBe(403);
  });

  it('students join by code (case-insensitive, idempotent) and see only their classes', async () => {
    const { student, classroom } = await classWithStudent();
    const again = await auth(request(app).post('/api/classrooms/join').send({ joinCode: classroom.joinCode }), student.auth);
    expect(again.body.studentCount).toBe(1);

    const wrong = await auth(request(app).post('/api/classrooms/join').send({ joinCode: 'ZZZZZZ' }), student.auth);
    expect(wrong.status).toBe(404);

    const list = await auth(request(app).get('/api/classrooms'), student.auth);
    expect(list.body.map((c: { id: string }) => c.id)).toEqual([classroom.id]);
    expect(list.body[0].joinCode).toBeNull();
  });

  it('hides the roster and join code from students and the class from outsiders', async () => {
    const { teacher, student, classroom } = await classWithStudent();
    const outsider = await createUser('STUDENT');

    const asStudent = await auth(request(app).get(`/api/classrooms/${classroom.id}`), student.auth);
    expect(asStudent.body).toMatchObject({ canManage: false, members: null, joinCode: null });

    const asTeacher = await auth(request(app).get(`/api/classrooms/${classroom.id}`), teacher.auth);
    expect(asTeacher.body.members).toHaveLength(1);
    expect(asTeacher.body.members[0].id).toBe(student.user.id);

    expect((await auth(request(app).get(`/api/classrooms/${classroom.id}`), outsider.auth)).status).toBe(403);
  });

  it('lets the teacher remove a member', async () => {
    const { teacher, student, classroom } = await classWithStudent();
    const res = await auth(request(app).delete(`/api/classrooms/${classroom.id}/members/${student.user.id}`), teacher.auth);
    expect(res.status).toBe(204);
    expect((await auth(request(app).get(`/api/classrooms/${classroom.id}`), student.auth)).status).toBe(403);
  });
});

describe('assignments', () => {
  it('the classroom teacher creates one; other teachers and students cannot', async () => {
    const { teacher, student, classroom } = await classWithStudent();
    const other = await createUser('TEACHER');
    const path = `/api/classrooms/${classroom.id}/assignments`;

    expect((await auth(request(app).post(path).send(assignmentBody()), student.auth)).status).toBe(403);
    expect((await auth(request(app).post(path).send(assignmentBody()), other.auth)).status).toBe(403);

    const res = await auth(request(app).post(path).send(assignmentBody()), teacher.auth);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ status: 'ACTIVE', problemCount: 2, totalPoints: 250, canManage: true });
    expect(res.body.problems.map((p: { points: number }) => p.points)).toEqual([100, 150]);

    const list = await auth(request(app).get(path), student.auth);
    expect(list.body).toHaveLength(1);
  });

  it('validates the time window, duplicates and unknown problems', async () => {
    const { teacher, classroom } = await classWithStudent();
    const path = `/api/classrooms/${classroom.id}/assignments`;
    const backwards = await auth(request(app).post(path).send(assignmentBody({ endsAt: new Date(Date.now() - 7200e3).toISOString() })), teacher.auth);
    expect(backwards.status).toBe(400);
    expect(backwards.body.error.details).toHaveProperty('endsAt');

    const dup = await auth(request(app).post(path).send(assignmentBody({ problems: [{ problemId: problemIds[0] }, { problemId: problemIds[0] }] })), teacher.auth);
    expect(dup.status).toBe(400);

    const unknown = await auth(request(app).post(path).send(assignmentBody({ problems: [{ problemId: 'nope' }] })), teacher.auth);
    expect(unknown.status).toBe(400);
  });

  it('gives students their own row and teachers the full leaderboard', async () => {
    const { teacher, student, classroom } = await classWithStudent();
    const created = await auth(request(app).post(`/api/classrooms/${classroom.id}/assignments`).send(assignmentBody()), teacher.auth);

    const mine = await auth(request(app).get(`/api/assignments/${created.body.id}`), student.auth);
    expect(mine.body.myRow).toMatchObject({ userId: student.user.id, rank: 1, totalScore: 0 });

    const board = await auth(request(app).get(`/api/assignments/${created.body.id}/leaderboard`), teacher.auth);
    expect(board.body.rows).toHaveLength(1);
    expect(board.body.problems).toHaveLength(2);

    const outsider = await createUser('STUDENT');
    expect((await auth(request(app).get(`/api/assignments/${created.body.id}/leaderboard`), outsider.auth)).status).toBe(403);
  });
});
