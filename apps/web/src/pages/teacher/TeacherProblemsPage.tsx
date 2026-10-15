import { Eye, Pencil, Plus, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { DifficultyBadge } from '@/components/DifficultyBadge';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/features/auth/AuthProvider';
import { useDeleteProblem, useProblems } from '@/features/problems/api';
import { vi } from '@/i18n/vi';
import { ApiError } from '@/lib/api';

export function TeacherProblemsPage() {
  const { user } = useAuth();
  // Admins manage every problem; teachers see their own.
  const { data, isLoading } = useProblems({ mine: user?.role === 'ADMIN' ? undefined : '1', pageSize: 100 });
  const del = useDeleteProblem();

  const remove = async (id: string, title: string) => {
    if (!window.confirm(vi.teacher.deleteConfirm(title))) return;
    try {
      await del.mutateAsync(id);
      toast.success(vi.teacher.deleted);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : String(err));
    }
  };

  return (
    <section className="mx-auto max-w-6xl px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{vi.teacher.myProblems}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{vi.teacher.myProblemsSubtitle}</p>
        </div>
        <Button asChild>
          <Link to="/teacher/problems/new">
            <Plus />
            {vi.teacher.newProblem}
          </Link>
        </Button>
      </div>

      <div className="mt-6 overflow-hidden rounded-xl border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5 font-medium">{vi.problems.colTitle}</th>
              <th className="w-28 px-4 py-2.5 font-medium">{vi.problems.colDifficulty}</th>
              <th className="w-36 px-4 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {isLoading && (
              <tr>
                <td colSpan={3} className="px-4 py-3">
                  <div className="h-4 w-1/3 animate-pulse rounded bg-muted" />
                </td>
              </tr>
            )}
            {data?.items.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-10 text-center text-muted-foreground">
                  {vi.teacher.noProblems}
                </td>
              </tr>
            )}
            {data?.items.map((p) => (
              <tr key={p.id} className="hover:bg-accent/50">
                <td className="px-4 py-3">
                  <Link to={`/teacher/problems/${p.id}`} className="font-medium hover:text-primary">
                    {p.title}
                  </Link>
                  <p className="font-mono text-xs text-muted-foreground">{p.slug}</p>
                </td>
                <td className="px-4 py-3">
                  <DifficultyBadge difficulty={p.difficulty} />
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="icon" asChild title={vi.teacher.view}>
                      <Link to={`/problems/${p.slug}`} aria-label={vi.teacher.view}>
                        <Eye />
                      </Link>
                    </Button>
                    <Button variant="ghost" size="icon" asChild title={vi.teacher.editProblem}>
                      <Link to={`/teacher/problems/${p.id}`} aria-label={vi.teacher.editProblem}>
                        <Pencil />
                      </Link>
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      title={vi.teacher.delete}
                      aria-label={vi.teacher.delete}
                      onClick={() => remove(p.id, p.title)}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
