import type { IoServer } from './socket.js';

/** The Socket.IO server, once started; services use it to push updates without importing the server. */
let io: IoServer | null = null;

export function setIo(server: IoServer | null) {
  io = server;
}

export function getIo(): IoServer | null {
  return io;
}
