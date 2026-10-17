import { ArrowDown, ArrowLeft, ArrowUp, Loader2, Plus, Search, Trash2, X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { assignmentInputSchema, type AssignmentDetail, type Difficulty } from '@judgehint/shared';
import { DifficultyBadge } from '@/components/DifficultyBadge';
import { FormField } from '@/components/FormField';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormAlert } from '@/features/auth/AuthShell';
import { useAssignment, useDeleteAssignment, useSaveAssignment } from '@/features/classrooms/api';
import { useProblems } from '@/features/problems/api';
import { useDebounced } from '@/hooks/useDebounced';
import { vi } from '@/i18n/vi';
import { ApiError } from '@/lib/api';
import { apiErrorToForm, zodFieldErrors, type FieldErrors } from '@/lib/forms';

const t = vi.assignmentEditor;

interface Picked {
  problemId: string;
  title: string;
  difficulty: Difficulty;
  points: string;
}

/** `<input type="datetime-local">` wants local time without seconds or zone. */
function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function defaults(existing?: AssignmentDetail) {
  if (existing) {
    return {
      title: existing.title,
      startsAt: toLocalInput(new Date(existing.startsAt)),
      endsAt: toLocalInput(new Date(existing.endsAt)),
      problems: existing.problems.map((p) => ({ problemId: p.id, title: p.title, difficulty: p.difficulty, points: String(p.points) })),
    };
  }
  const start = new Date(Math.ceil(Date.now() / 3600e3) * 3600e3); // next full hour
  return {
    title: '',
    startsAt: toLocalInput(start),
    endsAt: toLocalInput(new Date(start.getTime() + 7 * 24 * 3600e3)),
    problems: [] as Picked[],
  };
}

