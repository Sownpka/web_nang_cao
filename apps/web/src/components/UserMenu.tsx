import { LogOut } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import type { AuthUser } from '@judgehint/shared';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/features/auth/AuthProvider';
import { vi } from '@/i18n/vi';
import { cn } from '@/lib/utils';

const roleStyles: Record<AuthUser['role'], string> = {
  STUDENT: 'bg-secondary text-secondary-foreground',
  TEACHER: 'bg-primary/15 text-primary',
  ADMIN: 'bg-destructive/15 text-destructive',
};

export function UserMenu({ user }: { user: AuthUser }) {
  const { logout } = useAuth();
  const navigate = useNavigate();

  const initials = user.fullName
    .split(/\s+/)
    .slice(-2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();

  return (
    <div className="flex items-center gap-2">
      <Link to="/profile" title={vi.nav.profile} aria-label={vi.nav.profile} className="flex items-center gap-2 rounded-md px-1 py-0.5 hover:bg-accent">
        <span className="grid size-8 place-items-center rounded-full bg-accent text-xs font-semibold" aria-hidden>
          {initials}
        </span>
        <div className="hidden leading-tight sm:block">
          <p className="max-w-40 truncate text-sm font-medium">{user.fullName}</p>
          <span className={cn('rounded px-1.5 py-px text-[11px] font-medium', roleStyles[user.role])}>
            {vi.roles[user.role]}
          </span>
        </div>
      </Link>
      <Button
        variant="ghost"
        size="icon"
        aria-label={vi.nav.logout}
        title={vi.nav.logout}
        onClick={async () => {
          await logout();
          navigate('/login');
        }}
      >
        <LogOut />
      </Button>
    </div>
  );
}
