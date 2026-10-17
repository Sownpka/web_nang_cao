import { ArrowLeft, CheckCircle2, Loader2, Pencil, Sparkles } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { assignmentStatus } from '@judgehint/shared';
import { AssignmentStatusBadge, Countdown } from '@/components/Countdown';
import { DifficultyBadge } from '@/components/DifficultyBadge';
import { Button } from '@/components/ui/button';
import { useAssignment, useLiveLeaderboard } from '@/features/classrooms/api';
import { LeaderboardTable } from '@/features/classrooms/LeaderboardTable';
import { useSocketConnected } from '@/features/realtime/SocketProvider';
import { vi } from '@/i18n/vi';
import { ApiError } from '@/lib/api';
import { formatDateTime } from '@/lib/time';
import { cn } from '@/lib/utils';

const t = vi.assignment;

export function AssignmentPage() {
  const { id = '' } = useParams();
  const { data: a, isLoading, error } = useAssignment(id);
  const board = useLiveLeaderboard(id);
  const live = useSocketConnected();

  if (isLoading) {
    return (
      <div className="grid place-items-center py-24">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (error || !a) {
    return (
      <section className="mx-auto max-w-md px-4 py-24 text-center">
        <p className="text-lg font-semibold">{error instanceof ApiError ? error.message : vi.classes.notFound}</p>
        <Button variant="outline" className="mt-4" asChild>
          <Link to="/classrooms">{vi.classes.title}</Link>
        </Button>
      </section>
    );
  }

  const upcoming = assignmentStatus(a.startsAt, a.endsAt) === 'UPCOMING' && !a.canManage;
  const mine = a.myRow;
  const cellOf = (problemId: string) => mine?.cells.find((c) => c.problemId === problemId);

  return (
    <section className="mx-auto max-w-6xl px-4 py-8">
      <Link to={`/classrooms/${a.classroom.id}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" />
        {a.classroom.name}
      </Link>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{a.title}</h1>
            <AssignmentStatusBadge startsAt={a.startsAt} endsAt={a.endsAt} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {vi.classes.window(formatDateTime(a.startsAt), formatDateTime(a.endsAt))} · {vi.classes.problems(a.problemCount, a.totalPoints)}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="rounded-xl border bg-card px-4 py-2 text-right">
            <Countdown startsAt={a.startsAt} endsAt={a.endsAt} className="text-lg font-semibold" />
            {mine && board.data && (
              <p className="text-xs text-muted-foreground">
                {t.myScore(mine.totalScore, a.totalPoints)} · {t.myRank(mine.rank, board.data.rows.length)}
              </p>
            )}
          </div>
          {a.canManage && (
            <Button variant="outline" size="sm" asChild>
              <Link to={`/assignments/${a.id}/edit`}>
                <Pencil />
                {vi.classes.editAssignment}
              </Link>
            </Button>
          )}
        </div>
      </div>

      <h2 className="mt-8 mb-3 text-sm font-semibold">{t.problemsTitle}</h2>
      {upcoming && <p className="mb-3 text-sm text-muted-foreground">{t.notStarted}</p>}
      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full min-w-[520px] text-sm">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
            <tr>
              <th className="w-10 px-4 py-2.5 font-medium">#</th>
              <th className="px-4 py-2.5 font-medium">{t.colProblem}</th>
              <th className="w-28 px-4 py-2.5 font-medium">{vi.problems.colDifficulty}</th>
              <th className="w-20 px-4 py-2.5 text-right font-medium">{t.colPoints}</th>
              {mine && <th className="w-48 px-4 py-2.5 font-medium">{t.colMine}</th>}
            </tr>
          </thead>
          <tbody className="divide-y">
            {a.problems.map((p, i) => {
              const cell = cellOf(p.id);
              return (
                <tr key={p.id}>
                  <td className="px-4 py-3 font-mono text-muted-foreground">{String.fromCharCode(65 + i)}</td>
                  <td className="px-4 py-3">
                    {upcoming ? (
                      <span className="text-muted-foreground">{p.title}</span>
                    ) : (
                      <Link to={`/problems/${p.slug}?assignment=${a.id}`} className="font-medium hover:text-primary">
                        {p.title}
                      </Link>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <DifficultyBadge difficulty={p.difficulty} />
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{p.points}</td>
                  {mine && (
                    <td className="px-4 py-3 text-xs">
                      {cell?.solved ? (
                        <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                          <CheckCircle2 className="size-4" />
                          {t.solvedCell(cell.score, p.points)}
                        </span>
                      ) : null}
                      <span className={cn('flex flex-wrap gap-x-2 text-muted-foreground', cell?.solved && 'mt-0.5')}>
                        {cell && cell.wrongAttempts > 0 && <span>{t.wrong(cell.wrongAttempts)}</span>}
                        {cell && cell.hintsUsed > 0 && (
                          <span className="flex items-center gap-0.5">
                            <Sparkles className="size-3" />
                            {t.hintsUsed(cell.hintsUsed)}
                          </span>
                        )}
                      </span>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-8 mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">{t.leaderboard}</h2>
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className={cn('size-2 rounded-full', live ? 'bg-emerald-500' : 'animate-pulse bg-amber-500')} />
          {live ? vi.workspace.live : vi.workspace.offline}
        </span>
      </div>
      <p className="mb-3 text-xs text-muted-foreground">{t.leaderboardHint}</p>
      {board.data ? <LeaderboardTable board={board.data} /> : <div className="h-32 animate-pulse rounded-xl border bg-muted/40" />}
    </section>
  );
}