function ProblemPicker({ picked, onAdd }: { picked: Picked[]; onAdd: (p: Picked) => void }) {
  const [q, setQ] = useState('');
  const search = useDebounced(q.trim(), 250);
  const { data, isFetching } = useProblems({ q: search || undefined, pageSize: 8 });
  const chosen = new Set(picked.map((p) => p.problemId));

  return (
    <div className="rounded-lg border p-3">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t.searchProblems} className="h-9 pl-9" aria-label={t.searchProblems} />
        {isFetching && <Loader2 className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
      </div>
      <ul className="mt-2 divide-y">
        {data?.items.map((p) => (
          <li key={p.id} className="flex items-center gap-3 py-2 text-sm">
            <span className="min-w-0 flex-1 truncate">{p.title}</span>
            <DifficultyBadge difficulty={p.difficulty} />
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={chosen.has(p.id)}
              onClick={() => onAdd({ problemId: p.id, title: p.title, difficulty: p.difficulty, points: '100' })}
            >
              {chosen.has(p.id) ? t.added : (
                <>
                  <Plus />
                  {t.add}
                </>
              )}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Editor({ classroomId, existing }: { classroomId: string; existing?: AssignmentDetail }) {
  const navigate = useNavigate();
  const save = useSaveAssignment(existing ? { assignmentId: existing.id } : { classroomId });
  const del = useDeleteAssignment();
  const [form, setForm] = useState(() => defaults(existing));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string>();

  const setProblems = (fn: (ps: Picked[]) => Picked[]) => setForm((f) => ({ ...f, problems: fn(f.problems) }));
  const move = (i: number, d: -1 | 1) =>
    setProblems((ps) => {
      const next = [...ps];
      const j = i + d;
      if (j < 0 || j >= next.length) return ps;
      [next[i], next[j]] = [next[j]!, next[i]!];
      return next;
    });

  const total = form.problems.reduce((s, p) => s + (Number(p.points) || 0), 0);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const candidate = {
      title: form.title,
      // Local wall-clock time from the inputs, sent as an absolute instant.
      startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : '',
      endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : '',
      problems: form.problems.map((p) => ({ problemId: p.problemId, points: Number(p.points) })),
    };
    const parsed = assignmentInputSchema.safeParse(candidate);
    if (!parsed.success) {
      setErrors(zodFieldErrors(parsed.error));
      return;
    }
    setErrors({});
    setFormError(undefined);
    try {
      const saved = await save.mutateAsync(candidate);
      toast.success(t.saved);
      navigate(`/assignments/${saved.id}`, { replace: true });
    } catch (err) {
      const mapped = apiErrorToForm(err);
      setErrors(mapped.fields);
      setFormError(mapped.form);
    }
  };

  const onDelete = async () => {
    if (!existing || !window.confirm(vi.assignment.deleteConfirm(existing.title))) return;
    try {
      await del.mutateAsync(existing.id);
      toast.success(vi.assignment.deleted);
      navigate(`/classrooms/${classroomId}`, { replace: true });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : String(err));
    }
  };

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6">
      <FormAlert message={formError} />
      <FormField label={t.name} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} error={errors.title} />
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label={t.startsAt} type="datetime-local" value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} error={errors.startsAt} />
        <FormField label={t.endsAt} type="datetime-local" value={form.endsAt} onChange={(e) => setForm({ ...form, endsAt: e.target.value })} error={errors.endsAt} />
      </div>

      <div className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-medium">{t.problems}</h2>
          <span className="text-xs text-muted-foreground">{t.total(total)}</span>
        </div>
        {form.problems.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t.noProblems}</p>
        ) : (
          <ol className="divide-y rounded-lg border">
            {form.problems.map((p, i) => (
              <li key={p.problemId} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
                <span className="w-5 font-mono text-muted-foreground">{String.fromCharCode(65 + i)}</span>
                <span className="min-w-0 flex-1 truncate">{p.title}</span>
                <DifficultyBadge difficulty={p.difficulty} />
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  {t.points}
                  <Input
                    type="number"
                    min={1}
                    max={1000}
                    value={p.points}
                    onChange={(e) => setProblems((ps) => ps.map((x, k) => (k === i ? { ...x, points: e.target.value } : x)))}
                    className="h-8 w-20"
                  />
                </label>
                <div className="flex">
                  <Button type="button" variant="ghost" size="icon" aria-label={t.moveUp} disabled={i === 0} onClick={() => move(i, -1)}>
                    <ArrowUp />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" aria-label={t.moveDown} disabled={i === form.problems.length - 1} onClick={() => move(i, 1)}>
                    <ArrowDown />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" aria-label={t.remove} onClick={() => setProblems((ps) => ps.filter((_, k) => k !== i))}>
                    <X />
                  </Button>
                </div>
              </li>
            ))}
          </ol>
        )}
        {errors.problems && <p className="text-xs text-destructive">{errors.problems}</p>}
        <ProblemPicker picked={form.problems} onAdd={(p) => setProblems((ps) => [...ps, p])} />
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t pt-4">
        <Button type="submit" disabled={save.isPending}>
          {save.isPending && <Loader2 className="animate-spin" />}
          {t.save}
        </Button>
        {existing && (
          <Button type="button" variant="ghost" className="ml-auto text-destructive hover:text-destructive" onClick={onDelete}>
            <Trash2 />
            {t.delete}
          </Button>
        )}
      </div>
    </form>
  );
}

/** /classrooms/:classroomId/assignments/new and /assignments/:id/edit */
export function AssignmentEditorPage() {
  const { classroomId, id } = useParams();
  const { data: existing, isLoading, error } = useAssignment(id);
  const backTo = existing ? `/assignments/${existing.id}` : `/classrooms/${classroomId}`;

  return (
    <section className="mx-auto max-w-3xl px-4 py-8">
      <Link to={backTo} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" />
        {vi.assignment.back}
      </Link>
      <h1 className="mt-3 mb-6 text-2xl font-semibold tracking-tight">{id ? t.titleEdit : t.titleNew}</h1>
      {id && isLoading && <Loader2 className="size-6 animate-spin text-muted-foreground" />}
      {error && <FormAlert message={error instanceof ApiError ? error.message : String(error)} />}
      {!id && classroomId && <Editor classroomId={classroomId} />}
      {existing && <Editor key={existing.id} classroomId={existing.classroomId} existing={existing} />}
    </section>
  );
}
