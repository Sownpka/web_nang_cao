import type { Response } from 'express';

export interface SseChannel {
  send(event: string, data: unknown): void;
  close(): void;
}

/** Proxies (Cloudflare closes idle requests after ~100s) need periodic traffic. */
const HEARTBEAT_MS = 15_000;

/** Switches the response to text/event-stream and returns a small writer. */
export function openSse(res: Response): SseChannel {
  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // nginx: do not buffer
  res.flushHeaders();

  const heartbeat = setInterval(() => res.write(': ping\n\n'), HEARTBEAT_MS);
  let closed = false;

  return {
    send(event, data) {
      if (closed) return;
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    },
    close() {
      if (closed) return;
      closed = true;
      clearInterval(heartbeat);
      res.end();
    },
  };
}
