import { Loader2 } from 'lucide-react';
import { VERDICT_LABELS, type Verdict } from '@judgehint/shared';
import { cn } from '@/lib/utils';

const styles: Record<Verdict, string> = {
  PENDING: 'bg-secondary text-secondary-foreground',
  RUNNING: 'bg-sky-500/15 text-sky-600 dark:text-sky-400',
  ACCEPTED: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  WRONG_ANSWER: 'bg-rose-500/15 text-rose-600 dark:text-rose-400',
  TIME_LIMIT_EXCEEDED: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  MEMORY_LIMIT_EXCEEDED: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  RUNTIME_ERROR: 'bg-orange-500/15 text-orange-600 dark:text-orange-400',
  COMPILE_ERROR: 'bg-orange-500/15 text-orange-600 dark:text-orange-400',
  SYSTEM_ERROR: 'bg-zinc-500/15 text-zinc-600 dark:text-zinc-400',
};

export function VerdictBadge({ verdict, className }: { verdict: Verdict; className?: string }) {
  const busy = verdict === 'PENDING' || verdict === 'RUNNING';
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-semibold', styles[verdict], className)}>
      {busy && <Loader2 className="size-3 animate-spin" />}
      {VERDICT_LABELS[verdict]}
    </span>
  );
}
