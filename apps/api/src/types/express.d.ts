import type { Role } from '@judgehint/shared';

declare global {
  namespace Express {
    interface Request {
      /** Set by `requireAuth` from a verified access token. */
      user?: { id: string; role: Role };
    }
  }
}

export {};
