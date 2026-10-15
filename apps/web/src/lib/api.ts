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

export async function api<T>(path: string, init: RequestInit = {}, retried = false): Promise<T> {
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
    if (session) return api<T>(path, init, true);
  }
  return parse<T>(res);
}

export const post = <T>(path: string, body?: unknown) =>
  api<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) });
