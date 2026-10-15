import { CheckCircle2, CircleDot, Loader2, Plus, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { DIFFICULTY_LABELS, Difficulty, LANGUAGE_LABELS, type ProblemListItem } from '@judgehint/shared';
import { DifficultyBadge } from '@/components/DifficultyBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/features/auth/AuthProvider';
import { useProblems } from '@/features/problems/api';
import { useDebounced } from '@/hooks/useDebounced';
import { vi } from '@/i18n/vi';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 20;
const DIFFICULTIES = ['', Difficulty.EASY, Difficulty.MEDIUM, Difficulty.HARD] as const;

function StatusIcon({ p }: { p: ProblemListItem }) {
  if (p.solved) return <CheckCircle2 className="size-4 text-primary" aria-label={vi.problems.solved} />;
  if (p.attempted) return <CircleDot className="size-4 text-amber-500" aria-label={vi.problems.attempted} />;
  return <span className="sr-only">—</span>;
}

export function ProblemsPage() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const difficulty = (params.get('difficulty') ?? '') as (typeof DIFFICULTIES)[number];
  const page = Math.max(1, Number(params.get('page')) || 1);

  const [search, setSearch] = useState(params.get('q') ?? '');
  const q = useDebounced(search.trim(), 300);

  const update = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    setParams(next, { replace: true });
  };

  // Sync the debounced search into the URL and go back to page 1.
  useEffect(() => {
    if ((params.get('q') ?? '') !== q) update({ q, page: '' });
  }, [q]);

  const { data, isLoading, isError, isFetching } = useProblems({
    q: q || undefined,
    difficulty: difficulty || undefined,
    page,
    pageSize: PAGE_SIZE,
  });
  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;
  const isStaff = user?.role === 'TEACHER' || user?.role === 'ADMIN';

  return (
    <section className="mx-auto max-w-6xl px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{vi.problems.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{vi.problems.subtitle}</p>
        </div>
        {isStaff && (
          <Button asChild>
            <Link to="/teacher/problems/new">
              <Plus />
              {vi.problems.create}
            </Link>
          </Button>
        )}
      </div>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative sm:w-72">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={vi.problems.search}
            className="h-9 pl-9"
            aria-label={vi.problems.search}
          />
        </div>
        <div className="flex gap-1 rounded-lg border p-1" role="group" aria-label={vi.problems.colDifficulty}>
          {DIFFICULTIES.map((d) => (
            <button
              key={d || 'all'}
              type="button"
              aria-pressed={difficulty === d}
              onClick={() => update({ difficulty: d, page: '' })}
              className={cn(
                'rounded-md px-3 py-1 text-sm text-muted-foreground transition-colors hover:text-foreground',
                difficulty === d && 'bg-accent text-foreground',
              )}
            >
              {d ? DIFFICULTY_LABELS[d] : vi.problems.allDifficulties}
            </button>
          ))}
        </div>
        {isFetching && !isLoading && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
        {data && <span className="text-sm text-muted-foreground sm:ml-auto">{vi.problems.total(data.total)}</span>}
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
            <tr>
              <th className="w-12 px-4 py-2.5 font-medium">
                <span className="sr-only">{vi.problems.colStatus}</span>
              </th>
              <th className="px-4 py-2.5 font-medium">{vi.problems.colTitle}</th>
              <th className="w-28 px-4 py-2.5 font-medium">{vi.problems.colDifficulty}</th>
              <th className="hidden w-64 px-4 py-2.5 font-medium md:table-cell">{vi.problems.colLanguages}</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {isLoading &&
              Array.from({ length: 6 }, (_, i) => (
                <tr key={i}>
                  <td colSpan={4} className="px-4 py-3">
                    <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
                  </td>
                </tr>
              ))}
            {isError && (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-destructive">
                  {vi.problems.loadError}
                </td>
              </tr>
            )}
            {data?.items.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-muted-foreground">
                  {vi.problems.empty}
                </td>
              </tr>
            )}
            {data?.items.map((p) => (
              <tr key={p.id} className="transition-colors hover:bg-accent/50">
                <td className="px-4 py-3">
                  <StatusIcon p={p} />
                </td>
                <td className="px-4 py-3">
                  <Link to={`/problems/${p.slug}`} className="font-medium hover:text-primary">
                    {p.title}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <DifficultyBadge difficulty={p.difficulty} />
                </td>
                <td className="hidden px-4 py-3 text-muted-foreground md:table-cell">
                  {p.allowedLanguages.map((l) => LANGUAGE_LABELS[l].split(' ')[0]).join(', ')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <div className="mt-4 flex items-center justify-end gap-2 text-sm">
          <span className="text-muted-foreground">{vi.problems.pageOf(page, pages)}</span>
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => update({ page: String(page - 1) })}>
            {vi.problems.prev}
          </Button>
          <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => update({ page: String(page + 1) })}>
            {vi.problems.next}
          </Button>
        </div>
      )}
    </section>
  );
}
