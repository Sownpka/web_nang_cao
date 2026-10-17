import { Code2, Loader2 } from 'lucide-react';
import { Suspense } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import type { Role } from '@judgehint/shared';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/ThemeToggle';
import { UserMenu } from '@/components/UserMenu';
import { useAuth } from '@/features/auth/AuthProvider';
import { vi } from '@/i18n/vi';
import { cn } from '@/lib/utils';

const navItems: { to: string; label: string; roles?: Role[] }[] = [
  { to: '/problems', label: vi.nav.problems },
  { to: '/submissions', label: vi.nav.submissions },
  { to: '/classrooms', label: vi.nav.classrooms },
  { to: '/teacher', label: vi.nav.teacher, roles: ['TEACHER', 'ADMIN'] },
];

export function Layout() {
  const { user, status } = useAuth();
  const { pathname } = useLocation();
  const onAuthPage = pathname === '/login' || pathname === '/register';
  const visible = navItems.filter((item) => !item.roles || (user && item.roles.includes(user.role)));

  const nav = (
    <>
      {visible.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          className={({ isActive }) =>
            cn(
              'shrink-0 rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground',
              isActive && 'bg-accent text-foreground',
            )
          }
        >
          {item.label}
        </NavLink>
      ))}
    </>
  );

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4">
          <Link to="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <span className="grid size-7 place-items-center rounded-md bg-primary text-primary-foreground">
              <Code2 className="size-4" />
            </span>
            {vi.appName}
          </Link>
          {user && <nav className="hidden items-center gap-1 md:flex">{nav}</nav>}
          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            {user ? (
              <UserMenu user={user} />
            ) : (
              status === 'guest' &&
              !onAuthPage && (
                <Button size="sm" asChild>
                  <Link to="/login">{vi.nav.login}</Link>
                </Button>
              )
            )}
          </div>
        </div>
        {user && <nav className="flex gap-1 overflow-x-auto border-t px-4 py-1.5 md:hidden">{nav}</nav>}
      </header>
      <main className="flex-1">
        <Suspense
          fallback={
            <div className="grid place-items-center py-24">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          }
        >
          <Outlet />
        </Suspense>
      </main>
    </div>
  );
}
