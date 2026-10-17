import { ArrowLeft, Download, Loader2, RefreshCw, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { FINAL_VERDICTS, VERDICT_LABELS, type AssignmentReport, type ReportStudentRow } from '@judgehint/shared';
import { ColumnChart } from '@/components/charts/ColumnChart';
import { AssignmentStatusBadge } from '@/components/Countdown';
import { DifficultyBadge } from '@/components/DifficultyBadge';
import { Meter, StatTile } from '@/components/StatTile';
import { Button } from '@/components/ui/button';
import { downloadAssignmentCsv, useAssignmentReport } from '@/features/reports/api';
import { vi } from '@/i18n/vi';
import { ApiError } from '@/lib/api';
import { formatDateTime, formatRelative } from '@/lib/time';
import { cn } from '@/lib/utils';

const t = vi.report;
const letter = (i: number) => String.fromCharCode(65 + i);
const fmt = (n: number | null, suffix = '') => (n === null ? '—' : `${n}${suffix}`);

function Distribution({ report }: { report: AssignmentReport }) {
  const last = report.scoreBuckets.length - 1;
  return (
    <ColumnChart
      ariaLabel={t.distribution}
      data={report.scoreBuckets.map((b, i) => ({
        key: String(i),
        label: `${i * 10}%`,
        value: b.count,
        tooltip: (
          <>
            <p className="font-medium">{t.studentsCount(b.count)}</p>
            <p className="text-muted-foreground">{t.bucketTip(b.from, b.to, i === last)}</p>
          </>
        ),
      }))}
    />
  );
}

function ProblemTable({ report }: { report: AssignmentReport }) {
  const n = report.summary.studentCount;
  return (
    <div className="overflow-x-auto rounded-xl border">
      <table className="w-full min-w-[860px] text-sm">
        <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
          <tr>
            <th className="w-10 px-4 py-2.5 font-medium">#</th>
            <th className="px-4 py-2.5 font-medium">{vi.assignment.colProblem}</th>
            <th className="w-40 px-4 py-2.5 font-medium">{t.colSolved}</th>
            <th className="px-3 py-2.5 text-right font-medium">{t.colAttempted}</th>
            <th className="px-3 py-2.5 text-right font-medium">{t.colSubs}</th>
            <th className="px-3 py-2.5 text-right font-medium">{t.colAvgWrong}</th>
            <th className="px-3 py-2.5 text-right font-medium">{t.colAvgTime}</th>
            <th className="px-3 py-2.5 text-right font-medium">{t.colHints}</th>
            <th className="px-4 py-2.5 font-medium">{t.colVerdicts}</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {report.problems.map((p, i) => (
            <tr key={p.id}>
              <td className="px-4 py-3 font-mono text-muted-foreground">{letter(i)}</td>
              <td className="px-4 py-3">
                <Link to={`/problems/${p.slug}`} className="font-medium hover:text-primary">
                  {p.title}
                </Link>
                <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                  <DifficultyBadge difficulty={p.difficulty} />
                  {p.points} {vi.assignment.colPoints.toLowerCase()}
                </div>
              </td>
              <td className="px-4 py-3">
                <div className="flex items-baseline justify-between text-xs tabular-nums">
                  <span className="font-medium">
                    {p.solvedCount}/{n}
                  </span>
                  <span className="text-muted-foreground">{n ? Math.round((p.solvedCount / n) * 100) : 0}%</span>
                </div>
                <Meter value={n ? p.solvedCount / n : 0} className="mt-1" label={t.colSolved} />
              </td>
              <td className="px-3 py-3 text-right tabular-nums">{p.attemptedCount}</td>
              <td className="px-3 py-3 text-right tabular-nums">{p.submissionCount}</td>
              <td className="px-3 py-3 text-right tabular-nums">{fmt(p.avgWrongBeforeAc)}</td>
              <td className="px-3 py-3 text-right tabular-nums">{p.avgAcceptedAtMin === null ? '—' : t.minutes(p.avgAcceptedAtMin)}</td>
              <td className="px-3 py-3 text-right tabular-nums">{p.hintsOpened}</td>
              <td className="px-4 py-3 text-xs text-muted-foreground">
                {FINAL_VERDICTS.filter((v) => p.verdicts[v]).map((v) => (
                  <span key={v} className="mr-2 inline-block whitespace-nowrap">
                    {VERDICT_LABELS[v]} <span className="font-medium text-foreground tabular-nums">{p.verdicts[v]}</span>
                  </span>
                ))}
                {p.submissionCount === 0 && '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StudentTable({ report }: { report: AssignmentReport }) {
  const [onlyInactive, setOnlyInactive] = useState(false);
  const rows: ReportStudentRow[] = onlyInactive ? report.students.filter((s) => s.submissionCount === 0) : report.students;
  const inactive = report.students.length - report.summary.participantCount;

  return (
    <>
      <div className="mt-8 mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">{t.byStudent}</h2>
        {inactive > 0 && (
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input type="checkbox" className="accent-primary" checked={onlyInactive} onChange={(e) => setOnlyInactive(e.target.checked)} />
            {t.onlyInactive} ({inactive})
          </label>
        )}
      </div>
      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
            <tr>
              <th className="w-12 px-4 py-2.5 font-medium">{vi.assignment.colRank}</th>
              <th className="px-4 py-2.5 font-medium">{vi.classes.colStudent}</th>
              {report.problems.map((p, i) => (
                <th key={p.id} className="w-16 px-2 py-2.5 text-center font-mono font-medium" title={p.title}>
                  {letter(i)}
                </th>
              ))}
              <th className="w-20 px-3 py-2.5 text-right font-medium">{vi.assignment.colTotal}</th>
              <th className="w-20 px-3 py-2.5 text-right font-medium">{t.colSubs}</th>
              <th className="w-16 px-3 py-2.5 text-right font-medium">{t.colHints}</th>
              <th className="w-36 px-4 py-2.5 font-medium">{t.colLast}</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.length === 0 && (
              <tr>
                <td colSpan={report.problems.length + 6} className="px-4 py-6 text-center text-muted-foreground">
                  {t.empty}
                </td>
              </tr>
            )}
            {rows.map((s) => (
              <tr key={s.userId} className={cn(s.submissionCount === 0 && 'bg-amber-500/5')}>
                <td className="px-4 py-2.5 tabular-nums text-muted-foreground">{s.rank}</td>
                <td className="px-4 py-2.5">
                  <p className="font-medium">{s.fullName}</p>
                  <p className="text-xs text-muted-foreground">{[s.studentCode, s.email].filter(Boolean).join(' · ')}</p>
                </td>
                {report.problems.map((p) => {
                  const c = s.cells.find((x) => x.problemId === p.id);
                  return (
                    <td key={p.id} className="px-2 py-2.5 text-center text-xs tabular-nums">
                      {c?.solved ? (
                        <span className="font-semibold text-emerald-600 dark:text-emerald-400" title={vi.assignment.wrong(c.wrongAttempts)}>
                          {c.score}
                        </span>
                      ) : c && c.wrongAttempts > 0 ? (
                        <span className="text-rose-600 dark:text-rose-400">−{c.wrongAttempts}</span>
                      ) : (
                        <span className="text-muted-foreground">·</span>
                      )}
                    </td>
                  );
                })}
                <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{s.totalScore}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{s.submissionCount}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {s.hintsOpened > 0 ? (
                    <span className="inline-flex items-center gap-0.5">
                      <Sparkles className="size-3 text-muted-foreground" />
                      {s.hintsOpened}
                    </span>
                  ) : (
                    0
                  )}
                </td>
                <td className="px-4 py-2.5 text-xs">
                  {s.lastSubmissionAt ? (
                    <span title={formatDateTime(s.lastSubmissionAt)}>{formatRelative(s.lastSubmissionAt)}</span>
                  ) : (
                    <span className="font-medium text-amber-600 dark:text-amber-400">{t.noSubmission}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export function AssignmentReportPage() {
  const { id = '' } = useParams();
  const { data: report, isLoading, error, refetch, isFetching } = useAssignmentReport(id);
  const [exporting, setExporting] = useState(false);

  const exportCsv = async () => {
    setExporting(true);
    try {
      await downloadAssignmentCsv(id);
      toast.success(t.exported);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : String(err));
    } finally {
      setExporting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="grid place-items-center py-24">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (error || !report) {
    return (
      <section className="mx-auto max-w-md px-4 py-24 text-center">
        <p className="text-lg font-semibold">{error instanceof ApiError ? error.message : vi.classes.notFound}</p>
        <Button variant="outline" className="mt-4" asChild>
          <Link to="/classrooms">{vi.classes.title}</Link>
        </Button>
      </section>
    );
  }

  const { assignment: a, summary: s } = report;
  return (
    <section className="mx-auto max-w-6xl px-4 py-8">
      <Link to={`/assignments/${a.id}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" />
        {t.back}
      </Link>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{t.title}</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{a.title}</h1>
            <AssignmentStatusBadge startsAt={a.startsAt} endsAt={a.endsAt} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {a.classroom.name} · {vi.classes.window(formatDateTime(a.startsAt), formatDateTime(a.endsAt))} ·{' '}
            {vi.classes.problems(a.problemCount, a.totalPoints)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void refetch()} disabled={isFetching} title={t.generatedAt(formatDateTime(report.generatedAt))}>
            <RefreshCw className={cn(isFetching && 'animate-spin')} />
            {t.refresh}
          </Button>
          <Button size="sm" onClick={exportCsv} disabled={exporting}>
            {exporting ? <Loader2 className="animate-spin" /> : <Download />}
            {t.exportCsv}
          </Button>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label={t.participants}
          value={`${s.participantCount}/${s.studentCount}`}
          sub={t.participantsSub(s.participantCount, s.studentCount)}
        />
        <StatTile label={t.fullSolve} value={s.fullSolveCount} sub={t.fullSolveSub(s.fullSolveCount)} />
        <StatTile label={t.average} value={`${s.averageScore}/${a.totalPoints}`} sub={t.median(s.medianScore)} />
        <StatTile label={t.submissions} value={s.submissionCount} sub={t.hintsSub(s.hintsOpened)} />
      </div>

      <div className="mt-8 rounded-xl border bg-card p-4">
        <h2 className="text-sm font-semibold">{t.distribution}</h2>
        <p className="mb-3 text-xs text-muted-foreground">{t.distributionHint}</p>
        <Distribution report={report} />
      </div>

      <h2 className="mt-8 mb-3 text-sm font-semibold">{t.byProblem}</h2>
      <ProblemTable report={report} />

      <StudentTable report={report} />
      <p className="mt-3 text-xs text-muted-foreground">{t.generatedAt(formatDateTime(report.generatedAt))}</p>
    </section>
  );
}
