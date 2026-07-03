'use client';

import { useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Field } from '@/components/ui/Field';

export default function LoginPage() {
  const router = useRouter();
  const params = useSearchParams();
  const redirectTo = params.get('from') || '/';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    startTransition(async () => {
      const supabase = createClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });

      if (signInError) {
        // Don't leak whether account exists
        setError('מייל או סיסמה שגויים. נסה שוב.');

        // Log the failure (fire & forget)
        fetch('/api/auth/log-attempt', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: email.trim().toLowerCase(),
            success: false,
            reason: signInError.message,
          }),
        }).catch(() => {});
        return;
      }

      router.push(redirectTo);
      router.refresh();
    });
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-page p-4" dir="rtl">
      <div className="w-full max-w-md bg-surface-card rounded-xl shadow-lg p-8">
        <div className="flex flex-col items-center mb-6">
          <div className="w-14 h-14 rounded-lg bg-primary flex items-center justify-center text-white text-2xl font-bold">
            F
          </div>
          <h1 className="mt-4 text-2xl font-extrabold text-content-strong">FibertechOS</h1>
          <p className="text-sm text-content-muted mt-1">מערכת ניהול תפעולית</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="מייל פיברטק">
            <Input
              type="email"
              required
              autoFocus
              autoComplete="email"
              dir="ltr"
              className="text-right"
              placeholder="you@fibertech.co.il"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>

          <Field label="סיסמה">
            <Input
              type="password"
              required
              autoComplete="current-password"
              dir="ltr"
              className="text-right"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>

          {error && (
            <div className="bg-danger-soft border border-danger text-danger text-sm rounded-md px-3 py-2">
              {error}
            </div>
          )}

          <Button type="submit" fullWidth disabled={pending}>
            {pending ? 'מתחבר...' : 'התחברות'}
          </Button>
        </form>

        <div className="mt-6 pt-6 border-t border-line-subtle space-y-2 text-sm text-center">
          <Link href="/forgot-password" className="text-azure hover:underline block">
            שכחתי סיסמה
          </Link>
          <Link href="/request-access" className="text-content-muted hover:text-content-strong block">
            עובד חדש? בקשת גישה למערכת
          </Link>
        </div>
      </div>
    </div>
  );
}
