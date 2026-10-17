import { Eye, EyeOff, FileUp, Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { MAX_TESTCASES_PER_PROBLEM, type TestCaseSummary } from '@judgehint/shared';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { vi } from '@/i18n/vi';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';
import {
  fetchTestCase,
  useBulkTestCases,
  useDeleteTestCase,
  useSaveTestCase,
  useTestCases,
  useToggleHidden,
} from './api';
import { ACCEPTED_EXTENSIONS, pairTestFiles, type FilePair, type SkippedFile } from './testFiles';

const t = vi.teacher.tests;
const errorText = (err: unknown) => (err instanceof ApiError ? err.message : String(err));

interface Draft {
  id?: string;
  input: string;
  expected: string;
  isHidden: boolean;
}

function TestCaseDialog({ problemId, draft, onClose }: { problemId: string; draft: Draft | null; onClose: () => void }) {
  const [form, setForm] = useState<Draft | null>(draft);
  const save = useSaveTestCase(problemId);

  // Re-seed the form whenever a different draft is opened.
  const [seen, setSeen] = useState(draft);
  if (draft !== seen) {
    setSeen(draft);
    setForm(draft);
  }

  const submit = async () => {
    if (!form) return;
    try {
      await save.mutateAsync(form);
      toast.success(t.saved);
      onClose();
    } catch (err) {
      toast.error(errorText(err));
    }
  };

  return (
    <Dialog
      open={!!draft}
      onClose={onClose}
      title={form?.id ? t.edit : t.add}
      className="max-w-3xl"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t.cancel}
          </Button>
          <Button onClick={submit} disabled={save.isPending}>
            {save.isPending && <Loader2 className="animate-spin" />}
            {t.save}
          </Button>
        </>
      }
    >
      {form && (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="tc-input">{t.input}</Label>
              <Textarea
                id="tc-input"
                value={form.input}
                onChange={(e) => setForm({ ...form, input: e.target.value })}
                className="h-56 font-mono text-xs"
                spellCheck={false}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tc-expected">{t.expected}</Label>
              <Textarea
                id="tc-expected"
                value={form.expected}
                onChange={(e) => setForm({ ...form, expected: e.target.value })}
                className="h-56 font-mono text-xs"
                spellCheck={false}
              />
            </div>
          </div>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-0.5 size-4 accent-[var(--primary)]"
              checked={form.isHidden}
              onChange={(e) => setForm({ ...form, isHidden: e.target.checked })}
            />
            <span>
              {t.hidden}
              <span className="block text-xs text-muted-foreground">{t.hiddenHint}</span>
            </span>
          </label>
        </div>
      )}
    </Dialog>
  );
}

