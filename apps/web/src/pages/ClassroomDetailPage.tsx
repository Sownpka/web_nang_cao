import { ArrowLeft, BarChart3, Check, Copy, Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { AssignmentStatusBadge, Countdown } from '@/components/Countdown';
import { Button } from '@/components/ui/button';
import { useClassroom, useRemoveMember } from '@/features/classrooms/api';
import { vi } from '@/i18n/vi';
import { ApiError } from '@/lib/api';
import { formatDateTime } from '@/lib/time';
import { cn } from '@/lib/utils';

const t = vi.classes;

function JoinCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3">
      <div>
        <p className="text-xs text-muted-foreground">{t.joinCode}</p>
        <p className="font-mono text-2xl font-semibold tracking-[0.2em]">{code}</p>
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={async () => {
          await navigator.clipboard.writeText(code);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? <Check /> : <Copy />}
        {copied ? t.copied : t.copyCode}
      </Button>
    </div>
  );
}

export function ClassroomDetailPage() {
  const { id = '' } = useParams();
  const { data: c, isLoading, error } = useClassroom(id);
  const remove = useRemoveMember(id);
  const [tab, setTab] = useState<'assignments' | 'members'>('assignments');

  if (isLoading) {
    return (
      <div className="grid place-items-center py-24">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (error || !c) {
    return (
      <section className="mx-auto max-w-md px-4 py-24 text-center">
        <p className="text-lg font-semibold">{error instanceof ApiError ? error.message : t.notFound}</p>
        <Button variant="outline" className="mt-4" asChild>
          <Link to="/classrooms">{t.title}</Link>
        </Button>
      </section>
    );
  }

  const onRemove = async (userId: string, name: string) => {
    if (!window.confirm(t.removeConfirm(name))) return;
    try {
      await remove.mutateAsync(userId);
      toast.success(t.removed);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : String(err));
    }
  };

  return (
    <section className="mx-auto max-w-6xl px-4 py-8">
      <Link to="/classrooms" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" />
        {t.title}
      </Link>
      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{c.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t.teacher}: {c.teacher.fullName} · {t.students(c.studentCount)}
          </p>
        </div>
        {c.joinCode && <JoinCode code={c.joinCode} />}
      </div>

      <div className="mt-6 flex items-center gap-1 border-b" role="tablist">
        {(['assignments', ...(c.canManage ? (['members'] as const) : [])] as const).map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={cn(
              '-mb-px border-b-2 px-4 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground',
              tab === key ? 'border-primary text-foreground' : 'border-transparent',
            )}
          >
            {key === 'assignments' ? `${t.tabAssignments} (${c.assignments.length})` : `${t.tabMembers} (${c.studentCount})`}
          </button>
        ))}
        {c.canManage && tab === 'assignments' && (
          <Button size="sm" className="ml-auto mb-1" asChild>
            <Link to={`/classrooms/${c.id}/assignments/new`}>
              <Plus />
              {t.newAssignment}
            </Link>
          </Button>
        )}
      </div>

      {tab === 'assignments' && (
        <ul className="mt-4 space-y-3">
          {c.assignments.length === 0 && <li className="text-sm text-muted-foreground">{t.noAssignments}</li>}
          {c.assignments.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border bg-card p-4">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Link to={`/assignments/${a.id}`} className="font-medium hover:text-primary">
                    {a.title}
                  </Link>
                  <AssignmentStatusBadge startsAt={a.startsAt} endsAt={a.endsAt} />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t.window(formatDateTime(a.startsAt), formatDateTime(a.endsAt))} · {t.problems(a.problemCount, a.totalPoints)}
                </p>
              </div>
              <Countdown startsAt={a.startsAt} endsAt={a.endsAt} className="text-sm text-muted-foreground" />
              {c.canManage && (
                <div className="flex">
                  <Button variant="ghost" size="icon" asChild title={vi.report.open}>
                    <Link to={`/assignments/${a.id}/report`} aria-label={vi.report.open}>
                      <BarChart3 />
                    </Link>
                  </Button>
                  <Button variant="ghost" size="icon" asChild title={t.editAssignment}>
                    <Link to={`/assignments/${a.id}/edit`} aria-label={t.editAssignment}>
                      <Pencil />
                    </Link>
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {tab === 'members' && c.members && (
        <div className="mt-4 overflow-x-auto rounded-xl border">
          {c.members.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">{t.noMembers}</p>
          ) : (
            <table className="w-full min-w-[560px] text-sm">
              <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 font-medium">{t.colStudent}</th>
                  <th className="px-4 py-2.5 font-medium">{t.colStudentCode}</th>
                  <th className="px-4 py-2.5 font-medium">{t.colEmail}</th>
                  <th className="px-4 py-2.5 font-medium">{t.colJoined}</th>
                  <th className="w-12 px-2" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {c.members.map((m) => (
                  <tr key={m.id}>
                    <td className="px-4 py-2.5">{m.fullName}</td>
                    <td className="px-4 py-2.5 font-mono text-xs">{m.studentCode ?? '—'}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{m.email}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{formatDateTime(m.joinedAt)}</td>
                    <td className="px-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive"
                        aria-label={t.removeMember}
                        title={t.removeMember}
                        onClick={() => onRemove(m.id, m.fullName)}
                      >
                        <Trash2 />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </section>
  );
}
