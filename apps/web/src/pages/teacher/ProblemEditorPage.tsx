import { ArrowLeft, Eye, Loader2, Trash2 } from 'lucide-react';
import { lazy, Suspense, useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  DIFFICULTY_LABELS,
  LANGUAGE_LABELS,
  SUPPORTED_LANGUAGES,
  problemInputSchema,
  slugify,
  type Difficulty,
  type Language,
  type ProblemManage,
} from '@judgehint/shared';
import { FormField } from '@/components/FormField';
import { Markdown } from '@/components/Markdown';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { FormAlert } from '@/features/auth/AuthShell';
import { useDeleteProblem, useProblemManage, useSaveProblem } from '@/features/problems/api';
import { TestCaseManager } from '@/features/problems/TestCaseManager';
import { vi } from '@/i18n/vi';
import { ApiError } from '@/lib/api';
import { apiErrorToForm, zodFieldErrors, type FieldErrors } from '@/lib/forms';
import { cn } from '@/lib/utils';

const CodeEditor = lazy(() => import('@/components/CodeEditor'));
const tt = vi.teacher;

interface FormState {
  title: string;
  slug: string;
  statementMd: string;
  difficulty: Difficulty;
  timeLimitMs: string;
  memoryLimitMb: string;
  allowedLanguages: Language[];
  aiHintsEnabled: boolean;
  referenceSolution: string;
}

const STATEMENT_TEMPLATE = `Mô tả bài toán ở đây.

### Đầu vào
- ...

### Đầu ra
- ...

### Ví dụ
Input:
\`\`\`
1 2
\`\`\`
Output:
\`\`\`
3
\`\`\`
`;

const emptyForm: FormState = {
  title: '',
  slug: '',
  statementMd: STATEMENT_TEMPLATE,
  difficulty: 'EASY',
  timeLimitMs: '2000',
  memoryLimitMb: '256',
  allowedLanguages: [...SUPPORTED_LANGUAGES],
  aiHintsEnabled: true,
  referenceSolution: '',
};

const fromProblem = (p: ProblemManage): FormState => ({
  title: p.title,
  slug: p.slug,
  statementMd: p.statementMd,
  difficulty: p.difficulty,
  timeLimitMs: String(p.timeLimitMs),
  memoryLimitMb: String(p.memoryLimitMb),
  allowedLanguages: p.allowedLanguages,
  aiHintsEnabled: p.aiHintsEnabled,
  referenceSolution: p.referenceSolution ?? '',
});

