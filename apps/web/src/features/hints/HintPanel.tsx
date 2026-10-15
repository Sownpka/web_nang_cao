import { Lock, Loader2, Sparkles } from 'lucide-react';
import { HINT_LEVEL_LABELS, HINT_LEVELS, HINT_PENALTY_PER_LEVEL, type HintLevel } from '@judgehint/shared';
import { Markdown } from '@/components/Markdown';
import { Button } from '@/components/ui/button';
import { vi } from '@/i18n/vi';
import { cn } from '@/lib/utils';
import { useHintState, useHintStream } from './api';

const t = vi.hints;
const penalty = Math.round(HINT_PENALTY_PER_LEVEL * 100);

function LevelHeader({ level, state }: { level: HintLevel; state: 'open' | 'next' | 'locked' | 'streaming' }) {
  const info = HINT_LEVEL_LABELS[level];
  return (
    <div className="flex items-start gap-3">
      <span
        className={cn(
          'grid size-7 shrink-0 place-items-center rounded-full text-xs font-semibold',
          state === 'open' || state === 'streaming' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
        )}
      >
        {state === 'locked' ? <Lock className="size-3.5" /> : level}
      </span>
      <div className="min-w-0">
        <p className="text-sm font-semibold">
          {t.level(level)} — {info.title}
        </p>
        <p className="text-xs text-muted-foreground">{info.description}</p>
      </div>
    </div>
  );
}

/** Three sequential AI hint levels for one submission, streamed as they are written. */
export function HintPanel({ submissionId, compact }: { submissionId: string; compact?: boolean }) {
  const { data, isLoading, isError } = useHintState(submissionId);
  const stream = useHintStream(submissionId);

  if (isLoading) return <div className="h-24 animate-pulse rounded-lg bg-muted/50" />;
  if (isError || !data) return null;

  const opened = new Map(data.hints.map((h) => [h.level, h]));
  const readOnly = data.blockedReason === 'NOT_OWNER';
  if (data.blockedReason && !readOnly && data.hints.length === 0) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Sparkles className="size-4 shrink-0" />
        {t.blocked[data.blockedReason]}
      </p>
    );
  }
  if (readOnly && data.hints.length === 0) {
    return <p className="text-sm text-muted-foreground">{t.noneForStaff}</p>;
  }

  return (
    <div className={cn('space-y-3', compact && 'text-sm')}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Sparkles className="size-4 text-primary" />
          {t.title}
        </h3>
        {!readOnly && <p className="text-xs text-muted-foreground">{t.penaltyNote(penalty)}</p>}
      </div>

      <ol className="space-y-2">
        {HINT_LEVELS.map((level) => {
          const hint = opened.get(level);
          const streaming = stream.level === level;
          const isNext = data.nextLevel === level && !stream.streaming;
          if (readOnly && !hint) return null;
          const state = hint ? 'open' : streaming ? 'streaming' : isNext ? 'next' : 'locked';

          return (
            <li key={level} className={cn('rounded-lg border p-3', state === 'locked' && 'opacity-60')}>
              <LevelHeader level={level} state={state} />

              {hint && <Markdown className="mt-2 pl-10">{hint.content}</Markdown>}

              {streaming && (
                <div className="mt-2 pl-10" aria-live="polite">
                  {stream.text ? (
                    <Markdown className="after:ml-0.5 after:inline-block after:h-4 after:w-1.5 after:animate-pulse after:bg-primary after:align-middle">
                      {stream.text}
                    </Markdown>
                  ) : !stream.error ? (
                    <p className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="size-4 animate-spin" />
                      {t.thinking}
                    </p>
                  ) : null}
                  {stream.error && (
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <p className="text-sm text-destructive">{stream.error}</p>
                      <Button size="sm" variant="outline" onClick={() => void stream.open(level)}>
                        {t.retry}
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {!hint && !streaming && !readOnly && (
                <div className="mt-2 pl-10">
                  <Button
                    size="sm"
                    variant={isNext ? 'default' : 'outline'}
                    disabled={!isNext}
                    onClick={() => void stream.open(level)}
                  >
                    {t.open(level, penalty)}
                  </Button>
                  {!isNext && data.nextLevel !== null && data.nextLevel < level && (
                    <span className="ml-2 text-xs text-muted-foreground">{t.lockedHint(data.nextLevel)}</span>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ol>
      {data.blockedReason && !readOnly && <p className="text-xs text-muted-foreground">{t.blocked[data.blockedReason]}</p>}
    </div>
  );
}
