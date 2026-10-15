import { Construction } from 'lucide-react';
import { useAuth } from '@/features/auth/AuthProvider';
import { vi } from '@/i18n/vi';

/** Temporary page for routes whose real UI lands in later weeks. */
export function PlaceholderPage({ title, body }: { title: string; body: string }) {
  const { user } = useAuth();
  return (
    <section className="mx-auto max-w-6xl px-4 py-12">
      {user && <p className="text-sm text-muted-foreground">{vi.placeholder.greeting(user.fullName)}</p>}
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">{title}</h1>
      <div className="mt-6 flex items-center gap-3 rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
        <Construction className="size-5 shrink-0" />
        {body}
      </div>
    </section>
  );
}
