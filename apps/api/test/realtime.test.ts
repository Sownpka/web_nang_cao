import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import jwt from 'jsonwebtoken';
import { io as connect, type Socket } from 'socket.io-client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@judgehint/db';
import {
  JUDGE_EVENTS_CHANNEL,
  type ClientToServerEvents,
  type JudgeEvent,
  type ServerToClientEvents,
} from '@judgehint/shared';
import { createApp } from '../src/app.js';
import { redis } from '../src/lib/redis.js';
import { setIo } from '../src/realtime/ioRegistry.js';
import { startJudgeEventBridge } from '../src/realtime/judgeEvents.js';
import { createSocketServer, type IoServer } from '../src/realtime/socket.js';
import { createUser } from './helpers.js';

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;

let server: Server;
let io: IoServer;
let stopBridge: () => Promise<void>;
let url: string;
const clients: Client[] = [];

beforeAll(async () => {
  server = createServer(createApp());
  io = createSocketServer(server);
  setIo(io);
  stopBridge = await startJudgeEventBridge(io, redis);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  url = `http://localhost:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  clients.forEach((c) => c.disconnect());
  setIo(null);
  await stopBridge();
  await new Promise<void>((resolve) => io.close(() => resolve()));
});

/** Connects with the given Authorization header value ("Bearer …") or none. */
function client(auth?: string): Client {
  const c: Client = connect(url, {
    path: '/socket.io',
    transports: ['websocket'],
    auth: auth ? { token: auth.replace(/^Bearer /, '') } : {},
    reconnection: false,
  });
  clients.push(c);
  return c;
}

const connected = (c: Client) =>
  new Promise<void>((resolve, reject) => {
    c.once('connect', () => resolve());
    c.once('connect_error', reject);
  });

const connectError = (c: Client) => new Promise<string>((resolve) => c.once('connect_error', (err) => resolve(err.message)));

const publish = (event: JudgeEvent) => redis.publish(JUDGE_EVENTS_CHANNEL, JSON.stringify(event));

describe('socket authentication', () => {
  it('rejects connections without a token', async () => {
    expect(await connectError(client())).toBe('UNAUTHORIZED');
  });

  it('rejects an expired token with TOKEN_EXPIRED', async () => {
    const expired = jwt.sign({ role: 'STUDENT', exp: Math.floor(Date.now() / 1000) - 5 }, process.env.JWT_ACCESS_SECRET!, {
      subject: 'someone',
      issuer: 'judgehint',
    });
    expect(await connectError(client(expired))).toBe('TOKEN_EXPIRED');
  });
});

describe('judge event relay', () => {
  it('delivers progress and done only to the submission owner', async () => {
    const owner = await createUser('STUDENT');
    const other = await createUser('STUDENT');
    const a = client(owner.auth);
    const b = client(other.auth);
    await Promise.all([connected(a), connected(b)]);

    let leaked = false;
    b.on('submission:progress', () => (leaked = true));

    const progress = new Promise((resolve) => a.once('submission:progress', resolve));
    const done = new Promise((resolve) => a.once('submission:done', resolve));
    // Give the server a tick to finish joining rooms.
    await new Promise((r) => setTimeout(r, 50));

    await publish({ type: 'progress', submissionId: 's1', userId: owner.user.id, testIndex: 2, total: 5, status: 'RUNNING' });
    await publish({
      type: 'done',
      submissionId: 's1',
      userId: owner.user.id,
      assignmentId: null,
      verdict: 'ACCEPTED',
      passedCount: 5,
      totalCount: 5,
      runtimeMs: 12,
      memoryKb: 9000,
    });

    expect(await progress).toEqual({ submissionId: 's1', testIndex: 2, total: 5, status: 'RUNNING' });
    expect(await done).toMatchObject({ submissionId: 's1', verdict: 'ACCEPTED' });
    await new Promise((r) => setTimeout(r, 100));
    expect(leaked).toBe(false);
  });

  it('relays sample-run results', async () => {
    const owner = await createUser('STUDENT');
    const a = client(owner.auth);
    await connected(a);
    await new Promise((r) => setTimeout(r, 50));
    const received = new Promise((resolve) => a.once('run:done', resolve));
    await publish({
      type: 'run-done',
      userId: owner.user.id,
      result: { runId: 'r1', problemId: 'p', status: 'DONE', total: 0, cases: [] },
    });
    expect(await received).toMatchObject({ runId: 'r1', status: 'DONE' });
  });
});

describe('join:assignment', () => {
  it('admits enrolled students and the classroom teacher only', async () => {
    const teacher = await createUser('TEACHER');
    const member = await createUser('STUDENT');
    const outsider = await createUser('STUDENT');
    const classroom = await prisma.classroom.create({
      data: { name: 'Lớp test', joinCode: `J${Date.now()}`, teacherId: teacher.user.id, enrollments: { create: { userId: member.user.id } } },
    });
    const assignment = await prisma.assignment.create({
      data: { classroomId: classroom.id, title: 'BT', startsAt: new Date(), endsAt: new Date(Date.now() + 3600e3) },
    });

    const join = async (auth: string) => {
      const c = client(auth);
      await connected(c);
      return c.emitWithAck('join:assignment', { assignmentId: assignment.id });
    };

    expect(await join(member.auth)).toEqual({ ok: true });
    expect(await join(teacher.auth)).toEqual({ ok: true });
    expect(await join(outsider.auth)).toEqual({ ok: false, error: 'FORBIDDEN' });
  });
});

describe('live leaderboard', () => {
  it('pushes the recomputed leaderboard to the assignment room when an assignment submission is judged', async () => {
    const teacher = await createUser('TEACHER');
    const student = await createUser('STUDENT');
    const problem = await prisma.problem.create({
      data: { slug: `rt-lb-${Date.now()}`, title: 'RT', statementMd: 'Đề.', difficulty: 'EASY', allowedLanguages: ['python'], authorId: teacher.user.id },
    });
    const classroom = await prisma.classroom.create({
      data: { name: 'Lớp RT', joinCode: `R${Date.now()}`.slice(0, 12), teacherId: teacher.user.id, enrollments: { create: { userId: student.user.id } } },
    });
    const assignment = await prisma.assignment.create({
      data: {
        classroomId: classroom.id,
        title: 'RT',
        startsAt: new Date(Date.now() - 600e3),
        endsAt: new Date(Date.now() + 600e3),
        problems: { create: { problemId: problem.id, points: 100 } },
      },
    });

    // The teacher watches the board; the student is the one who solves.
    const watcher = client(teacher.auth);
    await connected(watcher);
    expect(await watcher.emitWithAck('join:assignment', { assignmentId: assignment.id })).toEqual({ ok: true });

    const sub = await prisma.submission.create({
      data: { userId: student.user.id, problemId: problem.id, assignmentId: assignment.id, language: 'python', code: 'x', verdict: 'ACCEPTED' },
    });
    const update = new Promise<{ assignmentId: string; rows: { userId: string; totalScore: number; rank: number }[] }>((resolve) =>
      watcher.once('leaderboard:update', resolve),
    );
    await publish({
      type: 'done',
      submissionId: sub.id,
      userId: student.user.id,
      assignmentId: assignment.id,
      verdict: 'ACCEPTED',
      passedCount: 1,
      totalCount: 1,
      runtimeMs: 10,
      memoryKb: 1000,
    });

    const board = await update;
    expect(board.assignmentId).toBe(assignment.id);
    expect(board.rows[0]).toMatchObject({ userId: student.user.id, totalScore: 100, rank: 1 });
  });
});
