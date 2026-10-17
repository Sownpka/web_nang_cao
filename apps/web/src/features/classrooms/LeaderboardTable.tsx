import { Sparkles, Trophy } from 'lucide-react';
import { useLayoutEffect, useRef } from 'react';
import type { Leaderboard, LeaderboardCell } from '@judgehint/shared';
import { useAuth } from '@/features/auth/AuthProvider';
import { vi } from '@/i18n/vi';
import { cn } from '@/lib/utils';

const t = vi.assignment;

/**
 * FLIP: remember each row's position, and after the next render slide moved rows from their old
 * place to the new one. Rows that climbed get a short highlight.
 */
function useRankAnimation(board: Leaderboard | undefined) {
  const rowRefs = useRef(new Map<string, HTMLTableRowElement>());
  const prevTop = useRef(new Map<string, number>());
  const prevRank = useRef(new Map<string, number>());

  useLayoutEffect(() => {
    if (!board) return;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    for (const row of board.rows) {
      const el = rowRefs.current.get(row.userId);
      if (!el) continue;
      const top = el.offsetTop; // relative to the table, so page scrolling does not count as movement
      const before = prevTop.current.get(row.userId);
      const oldRank = prevRank.current.get(row.userId);
      if (before !== undefined && before !== top && !reduceMotion) {
        el.animate([{ transform: `translateY(${before - top}px)` }, { transform: 'translateY(0)' }], {
          duration: 600,
          easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
        });
      }
      if (oldRank !== undefined && row.rank < oldRank) {
        el.animate(
          [{ backgroundColor: 'color-mix(in oklch, var(--primary) 30%, transparent)' }, { backgroundColor: 'transparent' }],
          { duration: 1800, easing: 'ease-out' },
        );
      }
      prevTop.current.set(row.userId, top);
      prevRank.current.set(row.userId, row.rank);
    }
  }, [board]);

  return (userId: string) => (el: HTMLTableRowElement | null) => {
    if (el) rowRefs.current.set(userId, el);
    else rowRefs.current.delete(userId);
  };
}

function Cell({ cell, points }: { cell: LeaderboardCell; points: number }) {
  if (cell.solved) {
    return (
      <div className="rounded-md bg-emerald-500/15 px-2 py-1 text-center text-emerald-700 dark:text-emerald-300">
        <div className="font-semibold tabular-nums">{cell.score}</div>
        <div className="text-[11px] tabular-nums opacity-80">
          {t.minutes(cell.acceptedAtMin ?? 0)}
          {cell.wrongAttempts > 0 && ` · −${cell.wrongAttempts}`}
          {cell.hintsUsed > 0 && (
            <span title={t.hintsUsed(cell.hintsUsed)}>
              {' '}
              <Sparkles className="inline size-3 align-[-2px]" />
              {cell.hintsUsed}
            </span>
          )}
        </div>
        {cell.score < points && <span className="sr-only">/{points}</span>}
      </div>
    );
  }
  if (cell.wrongAttempts > 0) {
    return (
      <div className="rounded-md bg-rose-500/10 px-2 py-1 text-center text-xs text-rose-600 tabular-nums dark:text-rose-400" title={t.wrong(cell.wrongAttempts)}>
        −{cell.wrongAttempts}
      </div>
    );
  }
  return <div className="text-center text-muted-foreground">·</div>;
}

export function LeaderboardTable({ board }: { board: Leaderboard }) {
  const { user } = useAuth();
  const rowRef = useRankAnimation(board);

  if (!board.rows.length) return <p className="text-sm text-muted-foreground">{t.noStudents}</p>;

  return (
    // overflow-y-hidden: rows sliding during the rank animation must not add a scrollbar.
    <div className="overflow-x-auto overflow-y-hidden rounded-xl border">
      <table className="w-full min-w-[560px] border-collapse text-sm">
        <thead className="bg-muted/50 text-xs text-muted-foreground">
          <tr>
            <th className="w-12 px-3 py-2.5 text-left font-medium">{t.colRank}</th>
            <th className="px-3 py-2.5 text-left font-medium">{vi.classes.colStudent}</th>
            {board.problems.map((p, i) => (
              <th key={p.id} className="w-24 px-2 py-2.5 text-center font-medium" title={p.title}>
                {String.fromCharCode(65 + i)}
                <span className="block text-[10px] font-normal">{p.points}</span>
              </th>
            ))}
            <th className="w-20 px-3 py-2.5 text-right font-medium">{t.colTotal}</th>
            <th className="w-24 px-3 py-2.5 text-right font-medium">{t.colTime}</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {board.rows.map((r) => {
            const me = r.userId === user?.id;
            return (
              <tr key={r.userId} ref={rowRef(r.userId)} className={cn('relative bg-card', me && 'bg-primary/5 font-medium')}>
                <td className="px-3 py-2 tabular-nums">
                  {r.rank <= 3 && r.totalScore > 0 ? (
                    <span className="flex items-center gap-1">
                      <Trophy className={cn('size-4', r.rank === 1 ? 'text-amber-500' : r.rank === 2 ? 'text-zinc-400' : 'text-orange-700')} />
                      {r.rank}
                    </span>
                  ) : (
                    r.rank
                  )}
                </td>
                <td className="px-3 py-2">
                  <span>{r.fullName}</span>
                  {me && <span className="ml-1.5 rounded bg-primary/15 px-1.5 text-[11px] text-primary">{t.you}</span>}
                  {r.studentCode && <span className="block text-xs text-muted-foreground">{r.studentCode}</span>}
                </td>
                {r.cells.map((c, i) => (
                  <td key={c.problemId} className="px-2 py-1.5">
                    <Cell cell={c} points={board.problems[i]!.points} />
                  </td>
                ))}
                <td className="px-3 py-2 text-right font-semibold tabular-nums">{r.totalScore}</td>
                <td className="px-3 py-2 text-right text-muted-foreground tabular-nums">{t.minutes(r.totalTimeMin)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
