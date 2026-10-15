import { Loader2, X } from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { LANGUAGE_LABELS } from '@judgehint/shared';
import { VerdictBadge } from '@/components/VerdictBadge';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/features/auth/AuthProvider';
import { useSubmissions } from '@/features/submissions/api';
import { vi } from '@/i18n/vi';
import { formatDateTime, formatRelative } from '@/lib/time';

const t = vi.history;
const PAGE_SIZE = 20;

export function SubmissionsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const isStaff = user?.role === 'TEACHER' || user?.role === 'ADMIN';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const problemId = params.get('problemId') ?? undefined;
  // Staff see everyone's submissions unless they ask for their own.
  const onlyMine = !isStaff || params.get('mine') === '1';

  const { data, isLoading, isError, isFetching } = useSubmissions({
    problemId,
    mine: onlyMine ? '1' : undefined,
    page,
    pageSize: PAGE_SIZE,
  });
  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;
  const filteredProblem = problemId ? data?.items[0]?.problem : undefined;

  const update = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    setParams(next, { replace: true });
  };

  const cols = isStaff ? 7 : 6;

  return (
    <section className="mx-auto max-w-6xl px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{isStaff ? t.subtitleStaff : t.subtitle}</p>
        </div>
        <div className="flex items-center gap-3">
          {isFetching && !isLoading && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
          {isStaff && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4"
                checked={onlyMine}
                onChange={(e) => update({ mine: e.target.checked ? '1' : undefined, page: undefined })}
              />
              {t.onlyMine}
            </label>
          )}
        </div>
      </div>

      {problemId && (
        <div className="mt-4 flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">{t.filteredBy(filteredProblem?.title ?? '…')}</span>
          <Button variant="ghost" size="sm" onClick={() => update({ problemId: undefined, page: undefined })}>
            <X />
            {t.clearFilter}
          </Button>
        </div>
      )}

      <div className="mt-4 overflow-x-auto rounded-xl border">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5 font-medium">{t.colTime}</th>
              <th className="px-4 py-2.5 font-medium">{t.colProblem}</th>
              {isStaff && <th className="px-4 py-2.5 font-medium">{t.colUser}</th>}
              <th className="px-4 py-2.5 font-medium">{t.colLanguage}</th>
              <th className="px-4 py-2.5 font-medium">{t.colVerdict}</th>
              <th className="px-4 py-2.5 text-right font-medium">{t.colRuntime}</th>
              <th className="px-4 py-2.5 text-right font-medium">{t.colMemory}</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {isLoading &&
              Array.from({ length: 5 }, (_, i) => (
                <tr key={i}>
                  <td colSpan={cols} className="px-4 py-3">
                    <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
                  </td>
                </tr>
              ))}
            {isError && (
              <tr>
                <td colSpan={cols} className="px-4 py-10 text-center text-destructive">
                  {t.loadError}
                </td>
              </tr>
            )}
            {data?.items.length === 0 && (
              <tr>
                <td colSpan={cols} className="px-4 py-10 text-center text-muted-foreground">
                  {t.empty}
                </td>
              </tr>
            )}
            {data?.items.map((s) => (
              <tr
                key={s.id}
                className="cursor-pointer transition-colors hover:bg-accent/50"
                onClick={() => navigate(`/submissions/${s.id}`)}
              >
                <td className="px-4 py-3 whitespace-nowrap text-muted-foreground" title={formatDateTime(s.createdAt)}>
                  <Link to={`/submissions/${s.id}`} className="hover:text-foreground" onClick={(e) => e.stopPropagation()}>
                    {formatRelative(s.createdAt)}
                  </Link>
                </td>
                <td className="px-4 py-3 font-medium">{s.problem.title}</td>
                {isStaff && (
                  <td className="px-4 py-3">
                    {s.user.fullName}
                    {s.user.studentCode && <span className="ml-1 text-xs text-muted-foreground">({s.user.studentCode})</span>}
                  </td>
                )}
                <td className="px-4 py-3 text-muted-foreground">{LANGUAGE_LABELS[s.language].split(' ')[0]}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <VerdictBadge verdict={s.verdict} />
                    <span className="text-xs text-muted-foreground">
                      {s.passedCount}/{s.totalCount}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-3 text-right text-muted-foreground tabular-nums">{s.runtimeMs !== null ? `${s.runtimeMs} ms` : '—'}</td>
                <td className="px-4 py-3 text-right text-muted-foreground tabular-nums">
                  {s.memoryKb !== null ? `${(s.memoryKb / 1024).toFixed(1)} MB` : '—'}
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
