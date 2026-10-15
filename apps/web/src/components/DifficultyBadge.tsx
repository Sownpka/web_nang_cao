import { DIFFICULTY_LABELS, type Difficulty } from '@judgehint/shared';
import { cn } from '@/lib/utils';

const styles: Record<Difficulty, string> = {
  EASY: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  MEDIUM: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  HARD: 'bg-rose-500/15 text-rose-600 dark:text-rose-400',
};

export function DifficultyBadge({ difficulty, className }: { difficulty: Difficulty; className?: string }) {
  return (
    <span className={cn('inline-flex rounded-md px-2 py-0.5 text-xs font-medium', styles[difficulty], className)}>
      {DIFFICULTY_LABELS[difficulty]}
    </span>
  );
}
