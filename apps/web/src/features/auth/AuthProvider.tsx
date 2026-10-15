import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { AuthResponse, AuthUser, LoginInput, RegisterInput } from '@judgehint/shared';
import { onSessionChange, post, refreshSession, setSession } from '@/lib/api';

type AuthStatus = 'loading' | 'authenticated' | 'guest';

interface AuthContextValue {
  status: AuthStatus;
  user: AuthUser | null;
  login: (input: LoginInput) => Promise<AuthUser>;
  register: (input: RegisterInput) => Promise<AuthUser>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    const off = onSessionChange((session) => {
      setUser(session?.user ?? null);
      setStatus(session ? 'authenticated' : 'guest');
    });
    // Restore the session from the refresh cookie on first load.
    void refreshSession();
    return off;
  }, []);

  const login = useCallback(async (input: LoginInput) => {
    const session = await post<AuthResponse>('/auth/login', input);
    setSession(session);
    return session.user;
  }, []);

  const register = useCallback(async (input: RegisterInput) => {
    const session = await post<AuthResponse>('/auth/register', input);
    setSession(session);
    return session.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await post('/auth/logout');
    } finally {
      setSession(null);
      queryClient.clear(); // never show the previous user's cached data
    }
  }, [queryClient]);

  const value = useMemo(() => ({ status, user, login, register, logout }), [status, user, login, register, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
