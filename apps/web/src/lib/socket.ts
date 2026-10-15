import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@judgehint/shared';
import { getAccessToken } from './api';

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: AppSocket | null = null;

/** Single app-wide socket; connected by SocketProvider while signed in. */
export function getSocket(): AppSocket {
  socket ??= io({
    path: '/socket.io',
    autoConnect: false,
    transports: ['websocket', 'polling'],
    // Read the token on every (re)connect so a refreshed token is always used.
    auth: (cb) => cb({ token: getAccessToken() ?? '' }),
  });
  return socket;
}
