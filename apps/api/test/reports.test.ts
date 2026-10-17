// Teacher assignment report and its CSV export (CLAUDE.md §9).
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@judgehint/db';
import type { AssignmentReport, Verdict } from '@judgehint/shared';
import { createApp } from '../src/app.js';
import { attachmentHeader, csvCell, toCsv } from '../src/lib/csv.js';
import { createUser } from './helpers.js';

const app = createApp();
const START = new Date('2026-09-01T08:00:00Z');
const END = new Date('2026-09-01T10:00:00Z');
const at = (min: number) => new Date(START.getTime() + min * 60_000);

let teacher: Awaited<ReturnType<typeof createUser>>;
let assignmentId: string;
let p1: string;
let p2: string;
const students: Record<string, Awaited<ReturnType<typeof createUser>>> = {};

async function submit(name: string, problemId: string, verdict: Verdict, minute: number) {
  return prisma.submission.create({
    data: { userId: students[name]!.user.id, problemId, assignmentId, language: 'python', code: 'x', verdict, createdAt: at(minute) },
  });
}

beforeAll(async () => {
  teacher = await createUser('TEACHER');
  const mk = (slug: string) =>
    prisma.problem.create({
      data: { slug: `${slug}-${Date.now()}`, title: slug, statementMd: 'Đề.', difficulty: 'EASY', allowedLanguages: ['python'], authorId: teacher.user.id },
    });
  p1 = (await mk('rp-p1')).id;
  p2 = (await mk('rp-p2')).id;
  for (const name of ['an', 'binh', 'chau']) students[name] = await createUser('STUDENT');
  // A name that would run as a formula in Excel.
  await prisma.user.update({ where: { id: students.chau!.user.id }, data: { fullName: '=HYPERLINK("x")' } });

  const classroom = await prisma.classroom.create({
    data: {
      name: 'Lớp báo cáo',
      joinCode: `B${Date.now()}`.slice(0, 12),
      teacherId: teacher.user.id,
      enrollments: { create: Object.values(students).map((s) => ({ userId: s.user.id })) },
    },
  });
  assignmentId = (
    await prisma.assignment.create({
      data: {
        classroomId: classroom.id,
        title: 'Kiểm tra giữa kỳ',
        startsAt: START,
        endsAt: END,
        problems: { create: [{ problemId: p1, points: 100, order: 0 }, { problemId: p2, points: 100, order: 1 }] },
      },
    })
  ).id;

  // an: solves both (p1 after one WA, p2 after a hint) → 100 + 90 = 190.
  await submit('an', p1, 'WRONG_ANSWER', 5);
  await submit('an', p1, 'ACCEPTED', 10);
  const anP2 = await submit('an', p2, 'TIME_LIMIT_EXCEEDED', 20);
  await prisma.hint.create({ data: { submissionId: anP2.id, level: 1, content: 'h', createdAt: at(21) } });
  await submit('an', p2, 'ACCEPTED', 30);
  // binh: solves p1 only → 100.
  await submit('binh', p1, 'ACCEPTED', 40);
  await submit('binh', p2, 'WRONG_ANSWER', 50);
  // chau: never submits.
});

const getReport = (auth: string, format?: string) =>
  request(app)
    .get(`/api/teacher/assignments/${assignmentId}/report${format ? `?format=${format}` : ''}`)
    .set('Authorization', auth);

