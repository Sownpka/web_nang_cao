import { ArrowLeft, Check, Clock, Copy, Cpu, GraduationCap, Loader2, Pencil, Play, RotateCcw, Send, Sparkles } from 'lucide-react';
import { lazy, Suspense, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { assignmentStatus, LANGUAGE_LABELS, type AssignmentDetail, type ProblemDetail, type SampleTest } from '@judgehint/shared';
import { Countdown } from '@/components/Countdown';
import { DifficultyBadge } from '@/components/DifficultyBadge';
import { Markdown } from '@/components/Markdown';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useAssignment } from '@/features/classrooms/api';
import { useProblem } from '@/features/problems/api';
import { HintPanel } from '@/features/hints/HintPanel';
import { useCodeDraft } from '@/features/problems/codeDraft';
import { useSocketConnected } from '@/features/realtime/SocketProvider';
import { useSampleRun } from '@/features/runs/api';
import { RunPanel } from '@/features/runs/RunPanel';
import { isFinal, useSubmission, useSubmitCode } from '@/features/submissions/api';
import { ProblemSubmissionList } from '@/features/submissions/ProblemSubmissionList';
import { ResultPanel } from '@/features/submissions/ResultPanel';
import { vi } from '@/i18n/vi';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';

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

type PanelTab = 'run' | 'result' | 'history';

function Workspace({ problem, assignmentId }: { problem: ProblemDetail; assignmentId?: string }) {
  const { language, setLanguage, code, setCode, reset } = useCodeDraft(problem.id, problem.allowedLanguages);
  const submit = useSubmitCode();
  const [submissionId, setSubmissionId] = useState<string>();
  const submission = useSubmission(submissionId);
  const sampleRun = useSampleRun(problem.id);
  const live = useSocketConnected();
  const [tab, setTab] = useState<PanelTab>('run');
  const [useCustom, setUseCustom] = useState(false);
  const [customInput, setCustomInput] = useState('');
  const judging = submit.isPending || (!!submissionId && !isFinal(submission.data));

  const fail = (err: unknown) => toast.error(err instanceof ApiError ? err.message : String(err));

  const onSubmit = async () => {
    setTab('result');
    try {
      const res = await submit.mutateAsync({ problemId: problem.id, language, code, assignmentId });
      setSubmissionId(res.submissionId);
    } catch (err) {
      fail(err);
    }
  };

  const onRun = async () => {
    setTab('run');
    try {
      await sampleRun.start.mutateAsync({ language, code, customInput: useCustom ? customInput : undefined });
    } catch (err) {
      fail(err);
    }
  };

  const tabs: { key: PanelTab; label: string }[] = [
    { key: 'run', label: vi.workspace.tabRun },
    { key: 'result', label: vi.workspace.tabResult },
    { key: 'history', label: vi.workspace.tabHistory },
  ];

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
          <Button variant="secondary" size="sm" onClick={onRun} disabled={sampleRun.running || !code.trim()}>
            {sampleRun.running ? <Loader2 className="animate-spin" /> : <Play />}
            {vi.problem.run}
          </Button>
          <Button size="sm" onClick={onSubmit} disabled={judging || !code.trim()}>
            {judging ? <Loader2 className="animate-spin" /> : <Send />}
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

      <div className="flex flex-col border-t lg:h-[45%] lg:min-h-0">
        <div className="flex items-center gap-1 border-b px-2" role="tablist">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                '-mb-px border-b-2 px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground',
                tab === t.key ? 'border-primary text-foreground' : 'border-transparent',
              )}
            >
              {t.label}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-3 pr-2 text-xs text-muted-foreground">
            {!problem.aiHintsEnabled && (
              <span className="hidden items-center gap-1 sm:flex">
                <Sparkles className="size-3.5" />
                {vi.problem.aiHintsOff}
              </span>
            )}
            <span className="flex items-center gap-1.5" data-live={live} title={live ? vi.workspace.liveHint : vi.workspace.offlineHint}>
              <span className={cn('size-2 rounded-full', live ? 'bg-emerald-500' : 'animate-pulse bg-amber-500')} />
              {live ? vi.workspace.live : vi.workspace.offline}
            </span>
          </div>
        </div>

        <div className="px-4 py-3 lg:flex-1 lg:overflow-y-auto" role="tabpanel">
          {tab === 'run' && (
            <div className="space-y-3">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" className="size-4" checked={useCustom} onChange={(e) => setUseCustom(e.target.checked)} />
                {vi.run.useCustom}
              </label>
              {useCustom && (
                <Textarea
                  value={customInput}
                  onChange={(e) => setCustomInput(e.target.value)}
                  placeholder={vi.run.customPlaceholder}
                  className="h-24 font-mono text-xs"
                  spellCheck={false}
                />
              )}
              <RunPanel result={sampleRun.result} running={sampleRun.running} />
            </div>
          )}
          {tab === 'result' &&
            (submission.data ? (
              <div className="space-y-4">
                <ResultPanel submission={submission.data} />
                {isFinal(submission.data) && submission.data.verdict !== 'ACCEPTED' && (
                  <div className="border-t pt-4">
                    <HintPanel submissionId={submission.data.id} compact />
                  </div>
                )}
              </div>
            ) : submission.isError ? (
              <p className="text-sm text-destructive">{vi.submission.loadError}</p>
            ) : (
              <p className="text-sm text-muted-foreground">{submissionId ? vi.submission.queued : vi.problem.resultEmpty}</p>
            ))}
          {tab === 'history' && <ProblemSubmissionList problemId={problem.id} />}
        </div>
      </div>
    </div>
  );
}

/** Shown when the problem is opened from a class assignment: submissions then count for it. */
function AssignmentBanner({ assignment }: { assignment: AssignmentDetail }) {
  const status = assignmentStatus(assignment.startsAt, assignment.endsAt);
  return (
    <div className="border-b bg-primary/5 px-4 py-2.5 text-sm lg:px-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link to={`/assignments/${assignment.id}`} className="flex items-center gap-1.5 font-medium hover:text-primary">
          <GraduationCap className="size-4 text-primary" />
          {vi.assignment.banner(assignment.title)}
        </Link>
        <Countdown startsAt={assignment.startsAt} endsAt={assignment.endsAt} className="text-xs text-muted-foreground" />
      </div>
      {status !== 'ACTIVE' && (
        <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
          {status === 'ENDED' ? vi.assignment.bannerEnded : vi.assignment.bannerUpcoming}
        </p>
      )}
    </div>
  );
}

export function ProblemDetailPage() {
  const { slug = '' } = useParams();
  const [params] = useSearchParams();
  const { data: problem, isLoading, error } = useProblem(slug);
  const { data: assignment } = useAssignment(params.get('assignment') ?? undefined);
  // Only attach the assignment when this problem really belongs to it.
  const inAssignment = assignment && problem && assignment.problems.some((p) => p.id === problem.id) ? assignment : undefined;

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
        {inAssignment && <AssignmentBanner assignment={inAssignment} />}
        <Statement problem={problem} />
      </div>
      {/* Keyed by problem so the draft state resets when switching problems. */}
      <Workspace key={problem.id} problem={problem} assignmentId={inAssignment?.id} />
    </div>
  );
}
