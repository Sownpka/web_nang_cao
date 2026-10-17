import { CheckCircle2, Loader2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { DIFFICULTY_LABELS, LANGUAGE_LABELS, PROFILE_TIMELINE_DAYS, type UserStats } from '@judgehint/shared';
import { ColumnChart } from '@/components/charts/ColumnChart';
import { TrendChart } from '@/components/charts/TrendChart';
import { DifficultyBadge } from '@/components/DifficultyBadge';
import { Meter, StatTile } from '@/components/StatTile';
import { Button } from '@/components/ui/button';
import { VerdictBadge } from '@/components/VerdictBadge';
import { useAuth } from '@/features/auth/AuthProvider';
import { useMyStats } from '@/features/reports/api';
import { vi } from '@/i18n/vi';
import { ApiError } from '@/lib/api';
import { formatDateTime, formatRelative } from '@/lib/time';

const t = vi.profile;
/** `2026-09-07` → `07/09`. */
const shortDay = (date: string) => `${date.slice(8, 10)}/${date.slice(5, 7)}`;
const pct = (x: number) => `${Math.round(x * 100)}%`;
const TICK_EVERY = 15;

function Card({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <h2 className="text-sm font-semibold">{title}</h2>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      <div className="mt-3">{children}</div>
    </div>
  );
}

function Charts({ stats }: { stats: UserStats }) {
  return (
    <>
      <Card title={t.progress} hint={t.progressHint(PROFILE_TIMELINE_DAYS)}>
        <TrendChart
          ariaLabel={t.progress}
          tickEvery={TICK_EVERY}
          data={stats.timeline.map((p) => ({
            key: p.date,
            label: shortDay(p.date),
            value: p.cumulativeSolved,
            tooltip: (
              <>
                <p className="font-medium">{shortDay(p.date)}</p>
                <p>{t.tipSolvedTotal(p.cumulativeSolved)}</p>
                {p.solved > 0 && <p className="text-muted-foreground">{t.tipSolvedDay(p.solved)}</p>}
              </>
            ),
          }))}
        />
      </Card>
      <Card title={t.activity}>
        <ColumnChart
          ariaLabel={t.activity}
          height={150}
          tickEvery={TICK_EVERY}
          data={stats.timeline.map((p) => ({
            key: p.date,
            label: shortDay(p.date),
            value: p.submissions,
            tooltip: (
              <>
                <p className="font-medium">{shortDay(p.date)}</p>
                <p>{t.tipSubs(p.submissions)}</p>
              </>
            ),
          }))}
        />
      </Card>
    </>
  );
}

function Sidebar({ stats }: { stats: UserStats }) {
  const judged = stats.verdicts.reduce((n, v) => n + v.count, 0);
  return (
    <>
      <Card title={t.byDifficulty}>
        <ul className="space-y-3">
          {stats.byDifficulty.map((d) => (
            <li key={d.difficulty}>
              <div className="flex items-center justify-between text-xs">
                <DifficultyBadge difficulty={d.difficulty} />
                <span className="tabular-nums text-muted-foreground">{t.solvedOf(d.solved, d.total)}</span>
              </div>
              <Meter value={d.total ? d.solved / d.total : 0} className="mt-1.5" label={DIFFICULTY_LABELS[d.difficulty]} />
            </li>
          ))}
        </ul>
      </Card>

      <Card title={t.verdicts}>
        <ul className="space-y-2.5">
          {stats.verdicts.map((v) => (
            <li key={v.verdict}>
              <div className="flex items-center justify-between text-xs">
                <VerdictBadge verdict={v.verdict} />
                <span className="tabular-nums">
                  {v.count} <span className="text-muted-foreground">· {pct(v.count / judged)}</span>
                </span>
              </div>
              <Meter value={v.count / judged} className="mt-1.5" />
            </li>
          ))}
        </ul>
      </Card>

      {stats.languages.length > 0 && (
        <Card title={t.languages}>
          <ul className="space-y-1.5 text-sm">
            {stats.languages.map((l) => (
              <li key={l.language} className="flex justify-between">
                <span>{LANGUAGE_LABELS[l.language]}</span>
                <span className="tabular-nums text-muted-foreground">{l.count}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {stats.recentSolved.length > 0 && (
        <Card title={t.recent}>
          <ul className="divide-y text-sm">
            {stats.recentSolved.map((r) => (
              <li key={r.problemId} className="flex items-center gap-2 py-2 first:pt-0 last:pb-0">
                <CheckCircle2 className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                <Link to={`/problems/${r.slug}`} className="min-w-0 flex-1 truncate font-medium hover:text-primary">
                  {r.title}
                </Link>
                <span className="shrink-0 text-xs text-muted-foreground" title={formatDateTime(r.solvedAt)}>
                  {formatRelative(r.solvedAt)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}

export function ProfilePage() {
  const { user } = useAuth();
  const { data: stats, isLoading, error } = useMyStats();

  if (!user) return null;
  const initials = user.fullName
    .split(/\s+/)
    .slice(-2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();

  return (
    <section className="mx-auto max-w-6xl px-4 py-8">
      <div className="flex items-center gap-4">
        <span className="grid size-14 place-items-center rounded-full bg-primary/15 text-lg font-semibold text-primary" aria-hidden>
          {initials}
        </span>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{user.fullName}</h1>
          <p className="text-sm text-muted-foreground">
            {[vi.roles[user.role], user.studentCode && t.studentCode(user.studentCode), user.email].filter(Boolean).join(' · ')}
          </p>
        </div>
      </div>

      {isLoading && (
        <div className="grid place-items-center py-24">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      )}
      {error && <p className="py-12 text-center text-sm text-destructive">{error instanceof ApiError ? error.message : String(error)}</p>}

      {stats && (
        <>
          <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile label={t.solved} value={stats.totals.solvedProblems} sub={t.solvedSub(stats.totals.attemptedProblems)} />
            <StatTile
              label={t.acceptance}
              value={stats.totals.acceptanceRate === null ? '—' : pct(stats.totals.acceptanceRate)}
              sub={t.acceptanceSub(
                stats.totals.acceptedSubmissions,
                stats.verdicts.reduce((n, v) => n + v.count, 0),
              )}
            />
            <StatTile label={t.submissions} value={stats.totals.submissions} />
            <StatTile label={t.hints} value={stats.totals.hintsOpened} />
          </div>

          {stats.totals.submissions === 0 ? (
            <div className="mt-8 rounded-xl border border-dashed px-4 py-12 text-center">
              <p className="text-sm text-muted-foreground">{t.noData}</p>
              <Button className="mt-4" asChild>
                <Link to="/problems">{t.startSolving}</Link>
              </Button>
            </div>
          ) : (
            <div className="mt-6 grid gap-4 lg:grid-cols-3">
              <div className="min-w-0 space-y-4 lg:col-span-2">
                <Charts stats={stats} />
              </div>
              <div className="min-w-0 space-y-4">
                <Sidebar stats={stats} />
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
