import type { ReactNode } from 'react';
import { vi } from '@/i18n/vi';

const sampleRun = [
  { label: 'Test 1', verdict: 'AC', ms: '12 ms' },
  { label: 'Test 2', verdict: 'AC', ms: '15 ms' },
  { label: 'Test 3', verdict: 'WA', ms: '14 ms' },
];

/** Two-column frame for the auth pages; the decorative panel hides on small screens. */
export function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <section className="mx-auto grid max-w-5xl gap-10 px-4 py-10 md:grid-cols-2 md:items-center md:py-16">
      <aside className="hidden flex-col gap-6 md:flex">
        <h2 className="text-3xl font-bold tracking-tight text-balance">{vi.auth.panelTitle}</h2>
        <p className="text-muted-foreground text-pretty">{vi.auth.panelBody}</p>
        <div className="rounded-xl border bg-card p-4 font-mono text-sm shadow-sm" aria-hidden>
          <p className="mb-3 text-xs text-muted-foreground">$ judge main.py</p>
          <ul className="space-y-1.5">
            {sampleRun.map((r) => (
              <li key={r.label} className="flex items-center justify-between">
                <span className="text-muted-foreground">{r.label}</span>
                <span className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground">{r.ms}</span>
                  <span
                    className={
                      r.verdict === 'AC'
                        ? 'rounded bg-primary/15 px-1.5 py-0.5 text-xs font-semibold text-primary'
                        : 'rounded bg-destructive/15 px-1.5 py-0.5 text-xs font-semibold text-destructive'
                    }
                  >
                    {r.verdict}
                  </span>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 border-t pt-3 text-xs text-muted-foreground">
            <span className="text-primary">Gợi ý mức 1:</span> kiểm tra lại trường hợp biên khi n = 1…
          </p>
        </div>
      </aside>

      <div className="w-full rounded-xl border bg-card p-6 shadow-sm sm:p-8">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-1 mb-6 text-sm text-muted-foreground">{subtitle}</p>
        {children}
      </div>
    </section>
  );
}

export function FormAlert({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
      {message}
    </div>
  );
}
