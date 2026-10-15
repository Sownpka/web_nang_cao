import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { vi } from '@/i18n/vi';

export function NotFoundPage() {
  return (
    <section className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-24 text-center">
      <p className="font-mono text-5xl font-bold text-primary">404</p>
      <h1 className="text-xl font-semibold">{vi.notFound.title}</h1>
      <Button variant="outline" asChild>
        <Link to="/">{vi.notFound.back}</Link>
      </Button>
    </section>
  );
}