describe('GET /teacher/assignments/:id/report', () => {
  it('summarises the class, each problem and each student', async () => {
    const res = await getReport(teacher.auth);
    expect(res.status).toBe(200);
    const report = res.body as AssignmentReport;

    expect(report.assignment).toMatchObject({ id: assignmentId, title: 'Kiểm tra giữa kỳ', totalPoints: 200, status: 'ENDED' });
    expect(report.summary).toEqual({
      studentCount: 3,
      participantCount: 2,
      fullSolveCount: 1,
      averageScore: 96.7,
      medianScore: 100,
      submissionCount: 6,
      hintsOpened: 1,
    });

    const [s1, s2] = report.problems;
    expect(s1).toMatchObject({ id: p1, attemptedCount: 2, solvedCount: 2, submissionCount: 3, avgWrongBeforeAc: 0.5, avgAcceptedAtMin: 25, hintsOpened: 0 });
    expect(s1!.verdicts).toEqual({ ACCEPTED: 2, WRONG_ANSWER: 1 });
    expect(s2).toMatchObject({ id: p2, attemptedCount: 2, solvedCount: 1, avgWrongBeforeAc: 1, avgAcceptedAtMin: 30, hintsOpened: 1 });

    expect(report.students.map((s) => [s.userId, s.rank, s.totalScore, s.submissionCount, s.hintsOpened])).toEqual([
      [students.an!.user.id, 1, 190, 4, 1],
      [students.binh!.user.id, 2, 100, 2, 0],
      [students.chau!.user.id, 3, 0, 0, 0],
    ]);
    expect(report.students[0]!.email).toBe(students.an!.user.email);
    expect(report.students[2]!.lastSubmissionAt).toBeNull();
  });

  it('buckets scores by tenths of the total, with a perfect score in the last bucket', async () => {
    const { body } = await getReport(teacher.auth);
    const buckets = (body as AssignmentReport).scoreBuckets;
    expect(buckets).toHaveLength(10);
    expect(buckets[0]).toEqual({ from: 0, to: 20, count: 1 }); // chau: 0
    expect(buckets[5]).toEqual({ from: 100, to: 120, count: 1 }); // binh: 100
    expect(buckets[9]).toEqual({ from: 180, to: 200, count: 1 }); // an: 190
  });

  it('exports a UTF-8 CSV that Excel opens safely', async () => {
    const res = await getReport(teacher.auth, 'csv');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/^text\/csv; charset=utf-8/);
    expect(res.headers['content-disposition']).toContain("filename*=UTF-8''bao-cao-Ki%E1%BB%83m%20tra");
    expect(res.headers['content-disposition']).toContain('filename="bao-cao-Kiem-tra-giua-ky.csv"');

    const text = res.text;
    expect(text.startsWith('﻿')).toBe(true);
    const lines = text.slice(1).trimEnd().split('\r\n');
    expect(lines).toHaveLength(4);
    expect(lines[0]).toMatch(
      /^Hạng,Mã SV,Họ tên,Email,A\. rp-p1 \(100\),B\. rp-p2 \(100\),Tổng điểm \(200\),Số bài đúng,Thời gian \(phút\),Số lần nộp,Số gợi ý đã mở$/,
    );
    expect(lines[1]).toBe(`1,,Test STUDENT,${students.an!.user.email},100,90,190,2,50,4,1`);
    // The formula-looking name is neutralised and quoted.
    expect(lines[3]).toContain(`"'=HYPERLINK(""x"")"`);
  });

  it('is only for the classroom teacher and admins', async () => {
    expect((await getReport(students.an!.auth)).status).toBe(403);
    expect((await getReport((await createUser('TEACHER')).auth)).status).toBe(403);
    expect((await getReport((await createUser('ADMIN')).auth)).status).toBe(200);
    expect((await getReport(teacher.auth, 'xml')).status).toBe(400);
    const missing = await request(app).get('/api/teacher/assignments/nope/report').set('Authorization', teacher.auth);
    expect(missing.status).toBe(404);
  });
});

describe('csv helpers', () => {
  it('quotes separators and neutralises formula prefixes', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('-1+2')).toBe("'-1+2");
    expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)");
    expect(csvCell(-5)).toBe('-5');
    expect(csvCell(null)).toBe('');
    expect(toCsv([['x', 1]])).toBe('﻿x,1\r\n');
  });

  it('builds an ASCII fallback file name', () => {
    expect(attachmentHeader('Điểm "lớp".csv')).toBe(`attachment; filename="Diem-lop-.csv"; filename*=UTF-8''${encodeURIComponent('Điểm "lớp".csv')}`);
  });
});
