import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@judgehint/db';
import type { ProblemInput } from '@judgehint/shared';
import { createApp } from '../src/app.js';
import { createUser } from './helpers.js';

const app = createApp();

let student: Awaited<ReturnType<typeof createUser>>;
let teacher: Awaited<ReturnType<typeof createUser>>;
let otherTeacher: Awaited<ReturnType<typeof createUser>>;
let admin: Awaited<ReturnType<typeof createUser>>;

let seq = 0;
function problemBody(overrides: Partial<ProblemInput> = {}): ProblemInput {
  seq += 1;
  return {
    title: `Bài kiểm thử ${Date.now()} ${seq}`,
    statementMd: 'Đọc hai số và in tổng của chúng.',
    difficulty: 'EASY',
    timeLimitMs: 1000,
    memoryLimitMb: 128,
    allowedLanguages: ['python', 'javascript'],
    aiHintsEnabled: true,
    referenceSolution: 'print(sum(map(int, input().split())))',
    ...overrides,
  };
}

async function createProblemAs(auth: string, overrides: Partial<ProblemInput> = {}) {
  const res = await request(app).post('/api/problems').set('Authorization', auth).send(problemBody(overrides));
  expect(res.status).toBe(201);
  return res.body as { id: string; slug: string };
}

async function addTests(problemId: string, auth: string) {
  const res = await request(app)
    .post(`/api/problems/${problemId}/testcases/bulk`)
    .set('Authorization', auth)
    .send({
      cases: [
        { input: '1 2\n', expected: '3\n', isHidden: false },
        { input: '10 20\n', expected: '30\n', isHidden: true },
        { input: '-1 1\n', expected: '0\n', isHidden: true },
      ],
    });
  expect(res.status).toBe(201);
}

beforeAll(async () => {
  [student, teacher, otherTeacher, admin] = await Promise.all([
    createUser('STUDENT'),
    createUser('TEACHER'),
    createUser('TEACHER'),
    createUser('ADMIN'),
  ]);
});

describe('problem CRUD permissions', () => {
  it('requires authentication', async () => {
    expect((await request(app).get('/api/problems')).status).toBe(401);
  });

  it('forbids students from creating problems', async () => {
    const res = await request(app).post('/api/problems').set('Authorization', student.auth).send(problemBody());
    expect(res.status).toBe(403);
  });

  it('lets a teacher create a problem with a slug derived from the Vietnamese title', async () => {
    const res = await request(app)
      .post('/api/problems')
      .set('Authorization', teacher.auth)
      .send(problemBody({ title: 'Đếm số đường đi' }));
    expect(res.status).toBe(201);
    expect(res.body.slug).toMatch(/^dem-so-duong-di(-\d+)?$/);
  });

  it('suffixes derived slugs on collision but rejects a taken explicit slug', async () => {
    const title = `Trùng tên ${Date.now()}`;
    const a = await createProblemAs(teacher.auth, { title });
    const b = await createProblemAs(teacher.auth, { title });
    expect(b.slug).toBe(`${a.slug}-2`);

    const res = await request(app)
      .post('/api/problems')
      .set('Authorization', teacher.auth)
      .send(problemBody({ slug: a.slug }));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('SLUG_TAKEN');
  });

  it('validates input', async () => {
    const res = await request(app)
      .post('/api/problems')
      .set('Authorization', teacher.auth)
      .send(problemBody({ timeLimitMs: 5, allowedLanguages: [] }));
    expect(res.status).toBe(400);
    expect(res.body.error.details).toHaveProperty('timeLimitMs');
    expect(res.body.error.details).toHaveProperty('allowedLanguages');
  });

  it('only the author or an admin can edit or delete', async () => {
    const { id } = await createProblemAs(teacher.auth);

    const byOther = await request(app).put(`/api/problems/${id}`).set('Authorization', otherTeacher.auth).send(problemBody());
    expect(byOther.status).toBe(403);
    const byStudent = await request(app).delete(`/api/problems/${id}`).set('Authorization', student.auth);
    expect(byStudent.status).toBe(403);

    const byAdmin = await request(app)
      .put(`/api/problems/${id}`)
      .set('Authorization', admin.auth)
      .send(problemBody({ title: 'Sửa bởi admin' }));
    expect(byAdmin.status).toBe(200);

    const del = await request(app).delete(`/api/problems/${id}`).set('Authorization', teacher.auth);
    expect(del.status).toBe(204);
  });

  it('refuses to delete a problem that already has submissions', async () => {
    const { id } = await createProblemAs(teacher.auth);
    await prisma.submission.create({
      data: { userId: student.user.id, problemId: id, language: 'python', code: 'print(1)' },
    });
    const res = await request(app).delete(`/api/problems/${id}`).set('Authorization', teacher.auth);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('HAS_SUBMISSIONS');
  });
});

