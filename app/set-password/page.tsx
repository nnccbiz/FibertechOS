'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import {
  validatePassword,
  PASSWORD_REQUIREMENTS_HE,
} from '@/lib/auth/permissions';

export default function SetPasswordPage() {
  const router = useRouter();
  const [pw, setPw] = useState('');
  const [pwConfirm, setPwConfirm] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs = validatePassword(pw);
    if (pw !== pwConfirm) errs.push('הסיסמאות אינן זהות');
    if (errs.length) {
      setErrors(errs);
      return;
    }

    startTransition(async () => {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({
        password: pw,
        data: { must_change_password: false },
      });
      if (error) {
        setErrors([error.message]);
        return;
      }
      // Redirect to dashboard after successful password set
      router.push('/');
      router.refresh();
    });
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-page" dir="rtl">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-lg p-8">
        <div className="flex flex-col items-center mb-6">
          <div className="w-14 h-14 rounded-xl bg-primary flex items-center justify-center text-white text-2xl font-bold">
            F
          </div>
          <h1 className="mt-4 text-2xl font-bold text-content-strong">קביעת סיסמה</h1>
          <p className="text-sm text-content-muted mt-1 text-center">
            ברוך הבא ל-FibertechOS. בחר סיסמה שתעמוד בכללים הבאים:
          </p>
        </div>

        <ul className="text-[13px] text-content-body list-disc list-inside mb-5 space-y-0.5">
          {PASSWORD_REQUIREMENTS_HE.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-content-body mb-1">
              סיסמה חדשה
            </label>
            <input
              type="password"
              required
              dir="ltr"
              className="w-full border border-line-subtle rounded-lg px-3 py-2 text-right focus:outline-none focus:ring-2 focus:ring-primary-100"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-content-body mb-1">
              אימות סיסמה
            </label>
            <input
              type="password"
              required
              dir="ltr"
              className="w-full border border-line-subtle rounded-lg px-3 py-2 text-right focus:outline-none focus:ring-2 focus:ring-primary-100"
              value={pwConfirm}
              onChange={(e) => setPwConfirm(e.target.value)}
            />
          </div>

          {errors.length > 0 && (
            <div className="bg-danger-soft border border-danger text-danger text-sm rounded-lg px-3 py-2 space-y-0.5">
              {errors.map((e, i) => (
                <div key={i}>{e}</div>
              ))}
            </div>
          )}

          <button
            type="submit"
            disabled={pending}
            className="w-full bg-primary text-white font-medium py-2.5 rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50"
          >
            {pending ? 'שומר...' : 'קבע סיסמה והיכנס'}
          </button>
        </form>
      </div>
    </div>
  );
}
