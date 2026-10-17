import { BookOpen, Loader2, Plus, Users } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/features/auth/AuthProvider';
import { useClassrooms, useCreateClassroom, useJoinClassroom } from '@/features/classrooms/api';
import { vi } from '@/i18n/vi';
import { ApiError } from '@/lib/api';

const t = vi.classes;
const errorText = (err: unknown) => (err instanceof ApiError ? err.message : String(err));

function JoinForm() {
  const [code, setCode] = useState('');
  const join = useJoinClassroom();
  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;
    try {
      const c = await join.mutateAsync(code.trim());
      toast.success(t.joined(c.name));
      setCode('');
    } catch (err) {
      toast.error(errorText(err));
    }
  };
  return (
    <form onSubmit={onSubmit} className="flex w-full gap-2 sm:w-auto">
      <Input
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        placeholder={t.joinPlaceholder}
        aria-label={t.joinPlaceholder}
        className="h-9 font-mono uppercase sm:w-48"
        maxLength={12}
      />
      <Button type="submit" disabled={join.isPending || !code.trim()}>
        {join.isPending && <Loader2 className="animate-spin" />}
        {t.join}
      </Button>
    </form>
  );
}

function CreateForm() {
  const [name, setName] = useState('');
  const create = useCreateClassroom();
  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await create.mutateAsync(name.trim());
      toast.success(t.created);
      setName('');
    } catch (err) {
      toast.error(errorText(err));
    }
  };
  return (
    <form onSubmit={onSubmit} className="flex w-full gap-2 sm:w-auto">
      <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t.createPlaceholder} aria-label={t.createPlaceholder} className="h-9 sm:w-72" />
      <Button type="submit" disabled={create.isPending || name.trim().length < 3}>
        {create.isPending ? <Loader2 className="animate-spin" /> : <Plus />}
        {t.create}
      </Button>
    </form>
  );
}

export function ClassroomsPage() {
  const { user } = useAuth();
  const { data, isLoading } = useClassrooms();
  const isStaff = user?.role === 'TEACHER' || user?.role === 'ADMIN';

  return (
    <section className="mx-auto max-w-6xl px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t.title}</h1>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">{isStaff ? t.subtitleTeacher : t.subtitleStudent}</p>
        </div>
        {isStaff ? <CreateForm /> : <JoinForm />}
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {isLoading && Array.from({ length: 3 }, (_, i) => <div key={i} className="h-32 animate-pulse rounded-xl border bg-muted/40" />)}
        {data?.length === 0 && <p className="text-sm text-muted-foreground sm:col-span-2 lg:col-span-3">{t.empty}</p>}
        {data?.map((c) => (
          <Link key={c.id} to={`/classrooms/${c.id}`} className="group rounded-xl border bg-card p-5 transition-colors hover:border-primary/50">
            <h2 className="font-semibold group-hover:text-primary">{c.name}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {t.teacher}: {c.teacher.fullName}
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Users className="size-3.5" />
                {t.students(c.studentCount)}
              </span>
              <span className="flex items-center gap-1">
                <BookOpen className="size-3.5" />
                {t.assignmentsCount(c.assignmentCount)}
              </span>
              {c.joinCode && <span className="ml-auto rounded bg-muted px-2 py-0.5 font-mono text-foreground">{c.joinCode}</span>}
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
