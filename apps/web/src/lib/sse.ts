import { ApiError, getAccessToken, refreshSession } from './api';

export interface SseMessage {
  event: string;
  data: unknown;
}

async function open(path: string, signal: AbortSignal): Promise<Response> {
  const token = getAccessToken();
  return fetch(`/api${path}`, {
    headers: { Accept: 'text/event-stream', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    credentials: 'include',
    signal,
  });
}

/**
 * Reads a server-sent event stream with fetch (EventSource cannot send the Authorization header).
 * Errors returned before the stream opens are thrown as ApiError.
 */
export async function streamSse(path: string, onMessage: (m: SseMessage) => void, signal: AbortSignal): Promise<void> {
  let res = await open(path, signal);
  if (res.status === 401 && (await refreshSession())) res = await open(path, signal);

  if (!res.ok || !res.headers.get('content-type')?.includes('text/event-stream') || !res.body) {
    const body = (await res.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null;
    throw new ApiError(res.status, body?.error?.code ?? 'UNKNOWN', body?.error?.message ?? 'Có lỗi xảy ra');
  }

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    let sep: number;
    while ((sep = buffer.indexOf('\n\n')) !== -1) {
      const block = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      let event = 'message';
      const data: string[] = [];
      for (const line of block.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (line.startsWith('data:')) data.push(line.slice(5).trimStart());
      }
      if (!data.length) continue; // heartbeat comment
      onMessage({ event, data: JSON.parse(data.join('\n')) });
    }
  }
}
