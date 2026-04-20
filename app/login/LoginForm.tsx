'use client';

import { useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

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
    <div className="min-h-screen flex items-center justify-center bg-[#f0f4f8]" dir="rtl">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-lg p-8">
        <div className="flex flex-col items-center mb-6">
          <div className="w-14 h-14 rounded-xl bg-[#1a56db] flex items-center justify-center text-white text-2xl font-bold">
            F
          </div>
          <h1 className="mt-4 text-2xl font-bold text-gray-800">FibertechOS</h1>
          <p className="text-sm text-gray-500 mt-1">מערכת ניהול תפעולית</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              מייל פיברטק
            </label>
            <input
              type="email"
              required
              autoFocus
              autoComplete="email"
              dir="ltr"
              className="w-full border border-[#e2e8f0] rounded-lg px-3 py-2 text-right focus:outline-none focus:ring-2 focus:ring-[#1a56db]/30 focus:border-[#1a56db]"
              placeholder="you@fibertech.co.il"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              סיסמה
            </label>
            <input
              type="password"
              required
              autoComplete="current-password"
              dir="ltr"
              className="w-full border border-[#e2e8f0] rounded-lg px-3 py-2 text-right focus:outline-none focus:ring-2 focus:ring-[#1a56db]/30 focus:border-[#1a56db]"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={pending}
            className="w-full bg-[#1a56db] text-white font-medium py-2.5 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {pending ? 'מתחבר...' : 'התחברות'}
          </button>
        </form>

        <div className="mt-6 pt-6 border-t border-gray-100 space-y-2 text-sm text-center">
          <Link href="/forgot-password" className="text-[#1a56db] hover:underline block">
            שכחתי סיסמה
          </Link>
          <Link href="/request-access" className="text-gray-500 hover:text-gray-800 block">
            עובד חדש? בקשת גישה למערכת
          </Link>
        </div>
      </div>
    </div>
  );
}