describe('problem visibility', () => {
  it('shows students only public tests and never the reference solution', async () => {
    const { id, slug } = await createProblemAs(teacher.auth);
    await addTests(id, teacher.auth);

    const res = await request(app).get(`/api/problems/${slug}`).set('Authorization', student.auth);
    expect(res.status).toBe(200);
    expect(res.body.samples).toEqual([{ order: 1, input: '1 2\n', expected: '3\n' }]);
    expect(res.body.totalTests).toBe(3);
    expect(res.body.canEdit).toBe(false);
    expect(res.body).not.toHaveProperty('referenceSolution');
    expect(JSON.stringify(res.body)).not.toContain('10 20');

    const manage = await request(app).get(`/api/problems/${id}/manage`).set('Authorization', student.auth);
    expect(manage.status).toBe(403);
    const tests = await request(app).get(`/api/problems/${id}/testcases`).set('Authorization', student.auth);
    expect(tests.status).toBe(403);
  });

  it('gives the author the full problem including the reference solution', async () => {
    const { id, slug } = await createProblemAs(teacher.auth);
    const detail = await request(app).get(`/api/problems/${slug}`).set('Authorization', teacher.auth);
    expect(detail.body.canEdit).toBe(true);

    const manage = await request(app).get(`/api/problems/${id}/manage`).set('Authorization', teacher.auth);
    expect(manage.status).toBe(200);
    expect(manage.body.referenceSolution).toContain('print');

    const other = await request(app).get(`/api/problems/${id}/manage`).set('Authorization', otherTeacher.auth);
    expect(other.status).toBe(403);
  });

  it('lists with search, difficulty filter, pagination and per-user solved status', async () => {
    const marker = `Mốc tìm kiếm ${Date.now()}`;
    const easy = await createProblemAs(teacher.auth, { title: `${marker} A`, difficulty: 'EASY' });
    await createProblemAs(teacher.auth, { title: `${marker} B`, difficulty: 'HARD' });
    await prisma.submission.create({
      data: { userId: student.user.id, problemId: easy.id, language: 'python', code: 'x', verdict: 'ACCEPTED' },
    });

    const all = await request(app).get('/api/problems').query({ q: marker }).set('Authorization', student.auth);
    expect(all.body.total).toBe(2);
    const solved = all.body.items.find((p: { id: string }) => p.id === easy.id);
    expect(solved).toMatchObject({ solved: true, attempted: true });

    const hard = await request(app).get('/api/problems').query({ q: marker, difficulty: 'HARD' }).set('Authorization', student.auth);
    expect(hard.body.items).toHaveLength(1);
    expect(hard.body.items[0].solved).toBe(false);

    const paged = await request(app).get('/api/problems').query({ q: marker, pageSize: 1, page: 2 }).set('Authorization', student.auth);
    expect(paged.body.items).toHaveLength(1);
    expect(paged.body.total).toBe(2);
  });
});

describe('test cases', () => {
  it('supports create, list previews, update, delete and bulk replace', async () => {
    const { id } = await createProblemAs(teacher.auth);
    const base = `/api/problems/${id}/testcases`;

    const big = `${'9 '.repeat(5000)}\n`;
    const created = await request(app).post(base).set('Authorization', teacher.auth).send({ input: big, expected: '1\n' });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ order: 1, isHidden: true });

    const second = await request(app).post(base).set('Authorization', teacher.auth).send({ input: 'a', expected: 'b', isHidden: false });
    expect(second.body.order).toBe(2);

    const list = await request(app).get(base).set('Authorization', teacher.auth);
    expect(list.body).toHaveLength(2);
    expect(list.body[0].inputPreview.length).toBe(200);
    expect(list.body[0].inputBytes).toBe(Buffer.byteLength(big));

    const full = await request(app).get(`${base}/${created.body.id}`).set('Authorization', teacher.auth);
    expect(full.body.input).toBe(big);

    const updated = await request(app).put(`${base}/${created.body.id}`).set('Authorization', teacher.auth).send({ isHidden: false });
    expect(updated.body.isHidden).toBe(false);

    const del = await request(app).delete(`${base}/${second.body.id}`).set('Authorization', teacher.auth);
    expect(del.status).toBe(204);

    const replaced = await request(app)
      .post(`${base}/bulk`)
      .set('Authorization', teacher.auth)
      .send({ replace: true, cases: [{ input: '1', expected: '1' }, { input: '2', expected: '2' }] });
    expect(replaced.body.created).toBe(2);
    const after = await request(app).get(base).set('Authorization', teacher.auth);
    expect(after.body.map((t: { order: number }) => t.order)).toEqual([1, 2]);
  });

  it('hides test cases of another teacher’s problem', async () => {
    const { id } = await createProblemAs(teacher.auth);
    const res = await request(app).get(`/api/problems/${id}/testcases`).set('Authorization', otherTeacher.auth);
    expect(res.status).toBe(403);
  });

  it('returns 404 for a test case that belongs to another problem', async () => {
    const a = await createProblemAs(teacher.auth);
    const b = await createProblemAs(teacher.auth);
    const tc = await request(app)
      .post(`/api/problems/${a.id}/testcases`)
      .set('Authorization', teacher.auth)
      .send({ input: '1', expected: '1' });
    const res = await request(app).get(`/api/problems/${b.id}/testcases/${tc.body.id}`).set('Authorization', teacher.auth);
    expect(res.status).toBe(404);
  });
});
