import { Clock, Cpu } from 'lucide-react';
import type { SubmissionDetail } from '@judgehint/shared';
import { VerdictBadge } from '@/components/VerdictBadge';
import { vi } from '@/i18n/vi';
import { cn } from '@/lib/utils';
import { isFinal } from './api';

const t = vi.submission;

function Block({ label, text, tone }: { label: string; text: string; tone?: 'bad' }) {
  return (
    <div className="min-w-0 flex-1">
      <p className="mb-1 text-xs font-medium text-muted-foreground">{label}</p>
      <pre
        className={cn(
          'max-h-40 overflow-auto rounded-md bg-muted px-3 py-2 font-mono text-xs leading-relaxed whitespace-pre-wrap break-all',
          tone === 'bad' && 'ring-1 ring-destructive/40',
        )}
      >
        {text === '' ? <span className="text-muted-foreground italic">{t.emptyOutput}</span> : text}
      </pre>
    </div>
  );
}

export function ResultPanel({ submission }: { submission: SubmissionDetail }) {
  const done = isFinal(submission);
  const progress = submission.totalCount ? (submission.passedCount / submission.totalCount) * 100 : 0;
  const failed = submission.failedTest;

  return (
    <div className="space-y-3" aria-live="polite">
      <div className="flex flex-wrap items-center gap-3">
        <VerdictBadge verdict={submission.verdict} className="px-2.5 py-1 text-sm" />
        {done && submission.totalCount > 0 && (
          <span className="text-sm text-muted-foreground">{t.passed(submission.passedCount, submission.totalCount)}</span>
        )}
        {done && submission.runtimeMs !== null && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="size-3.5" />
            {submission.runtimeMs} ms
          </span>
        )}
        {done && submission.memoryKb !== null && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Cpu className="size-3.5" />
            {(submission.memoryKb / 1024).toFixed(1)} MB
          </span>
        )}
      </div>

      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            'h-full rounded-full transition-all duration-500',
            !done && 'w-1/3 animate-pulse bg-sky-500',
            done && (submission.verdict === 'ACCEPTED' ? 'bg-emerald-500' : 'bg-rose-500'),
          )}
          style={done ? { width: `${Math.max(progress, submission.verdict === 'ACCEPTED' ? 100 : 4)}%` } : undefined}
        />
      </div>

      {!done && <p className="text-sm text-muted-foreground">{submission.verdict === 'PENDING' ? t.queued : t.judging}</p>}

      {done && failed && (
        <div className="space-y-2">
          <p className="text-sm font-medium">{failed.isHidden ? t.failedHidden(failed.number) : t.failedPublic(failed.number)}</p>
          {failed.input !== undefined && (
            <div className="flex flex-col gap-3 sm:flex-row">
              <Block label={t.input} text={failed.input} />
              <Block label={t.expected} text={failed.expected ?? ''} />
              {submission.verdict === 'WRONG_ANSWER' && <Block label={t.actual} text={failed.actual ?? ''} tone="bad" />}
            </div>
          )}
        </div>
      )}

      {done && submission.stderr && (
        <div>
          <p className="mb-1 text-xs font-medium text-muted-foreground">{t.stderr}</p>
          <pre className="max-h-48 overflow-auto rounded-md bg-muted px-3 py-2 font-mono text-xs leading-relaxed whitespace-pre-wrap text-destructive">
            {submission.stderr}
          </pre>
        </div>
      )}

      {done && submission.verdict === 'ACCEPTED' && <p className="text-sm text-emerald-600 dark:text-emerald-400">{t.acceptedNote}</p>}
    </div>
  );
}
