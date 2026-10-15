import { Loader2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { loginSchema } from '@judgehint/shared';
import { FormField } from '@/components/FormField';
import { Button } from '@/components/ui/button';
import { AuthShell, FormAlert } from '@/features/auth/AuthShell';
import { useAuth } from '@/features/auth/AuthProvider';
import { safeNext } from '@/features/auth/RequireAuth';
import { vi } from '@/i18n/vi';
import { apiErrorToForm, zodFieldErrors, type FieldErrors } from '@/lib/forms';

// Seed accounts (see seed/index.ts); only rendered in development builds.
const DEV_ACCOUNTS = [
  { label: vi.roles.STUDENT, identifier: '24100001' },
  { label: vi.roles.TEACHER, identifier: 'teacher@judgehint.local' },
  { label: vi.roles.ADMIN, identifier: 'admin@judgehint.local' },
];
const DEV_PASSWORD = 'judgehint123';

export function LoginPage() {
  const { login, status } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));

  const [form, setForm] = useState({ identifier: '', password: '' });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);

  if (status === 'authenticated') return <Navigate to={next} replace />;

  const submit = async (values = form) => {
    const parsed = loginSchema.safeParse(values);
    if (!parsed.success) {
      setErrors(zodFieldErrors(parsed.error));
      return;
    }
    setErrors({});
    setFormError(undefined);
    setSubmitting(true);
    try {
      await login(parsed.data);
      navigate(next, { replace: true });
    } catch (err) {
      const { fields, form: message } = apiErrorToForm(err);
      setErrors(fields);
      setFormError(message);
    } finally {
      setSubmitting(false);
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void submit();
  };

  return (
    <AuthShell title={vi.auth.loginTitle} subtitle={vi.auth.loginSubtitle}>
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <FormAlert message={formError} />
        <FormField
          label={vi.auth.identifier}
          placeholder={vi.auth.identifierPlaceholder}
          autoComplete="username"
          autoFocus
          value={form.identifier}
          onChange={(e) => setForm({ ...form, identifier: e.target.value })}
          error={errors.identifier}
        />
        <FormField
          label={vi.auth.password}
          type="password"
          autoComplete="current-password"
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
          error={errors.password}
        />
        <Button type="submit" className="w-full" disabled={submitting}>
          {submitting && <Loader2 className="animate-spin" />}
          {vi.auth.submitLogin}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        {vi.auth.noAccount}{' '}
        <Link to={`/register${params.get('next') ? `?next=${encodeURIComponent(next)}` : ''}`} className="font-medium text-primary hover:underline">
          {vi.nav.register}
        </Link>
      </p>

      {import.meta.env.DEV && (
        <div className="mt-6 border-t pt-4">
          <p className="mb-2 text-xs text-muted-foreground">{vi.auth.devQuickLogin}</p>
          <div className="flex flex-wrap gap-2">
            {DEV_ACCOUNTS.map((a) => (
              <Button
                key={a.identifier}
                type="button"
                variant="outline"
                size="sm"
                disabled={submitting}
                onClick={() => {
                  const values = { identifier: a.identifier, password: DEV_PASSWORD };
                  setForm(values);
                  void submit(values);
                }}
              >
                {a.label}
              </Button>
            ))}
          </div>
        </div>
      )}
    </AuthShell>
  );
}
