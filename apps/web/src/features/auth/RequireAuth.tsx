import { Loader2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import type { Role } from '@judgehint/shared';
import { ForbiddenPage } from '@/pages/ForbiddenPage';
import { useAuth } from './AuthProvider';

interface Props {
  children: ReactNode;
  /** When set, only these roles may view the route. */
  roles?: readonly Role[];
}

export function RequireAuth({ children, roles }: Props) {
  const { status, user } = useAuth();
  const location = useLocation();

  if (status === 'loading') {
    return (
      <div className="grid place-items-center py-24 text-muted-foreground">
        <Loader2 className="size-6 animate-spin" />
      </div>
    );
  }
  if (!user) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }
  if (roles && !roles.includes(user.role)) return <ForbiddenPage />;
  return <>{children}</>;
}

/** Only allow same-origin relative paths as post-login redirects. */
export function safeNext(raw: string | null): string {
  return raw && raw.startsWith('/') && !raw.startsWith('//') ? raw : '/problems';
}
