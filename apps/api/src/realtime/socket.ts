import type { Server as HttpServer } from 'node:http';
import jwt from 'jsonwebtoken';
import { Server } from 'socket.io';
import { prisma } from '@judgehint/db';
import {
  assignmentRoom,
  userRoom,
  type ClientToServerEvents,
  type Role,
  type ServerToClientEvents,
} from '@judgehint/shared';
import { env } from '../config.js';
import { verifyAccessToken } from '../lib/jwt.js';
import { logger } from '../lib/logger.js';

interface SocketData {
  userId: string;
  role: Role;
}

export type IoServer = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

/** May this user follow an assignment's live leaderboard? */
async function canJoinAssignment(userId: string, role: Role, assignmentId: string): Promise<boolean> {
  const assignment = await prisma.assignment.findUnique({
    where: { id: assignmentId },
    select: { classroom: { select: { id: true, teacherId: true } } },
  });
  if (!assignment) return false;
  if (role === 'ADMIN' || assignment.classroom.teacherId === userId) return true;
  const enrolled = await prisma.enrollment.findUnique({
    where: { userId_classroomId: { userId, classroomId: assignment.classroom.id } },
  });
  return !!enrolled;
}

export function createSocketServer(httpServer: HttpServer): IoServer {
  const io: IoServer = new Server(httpServer, {
    path: '/socket.io',
    cors: { origin: env.WEB_ORIGIN, credentials: true },
    serveClient: false,
  });

  // Handshake auth with the same access token as the REST API.
  io.use((socket, next) => {
    const token: unknown = socket.handshake.auth?.token;
    if (typeof token !== 'string' || !token) return next(new Error('UNAUTHORIZED'));
    try {
      const payload = verifyAccessToken(token);
      socket.data.userId = payload.sub;
      socket.data.role = payload.role;
      next();
    } catch (err) {
      // The client refreshes its token and reconnects on TOKEN_EXPIRED.
      next(new Error(err instanceof jwt.TokenExpiredError ? 'TOKEN_EXPIRED' : 'INVALID_TOKEN'));
    }
  });

  io.on('connection', (socket) => {
    const { userId, role } = socket.data;
    void socket.join(userRoom(userId));

    socket.on('join:assignment', async (payload, ack) => {
      const assignmentId = typeof payload?.assignmentId === 'string' ? payload.assignmentId : '';
      try {
        if (!assignmentId || !(await canJoinAssignment(userId, role, assignmentId))) {
          ack?.({ ok: false, error: 'FORBIDDEN' });
          return;
        }
        await socket.join(assignmentRoom(assignmentId));
        ack?.({ ok: true });
      } catch (err) {
        logger.error({ err: (err as Error).message }, 'join:assignment failed');
        ack?.({ ok: false, error: 'INTERNAL_ERROR' });
      }
    });

    socket.on('leave:assignment', (payload) => {
      if (typeof payload?.assignmentId === 'string') void socket.leave(assignmentRoom(payload.assignmentId));
    });
  });

  return io;
}
