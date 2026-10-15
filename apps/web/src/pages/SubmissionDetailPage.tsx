import { ArrowLeft, Check, Copy, ExternalLink, Loader2 } from 'lucide-react';
import { lazy, Suspense, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { LANGUAGE_LABELS } from '@judgehint/shared';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/features/auth/AuthProvider';
import { HintPanel } from '@/features/hints/HintPanel';
import { isFinal, useSubmission } from '@/features/submissions/api';
import { ResultPanel } from '@/features/submissions/ResultPanel';
import { vi } from '@/i18n/vi';
import { ApiError } from '@/lib/api';
import { formatDateTime } from '@/lib/time';

const CodeEditor = lazy(() => import('@/components/CodeEditor'));
const t = vi.submissionDetail;

export function SubmissionDetailPage() {
  const { id = '' } = useParams();
  const { user } = useAuth();
  const { data: s, isLoading, error } = useSubmission(id);
  const [copied, setCopied] = useState(false);

  if (isLoading) {
    return (
      <div className="grid place-items-center py-24">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (error || !s) {
    return (
      <section className="mx-auto max-w-md px-4 py-24 text-center">
        <p className="text-lg font-semibold">{error instanceof ApiError ? error.message : t.notFound}</p>
        <Button variant="outline" className="mt-4" asChild>
          <Link to="/submissions">{t.back}</Link>
        </Button>
      </section>
    );
  }

  const isOwn = s.user.id === user?.id;

  return (
    <section className="mx-auto max-w-6xl px-4 py-8">
      <Link to="/submissions" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" />
        {t.back}
      </Link>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{s.problem.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t.submittedAt} {formatDateTime(s.createdAt)} · {LANGUAGE_LABELS[s.language]}
            {!isOwn && (
              <>
                {' · '}
                {t.by}: {s.user.fullName}
                {s.user.studentCode && ` (${s.user.studentCode})`}
              </>
            )}
          </p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link to={`/problems/${s.problem.slug}`}>
            <ExternalLink />
            {t.openProblem}
          </Link>
        </Button>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        <div className="space-y-6">
          <div className="rounded-xl border p-4">
            <ResultPanel submission={s} />
          </div>
          {isFinal(s) && (
            <div className="rounded-xl border p-4">
              <HintPanel submissionId={s.id} />
            </div>
          )}
        </div>

        <div className="overflow-hidden rounded-xl border">
          <div className="flex items-center justify-between border-b px-4 py-2">
            <h2 className="text-sm font-semibold">{t.code}</h2>
            <button
              type="button"
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              onClick={async () => {
                await navigator.clipboard.writeText(s.code);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
            >
              {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
              {copied ? vi.problem.copied : t.copyCode}
            </button>
          </div>
          <div className="relative h-[480px]">
            <div className="absolute inset-0">
              <Suspense fallback={<div className="h-full animate-pulse bg-muted/40" />}>
                <CodeEditor language={s.language} value={s.code} onChange={() => {}} readOnly />
              </Suspense>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
