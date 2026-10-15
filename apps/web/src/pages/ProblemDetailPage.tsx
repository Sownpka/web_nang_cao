import { ArrowLeft, Check, Clock, Copy, Cpu, Loader2, Pencil, Play, RotateCcw, Send, Sparkles } from 'lucide-react';
import { lazy, Suspense, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { LANGUAGE_LABELS, type ProblemDetail, type SampleTest } from '@judgehint/shared';
import { DifficultyBadge } from '@/components/DifficultyBadge';
import { Markdown } from '@/components/Markdown';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { useProblem } from '@/features/problems/api';
import { useCodeDraft } from '@/features/problems/codeDraft';
import { vi } from '@/i18n/vi';
import { ApiError } from '@/lib/api';

const CodeEditor = lazy(() => import('@/components/CodeEditor'));

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      {copied ? vi.problem.copied : vi.problem.copy}
    </button>
  );
}

function SampleBlock({ label, text }: { label: string; text: string }) {
  return (
    <div className="min-w-0 flex-1">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <CopyButton text={text} />
      </div>
      <pre className="max-h-48 overflow-auto rounded-md bg-muted px-3 py-2 font-mono text-xs leading-relaxed">{text}</pre>
    </div>
  );
}

function Samples({ samples }: { samples: SampleTest[] }) {
  if (!samples.length) return null;
  return (
    <div className="mt-8 space-y-4">
      <h2 className="text-sm font-semibold">{vi.problem.samples}</h2>
      {samples.map((s, i) => (
        <div key={s.order} className="rounded-lg border p-3">
          <p className="mb-2 text-xs font-medium">{vi.problem.sample(i + 1)}</p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <SampleBlock label={vi.problem.input} text={s.input} />
            <SampleBlock label={vi.problem.output} text={s.expected} />
          </div>
        </div>
      ))}
    </div>
  );
}

function Statement({ problem }: { problem: ProblemDetail }) {
  return (
    <div className="px-4 py-6 lg:px-6">
      <Link to="/problems" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" />
        {vi.problems.title}
      </Link>
      <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{problem.title}</h1>
        {problem.canEdit && (
          <Button variant="outline" size="sm" asChild>
            <Link to={`/teacher/problems/${problem.id}`}>
              <Pencil />
              {vi.problem.edit}
            </Link>
          </Button>
        )}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
        <DifficultyBadge difficulty={problem.difficulty} />
        <span className="flex items-center gap-1">
          <Clock className="size-3.5" />
          {vi.problem.timeLimit}: {problem.timeLimitMs} ms
        </span>
        <span className="flex items-center gap-1">
          <Cpu className="size-3.5" />
          {vi.problem.memoryLimit}: {problem.memoryLimitMb} MB
        </span>
        <span>{vi.problem.tests(problem.totalTests)}</span>
      </div>

      <Markdown className="mt-6">{problem.statementMd}</Markdown>
      <Samples samples={problem.samples} />
    </div>
  );
}

function Workspace({ problem }: { problem: ProblemDetail }) {
  const { language, setLanguage, code, setCode, reset } = useCodeDraft(problem.id, problem.allowedLanguages);

  return (
    <div className="flex flex-col border-t lg:h-full lg:min-h-0 lg:border-t-0 lg:border-l">
      <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
        <Select
          value={language}
          onChange={(e) => setLanguage(e.target.value as typeof language)}
          aria-label={vi.problem.language}
          className="w-52"
        >
          {problem.allowedLanguages.map((l) => (
            <option key={l} value={l}>
              {LANGUAGE_LABELS[l]}
            </option>
          ))}
        </Select>
        <Button
          variant="ghost"
          size="icon"
          title={vi.problem.resetCode}
          aria-label={vi.problem.resetCode}
          onClick={() => window.confirm(vi.problem.resetConfirm) && reset()}
        >
          <RotateCcw />
        </Button>
        <div className="ml-auto flex gap-2">
          <Button variant="secondary" size="sm" disabled title={vi.problem.judgeComingSoon}>
            <Play />
            {vi.problem.run}
          </Button>
          <Button size="sm" disabled title={vi.problem.judgeComingSoon}>
            <Send />
            {vi.problem.submit}
          </Button>
        </div>
      </div>

      {/* Monaco needs a definite height: fixed on mobile, fills the column on desktop. */}
      <div className="relative h-[420px] lg:h-auto lg:min-h-0 lg:flex-1">
        <div className="absolute inset-0">
          <Suspense
            fallback={
              <div className="grid h-full place-items-center">
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
              </div>
            }
          >
            <CodeEditor language={language} value={code} onChange={setCode} />
          </Suspense>
        </div>
      </div>

      <div className="border-t px-4 py-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">{vi.problem.result}</h2>
          {!problem.aiHintsEnabled && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Sparkles className="size-3.5" />
              {vi.problem.aiHintsOff}
            </span>
          )}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{vi.problem.resultEmpty}</p>
        <p className="mt-1 text-xs text-muted-foreground">{vi.problem.judgeComingSoon}</p>
      </div>
    </div>
  );
}

export function ProblemDetailPage() {
  const { slug = '' } = useParams();
  const { data: problem, isLoading, error } = useProblem(slug);

  if (isLoading) {
    return (
      <div className="grid place-items-center py-24">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (error || !problem) {
    const message = error instanceof ApiError ? error.message : vi.problem.notFound;
    return (
      <section className="mx-auto max-w-md px-4 py-24 text-center">
        <p className="text-lg font-semibold">{message}</p>
        <Button variant="outline" className="mt-4" asChild>
          <Link to="/problems">{vi.problems.title}</Link>
        </Button>
      </section>
    );
  }

  return (
    <div className="lg:grid lg:h-[calc(100dvh-3.5rem-1px)] lg:grid-cols-2">
      <div className="lg:overflow-y-auto">
        <Statement problem={problem} />
      </div>
      {/* Keyed by problem so the draft state resets when switching problems. */}
      <Workspace key={problem.id} problem={problem} />
    </div>
  );
}