function ProblemForm({ problem }: { problem?: ProblemManage }) {
  const navigate = useNavigate();
  const save = useSaveProblem(problem?.id);
  const del = useDeleteProblem();
  const [form, setForm] = useState<FormState>(() => (problem ? fromProblem(problem) : emptyForm));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string>();
  const [showPreview, setShowPreview] = useState(false);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));

  const toggleLanguage = (l: Language) =>
    set('allowedLanguages', form.allowedLanguages.includes(l) ? form.allowedLanguages.filter((x) => x !== l) : [...form.allowedLanguages, l]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const parsed = problemInputSchema.safeParse(form);
    if (!parsed.success) {
      setErrors(zodFieldErrors(parsed.error));
      toast.error(tt.checkFields);
      return;
    }
    setErrors({});
    setFormError(undefined);
    try {
      const res = await save.mutateAsync(parsed.data);
      if (problem) {
        set('slug', res.slug);
        toast.success(tt.saved);
      } else {
        toast.success(tt.created);
        navigate(`/teacher/problems/${res.id}?tab=tests`, { replace: true });
      }
    } catch (err) {
      const mapped = apiErrorToForm(err);
      if (err instanceof ApiError && err.code === 'SLUG_TAKEN') mapped.fields.slug = err.message;
      setErrors(mapped.fields);
      setFormError(mapped.form);
    }
  };

  const onDelete = async () => {
    if (!problem || !window.confirm(tt.deleteConfirm(problem.title))) return;
    try {
      await del.mutateAsync(problem.id);
      toast.success(tt.deleted);
      navigate('/teacher/problems', { replace: true });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : String(err));
    }
  };

  const slugPreview = form.slug || slugify(form.title);
  const editorLang = form.allowedLanguages[0] ?? 'python';

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6">
      <FormAlert message={formError} />

      <div className="grid gap-4 md:grid-cols-2">
        <FormField label={tt.title} value={form.title} onChange={(e) => set('title', e.target.value)} error={errors.title} />
        <FormField
          label={tt.slug}
          value={form.slug}
          onChange={(e) => set('slug', e.target.value.toLowerCase())}
          placeholder={slugify(form.title)}
          hint={tt.slugHint(slugPreview)}
          error={errors.slug}
          className="font-mono"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="difficulty">{tt.difficulty}</Label>
          <Select id="difficulty" value={form.difficulty} onChange={(e) => set('difficulty', e.target.value as Difficulty)}>
            {(Object.keys(DIFFICULTY_LABELS) as Difficulty[]).map((d) => (
              <option key={d} value={d}>
                {DIFFICULTY_LABELS[d]}
              </option>
            ))}
          </Select>
        </div>
        <FormField
          label={tt.timeLimit}
          type="number"
          min={100}
          max={10000}
          step={100}
          value={form.timeLimitMs}
          onChange={(e) => set('timeLimitMs', e.target.value)}
          error={errors.timeLimitMs}
        />
        <FormField
          label={tt.memoryLimit}
          type="number"
          min={32}
          max={1024}
          step={32}
          value={form.memoryLimitMb}
          onChange={(e) => set('memoryLimitMb', e.target.value)}
          error={errors.memoryLimitMb}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">{tt.languages}</legend>
          <div className="flex flex-wrap gap-2">
            {SUPPORTED_LANGUAGES.map((l) => (
              <label
                key={l}
                className={cn(
                  'flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-sm',
                  form.allowedLanguages.includes(l) && 'border-primary bg-primary/10',
                )}
              >
                <input type="checkbox" className="size-4" checked={form.allowedLanguages.includes(l)} onChange={() => toggleLanguage(l)} />
                {LANGUAGE_LABELS[l]}
              </label>
            ))}
          </div>
          {errors.allowedLanguages && <p className="text-xs text-destructive">{errors.allowedLanguages}</p>}
        </fieldset>
        <label className="flex cursor-pointer items-start gap-2 pt-6 text-sm">
          <input type="checkbox" className="mt-0.5 size-4" checked={form.aiHintsEnabled} onChange={(e) => set('aiHintsEnabled', e.target.checked)} />
          <span>
            <span className="font-medium">{tt.aiHints}</span>
            <span className="block text-xs text-muted-foreground">{tt.aiHintsHint}</span>
          </span>
        </label>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="statement">{tt.statement}</Label>
          <Button type="button" variant="ghost" size="sm" className="lg:hidden" onClick={() => setShowPreview((v) => !v)}>
            <Eye />
            {tt.preview}
          </Button>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <Textarea
            id="statement"
            value={form.statementMd}
            onChange={(e) => set('statementMd', e.target.value)}
            aria-invalid={!!errors.statementMd}
            className={cn('h-96 font-mono text-xs leading-relaxed', showPreview && 'hidden lg:flex')}
            spellCheck={false}
          />
          <div className={cn('h-96 overflow-y-auto rounded-md border bg-background p-4', !showPreview && 'hidden lg:block')}>
            <Markdown>{form.statementMd}</Markdown>
          </div>
        </div>
        {errors.statementMd && <p className="text-xs text-destructive">{errors.statementMd}</p>}
      </div>

      <div className="space-y-1.5">
        <Label>{tt.referenceSolution}</Label>
        <p className="text-xs text-muted-foreground">{tt.referenceSolutionHint}</p>
        <div className="h-60 overflow-hidden rounded-md border">
          <Suspense fallback={<div className="h-full animate-pulse bg-muted/40" />}>
            <CodeEditor language={editorLang} value={form.referenceSolution} onChange={(v) => set('referenceSolution', v)} />
          </Suspense>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t pt-4">
        <Button type="submit" disabled={save.isPending}>
          {save.isPending && <Loader2 className="animate-spin" />}
          {problem ? tt.save : tt.create}
        </Button>
        {problem && (
          <>
            <Button variant="outline" asChild>
              <Link to={`/problems/${problem.slug}`}>
                <Eye />
                {tt.view}
              </Link>
            </Button>
            <Button type="button" variant="ghost" className="ml-auto text-destructive hover:text-destructive" onClick={onDelete}>
              <Trash2 />
              {tt.delete}
            </Button>
          </>
        )}
      </div>
    </form>
  );
}

export function ProblemEditorPage() {
  const { id } = useParams();
  const isNew = !id || id === 'new';
  const [params, setParams] = useSearchParams();
  const tab = !isNew && params.get('tab') === 'tests' ? 'tests' : 'info';
  const { data: problem, isLoading, error } = useProblemManage(isNew ? undefined : id);

  useEffect(() => {
    if (!problem) return;
    const previous = document.title;
    document.title = `${problem.title} — JudgeHint`;
    return () => {
      document.title = previous;
    };
  }, [problem]);

  const tabs = [
    { key: 'info', label: tt.tabInfo },
    { key: 'tests', label: problem ? `${tt.tabTests} (${problem.totalTests})` : tt.tabTests },
  ] as const;

  return (
    <section className="mx-auto max-w-6xl px-4 py-8">
      <Link to="/teacher/problems" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" />
        {tt.myProblems}
      </Link>
      <div className="mt-3 flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">{isNew ? tt.newProblem : (problem?.title ?? tt.editProblem)}</h1>
        {problem && <span className="text-sm text-muted-foreground">{tt.submissions(problem.submissionCount)}</span>}
      </div>

      {!isNew && (
        <div className="mt-6 flex gap-1 border-b" role="tablist">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setParams(t.key === 'tests' ? { tab: 'tests' } : {}, { replace: true })}
              className={cn(
                '-mb-px border-b-2 px-4 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground',
                tab === t.key ? 'border-primary text-foreground' : 'border-transparent',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      <div className="mt-6">
        {isLoading && <Loader2 className="size-6 animate-spin text-muted-foreground" />}
        {error && <FormAlert message={error instanceof ApiError ? error.message : String(error)} />}
        {isNew && <ProblemForm />}
        {problem && tab === 'info' && <ProblemForm key={problem.id} problem={problem} />}
        {problem && tab === 'tests' && <TestCaseManager problemId={problem.id} />}
      </div>
    </section>
  );
}
