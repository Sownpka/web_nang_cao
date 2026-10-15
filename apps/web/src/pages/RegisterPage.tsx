import { Loader2 } from 'lucide-react';
import { useState, type ChangeEvent, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { registerSchema } from '@judgehint/shared';
import { FormField } from '@/components/FormField';
import { Button } from '@/components/ui/button';
import { AuthShell, FormAlert } from '@/features/auth/AuthShell';
import { useAuth } from '@/features/auth/AuthProvider';
import { safeNext } from '@/features/auth/RequireAuth';
import { vi } from '@/i18n/vi';
import { apiErrorToForm, zodFieldErrors, type FieldErrors } from '@/lib/forms';

const empty = { fullName: '', studentCode: '', email: '', password: '', confirmPassword: '' };

export function RegisterPage() {
  const { register, status } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));

  const [form, setForm] = useState(empty);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);

  if (status === 'authenticated') return <Navigate to={next} replace />;

  const field = (name: keyof typeof empty) => ({
    value: form[name],
    onChange: (e: ChangeEvent<HTMLInputElement>) => setForm({ ...form, [name]: e.target.value }),
    error: errors[name],
  });

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const { confirmPassword, ...values } = form;
    const parsed = registerSchema.safeParse(values);
    const fieldErrors = parsed.success ? {} : zodFieldErrors(parsed.error);
    if (confirmPassword !== values.password) fieldErrors.confirmPassword = vi.auth.passwordMismatch;
    if (!parsed.success || fieldErrors.confirmPassword) {
      setErrors(fieldErrors);
      return;
    }

    setErrors({});
    setFormError(undefined);
    setSubmitting(true);
    try {
      await register(parsed.data);
      navigate(next, { replace: true });
    } catch (err) {
      const { fields, form: message } = apiErrorToForm(err);
      setErrors(fields);
      setFormError(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell title={vi.auth.registerTitle} subtitle={vi.auth.registerSubtitle}>
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <FormAlert message={formError} />
        <FormField label={vi.auth.fullName} placeholder={vi.auth.fullNamePlaceholder} autoComplete="name" autoFocus {...field('fullName')} />
        <FormField
          label={vi.auth.studentCode}
          placeholder={vi.auth.studentCodePlaceholder}
          inputMode="numeric"
          maxLength={8}
          {...field('studentCode')}
        />
        <FormField label={vi.auth.email} type="email" placeholder={vi.auth.emailPlaceholder} autoComplete="email" {...field('email')} />
        <FormField label={vi.auth.password} type="password" autoComplete="new-password" hint={vi.auth.passwordHint} {...field('password')} />
        <FormField label={vi.auth.confirmPassword} type="password" autoComplete="new-password" {...field('confirmPassword')} />
        <Button type="submit" className="w-full" disabled={submitting}>
          {submitting && <Loader2 className="animate-spin" />}
          {vi.auth.submitRegister}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        {vi.auth.haveAccount}{' '}
        <Link to="/login" className="font-medium text-primary hover:underline">
          {vi.nav.login}
        </Link>
      </p>
    </AuthShell>
  );
}
