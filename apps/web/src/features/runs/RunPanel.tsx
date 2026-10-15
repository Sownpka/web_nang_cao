import { ChevronDown, Clock } from 'lucide-react';
import { useState } from 'react';
import type { RunCaseResult, RunResult } from '@judgehint/shared';
import { VerdictBadge } from '@/components/VerdictBadge';
import { vi } from '@/i18n/vi';
import { cn } from '@/lib/utils';

const t = vi.run;

function Text({ label, text, tone }: { label: string; text: string; tone?: 'bad' | 'error' }) {
  return (
    <div className="min-w-0 flex-1">
      <p className="mb-1 text-xs font-medium text-muted-foreground">{label}</p>
      <pre
        className={cn(
          'max-h-36 overflow-auto rounded-md bg-muted px-3 py-2 font-mono text-xs leading-relaxed whitespace-pre-wrap break-all',
          tone === 'bad' && 'ring-1 ring-destructive/40',
          tone === 'error' && 'text-destructive',
        )}
      >
        {text === '' ? <span className="text-muted-foreground italic">{vi.submission.emptyOutput}</span> : text}
      </pre>
    </div>
  );
}

function CaseRow({ c }: { c: RunCaseResult }) {
  const ok = c.verdict === 'ACCEPTED';
  const [open, setOpen] = useState(!ok);
  const title = c.kind === 'custom' ? t.custom : t.sample(c.number);

  return (
    <li className="rounded-lg border">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm"
        aria-expanded={open}
      >
        <span className="font-medium">{title}</span>
        {c.kind === 'custom' && ok ? (
          <span className="rounded-md bg-secondary px-2 py-0.5 text-xs font-semibold">{t.ran}</span>
        ) : (
          <VerdictBadge verdict={c.verdict} />
        )}
        {c.runtimeMs !== null && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="size-3" />
            {c.runtimeMs} ms
          </span>
        )}
        <ChevronDown className={cn('ml-auto size-4 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="space-y-3 border-t px-3 py-3">
          <div className="flex flex-col gap-3 sm:flex-row">
            <Text label={vi.submission.input} text={c.input} />
            {c.expected !== null && <Text label={vi.submission.expected} text={c.expected} />}
            <Text label={vi.submission.actual} text={c.actual} tone={c.verdict === 'WRONG_ANSWER' ? 'bad' : undefined} />
          </div>
          {c.stderr && <Text label={vi.submission.stderr} text={c.stderr} tone="error" />}
        </div>
      )}
    </li>
  );
}

export function RunPanel({ result, running }: { result: RunResult | undefined; running: boolean }) {
  if (!result) return <p className="text-sm text-muted-foreground">{t.empty}</p>;

  const samples = result.cases.filter((c) => c.kind === 'sample');
  const passed = samples.filter((c) => c.verdict === 'ACCEPTED').length;

  return (
    <div className="space-y-3" aria-live="polite">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        {running ? (
          <VerdictBadge verdict={result.status === 'PENDING' ? 'PENDING' : 'RUNNING'} />
        ) : result.status === 'ERROR' ? (
          <VerdictBadge verdict="SYSTEM_ERROR" />
        ) : null}
        <span className="text-muted-foreground">
          {running ? t.progress(result.cases.length, result.total) : samples.length > 0 ? t.summary(passed, samples.length) : null}
        </span>
        <span className="text-xs text-muted-foreground sm:ml-auto">{t.notScored}</span>
      </div>
      {result.error && <p className="text-sm text-destructive">{result.error}</p>}
      <ul className="space-y-2">
        {result.cases.map((c) => (
          <CaseRow key={`${c.kind}-${c.number}`} c={c} />
        ))}
      </ul>
    </div>
  );
}
