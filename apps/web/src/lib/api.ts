import type { AuthResponse } from '@judgehint/shared';

/** Error shape returned by the API: `{ error: { code, message, details? } }`. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** Field errors from a VALIDATION_ERROR response, keyed by field name. */
  get fieldErrors(): Record<string, string> {
    if (this.code !== 'VALIDATION_ERROR' || !this.details || typeof this.details !== 'object') return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(this.details as Record<string, unknown>)) {
      if (Array.isArray(v) && typeof v[0] === 'string') out[k] = v[0];
    }
    return out;
  }
}

interface ApiErrorBody {
  error?: { code?: string; message?: string; details?: unknown };
}

// ---- Session state ------------------------------------------------------
// The access token lives only in memory; the refresh token is an httpOnly cookie.

let accessToken: string | null = null;
type SessionListener = (session: AuthResponse | null) => void;
const listeners = new Set<SessionListener>();

export function onSessionChange(fn: SessionListener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export const getAccessToken = () => accessToken;

export function setSession(session: AuthResponse | null) {
  accessToken = session?.accessToken ?? null;
  listeners.forEach((fn) => fn(session));
}

async function parse<T>(res: Response): Promise<T> {
  const body = (await res.json().catch(() => null)) as unknown;
  if (!res.ok) {
    const err = (body as ApiErrorBody | null)?.error;
    throw new ApiError(res.status, err?.code ?? 'UNKNOWN', err?.message ?? 'Có lỗi xảy ra', err?.details);
  }
  return body as T;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let refreshing: Promise<AuthResponse | null> | null = null;

/**
 * Exchanges the refresh cookie for a new access token. Concurrent callers share one request.
 * Retries once because another tab may have rotated the cookie a moment earlier.
 */
export function refreshSession(): Promise<AuthResponse | null> {
  refreshing ??= (async () => {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' });
        const session = await parse<AuthResponse>(res);
        setSession(session);
        return session;
      } catch (err) {
        if (!(err instanceof ApiError) || err.code !== 'SESSION_EXPIRED' || attempt === 1) break;
        await sleep(300);
      }
    }
    setSession(null);
    return null;
  })().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

// ---- Fetch wrapper -------------------------------------------------------

/** fetch() with the access token; on 401 refreshes once and replays the request. */
async function authedFetch(path: string, init: RequestInit = {}, retried = false): Promise<Response> {
  const res = await fetch(`/api${path}`, {
    credentials: 'include',
    ...init,
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...init.headers,
    },
  });

  // Access token expired: refresh once and replay the request.
  if (res.status === 401 && !retried && accessToken && !path.startsWith('/auth/')) {
    const session = await refreshSession();
    if (session) return authedFetch(path, init, true);
  }
  return res;
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  return parse<T>(await authedFetch(path, init));
}

/** Name from `Content-Disposition`, preferring the UTF-8 `filename*` form. */
function attachmentName(header: string | null): string | null {
  const utf8 = header?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (utf8) {
    try {
      return decodeURIComponent(utf8);
    } catch {
      // fall through to the ASCII name
    }
  }
  return header?.match(/filename="([^"]+)"/i)?.[1] ?? null;
}

/**
 * Downloads an authenticated file. A plain link cannot carry the in-memory access token,
 * so the file is fetched and handed to the browser as a blob.
 */
export async function downloadFile(path: string, fallbackName: string): Promise<void> {
  const res = await authedFetch(path);
  if (!res.ok) await parse<never>(res);
  const url = URL.createObjectURL(await res.blob());
  const link = document.createElement('a');
  link.href = url;
  link.download = attachmentName(res.headers.get('Content-Disposition')) ?? fallbackName;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const post = <T>(path: string, body?: unknown) =>
  api<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) });
