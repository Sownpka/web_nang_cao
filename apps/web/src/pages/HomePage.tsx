import { useQuery } from '@tanstack/react-query';
import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { vi } from '@/i18n/vi';
import { cn } from '@/lib/utils';

interface Health {
  ok: boolean;
  db: 'ok' | 'down';
  redis: 'ok' | 'down';
}

function StatusRow({ label, state }: { label: string; state: 'ok' | 'down' | 'loading' }) {
  const text = state === 'ok' ? vi.home.statusOk : state === 'down' ? vi.home.statusDown : vi.home.statusChecking;
  return (
    <li className="flex items-center justify-between py-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="flex items-center gap-2">
        <span
          className={cn(
            'size-2 rounded-full',
            state === 'ok' && 'bg-primary',
            state === 'down' && 'bg-destructive',
            state === 'loading' && 'animate-pulse bg-muted-foreground',
          )}
        />
        {text}
      </span>
    </li>
  );
}

export function HomePage() {
  // The API answers 503 with a body when a dependency is down, so read the body either way.
  const health = useQuery({
    queryKey: ['health'],
    queryFn: async () => {
      const res = await fetch('/api/health');
      if (!res.headers.get('content-type')?.includes('json')) throw new Error(vi.home.apiUnreachable);
      return (await res.json()) as Health;
    },
    refetchInterval: 10_000,
    retry: false,
  });

  const apiState = health.isLoading ? 'loading' : health.isError ? 'down' : 'ok';
  const dep = (s?: 'ok' | 'down') => (health.isLoading ? 'loading' : (s ?? 'down'));

  return (
    <section className="mx-auto grid max-w-6xl gap-10 px-4 py-16 md:grid-cols-[1.4fr_1fr] md:items-start">
      <div className="space-y-5">
        <p className="text-sm font-medium text-primary">{vi.tagline}</p>
        <h1 className="text-4xl font-bold tracking-tight text-balance sm:text-5xl">{vi.home.heading}</h1>
        <p className="max-w-xl text-lg text-muted-foreground text-pretty">{vi.home.intro}</p>
        <Button size="lg" asChild>
          <Link to="/problems">
            {vi.home.start}
            <ArrowRight />
          </Link>
        </Button>
      </div>

      <div className="rounded-xl border bg-card p-5 text-card-foreground">
        <h2 className="mb-2 text-sm font-semibold">{vi.home.systemStatus}</h2>
        <ul className="divide-y">
          <StatusRow label={vi.home.api} state={apiState} />
          <StatusRow label={vi.home.database} state={dep(health.data?.db)} />
          <StatusRow label={vi.home.cache} state={dep(health.data?.redis)} />
        </ul>
      </div>
    </section>
  );
}