function ImportDialog({ problemId, open, onClose }: { problemId: string; open: boolean; onClose: () => void }) {
  const [pairs, setPairs] = useState<FilePair[]>([]);
  const [skipped, setSkipped] = useState<SkippedFile[]>([]);
  const [reading, setReading] = useState(false);
  const [replace, setReplace] = useState(false);
  const [hidden, setHidden] = useState(true);
  const bulk = useBulkTestCases(problemId);
  const tooMany = pairs.length > MAX_TESTCASES_PER_PROBLEM;

  const close = () => {
    setPairs([]);
    setSkipped([]);
    onClose();
  };

  const submit = async () => {
    try {
      const res = await bulk.mutateAsync({
        replace,
        cases: pairs.map((p) => ({ input: p.input, expected: p.expected, isHidden: hidden })),
      });
      toast.success(t.imported(res.created));
      close();
    } catch (err) {
      toast.error(errorText(err));
    }
  };

  return (
    <Dialog
      open={open}
      onClose={close}
      title={t.importTitle}
      footer={
        <>
          <Button variant="outline" onClick={close}>
            {t.cancel}
          </Button>
          <Button onClick={submit} disabled={!pairs.length || tooMany || reading || bulk.isPending}>
            {bulk.isPending && <Loader2 className="animate-spin" />}
            {t.importDo(pairs.length)}
          </Button>
        </>
      }
    >
      <div className="space-y-4 text-sm">
        <p className="text-muted-foreground">{t.importHelp}</p>
        <input
          type="file"
          multiple
          accept={ACCEPTED_EXTENSIONS.join(',')}
          className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-sm file:text-secondary-foreground"
          onChange={async (e) => {
            setReading(true);
            try {
              const result = await pairTestFiles([...(e.target.files ?? [])]);
              setPairs(result.pairs);
              setSkipped(result.skipped);
            } catch (err) {
              toast.error(errorText(err));
            } finally {
              setReading(false);
            }
          }}
        />
        {reading && (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            {t.importReading}
          </p>
        )}
        {!reading && (pairs.length > 0 || skipped.length > 0) && (
          <div className="max-h-48 overflow-y-auto rounded-md bg-muted px-3 py-2 text-xs">
            <p>
              {t.importPairs(pairs.length)}
              {pairs.length > 0 && `: ${pairs.map((p) => p.name).join(', ')}`}
            </p>
            {tooMany && <p className="mt-1 text-destructive">{t.importTooMany(MAX_TESTCASES_PER_PROBLEM)}</p>}
            {skipped.length > 0 && (
              <div className="mt-1 text-destructive">
                <p>{t.importSkippedTitle(skipped.length)}</p>
                <ul className="list-disc pl-4">
                  {skipped.map((s) => (
                    <li key={`${s.name}:${s.reason}`} className="break-all">
                      {s.name} — {t.importSkipped[s.reason]}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
        <label className="flex items-center gap-2">
          <input type="checkbox" className="size-4" checked={hidden} onChange={(e) => setHidden(e.target.checked)} />
          {t.importHidden}
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" className="size-4" checked={replace} onChange={(e) => setReplace(e.target.checked)} />
          {t.importReplace}
        </label>
      </div>
    </Dialog>
  );
}

function Preview({ text, bytes }: { text: string; bytes: number }) {
  const truncated = bytes > new TextEncoder().encode(text).length;
  return (
    <div className="min-w-0">
      <pre className="max-h-16 overflow-hidden font-mono text-xs leading-snug whitespace-pre-wrap break-all">
        {text}
        {truncated && <span className="text-muted-foreground">…</span>}
      </pre>
      <span className="text-[11px] text-muted-foreground">{t.bytes(bytes)}</span>
    </div>
  );
}

export function TestCaseManager({ problemId }: { problemId: string }) {
  const { data: tests, isLoading } = useTestCases(problemId);
  const toggle = useToggleHidden(problemId);
  const del = useDeleteTestCase(problemId);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [loadingId, setLoadingId] = useState<string>();

  const openEdit = async (tc: TestCaseSummary) => {
    setLoadingId(tc.id);
    try {
      const full = await fetchTestCase(problemId, tc.id);
      setDraft(full);
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setLoadingId(undefined);
    }
  };

  const remove = async (tc: TestCaseSummary, index: number) => {
    if (!window.confirm(t.deleteConfirm(index + 1))) return;
    try {
      await del.mutateAsync(tc.id);
      toast.success(t.deleted);
    } catch (err) {
      toast.error(errorText(err));
    }
  };

  const hiddenCount = tests?.filter((x) => x.isHidden).length ?? 0;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{tests ? t.count(tests.length, hiddenCount) : t.loading}</p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
            <FileUp />
            {t.import}
          </Button>
          <Button size="sm" onClick={() => setDraft({ input: '', expected: '', isHidden: true })}>
            <Plus />
            {t.add}
          </Button>
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border">
        {isLoading && <div className="h-24 animate-pulse bg-muted/40" />}
        {tests?.length === 0 && <p className="px-4 py-10 text-center text-sm text-muted-foreground">{t.empty}</p>}
        <ul className="divide-y">
          {tests?.map((tc, i) => (
            <li key={tc.id} className="grid grid-cols-[2.5rem_1fr_auto] items-start gap-3 px-4 py-3 md:grid-cols-[2.5rem_1fr_1fr_auto]">
              <span className="pt-0.5 font-mono text-xs text-muted-foreground">#{i + 1}</span>
              <Preview text={tc.inputPreview} bytes={tc.inputBytes} />
              <div className="col-start-2 md:col-start-auto">
                <Preview text={tc.expectedPreview} bytes={tc.expectedBytes} />
              </div>
              <div className="col-start-3 row-start-1 flex items-center gap-1 md:col-start-auto">
                <button
                  type="button"
                  onClick={() => toggle.mutate({ id: tc.id, isHidden: !tc.isHidden })}
                  className={cn(
                    'flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium',
                    tc.isHidden ? 'bg-secondary text-secondary-foreground' : 'bg-primary/15 text-primary',
                  )}
                  title={t.hiddenHint}
                >
                  {tc.isHidden ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                  {tc.isHidden ? t.hidden : t.public}
                </button>
                <Button variant="ghost" size="icon" aria-label={t.edit} onClick={() => openEdit(tc)} disabled={loadingId === tc.id}>
                  {loadingId === tc.id ? <Loader2 className="animate-spin" /> : <Pencil />}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={vi.teacher.delete}
                  onClick={() => remove(tc, i)}
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <TestCaseDialog problemId={problemId} draft={draft} onClose={() => setDraft(null)} />
      <ImportDialog problemId={problemId} open={importOpen} onClose={() => setImportOpen(false)} />
    </div>
  );
}
