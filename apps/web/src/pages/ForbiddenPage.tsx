import { ShieldAlert } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { vi } from '@/i18n/vi';

export function ForbiddenPage() {
  return (
    <section className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-24 text-center">
      <ShieldAlert className="size-10 text-destructive" />
      <h1 className="text-xl font-semibold">{vi.forbidden.title}</h1>
      <p className="text-sm text-muted-foreground">{vi.forbidden.body}</p>
      <Button variant="outline" asChild>
        <Link to="/problems">{vi.forbidden.back}</Link>
      </Button>
    </section>
  );
}
