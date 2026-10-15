import { Link } from 'react-router-dom';
import { LANGUAGE_LABELS } from '@judgehint/shared';
import { VerdictBadge } from '@/components/VerdictBadge';
import { vi } from '@/i18n/vi';
import { formatRelative } from '@/lib/time';
import { useSubmissions } from './api';

/** The signed-in user's latest submissions for one problem (bottom panel of the workspace). */
export function ProblemSubmissionList({ problemId }: { problemId: string }) {
  const { data, isLoading } = useSubmissions({ problemId, mine: '1', pageSize: 10 });

  if (isLoading) return <div className="h-16 animate-pulse rounded-md bg-muted/50" />;
  if (!data?.items.length) return <p className="text-sm text-muted-foreground">{vi.workspace.historyEmpty}</p>;

  return (
    <div className="space-y-2">
      <ul className="divide-y rounded-lg border">
        {data.items.map((s) => (
          <li key={s.id}>
            <Link to={`/submissions/${s.id}`} className="flex items-center gap-3 px-3 py-2 text-sm hover:bg-accent/50">
              <VerdictBadge verdict={s.verdict} />
              <span className="text-xs text-muted-foreground">
                {s.passedCount}/{s.totalCount}
              </span>
              <span className="hidden text-xs text-muted-foreground sm:inline">{LANGUAGE_LABELS[s.language].split(' ')[0]}</span>
              {s.runtimeMs !== null && <span className="text-xs text-muted-foreground">{s.runtimeMs} ms</span>}
              <span className="ml-auto text-xs text-muted-foreground">{formatRelative(s.createdAt)}</span>
            </Link>
          </li>
        ))}
      </ul>
      {data.total > data.items.length && (
        <Link to={`/submissions?problemId=${problemId}`} className="text-xs text-primary hover:underline">
          {vi.workspace.viewAll}
        </Link>
      )}
    </div>
  );
}
