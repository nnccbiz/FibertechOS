'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';

type Outcome =
  | { kind: 'success'; message: string }
  | { kind: 'error'; message: string };

const ERROR_MESSAGES: Record<string, string> = {
  invalid_domain:
    'ניתן לבקש גישה רק מכתובת מייל של פיברטק, מאיה גרופ או פריזמה.',
  already_pending:
    'בקשתך כבר נשלחה והיא ממתינה לאישור מנהל. הודעה תישלח אלייך במייל.',
  cooldown_active:
    'לא ניתן להגיש בקשה חדשה למייל זה כעת. נסה שוב בעוד 30 יום או פנה למנהל.',
  ip_rate_limit: 'יותר מדי בקשות מהרשת הזו. נסה שוב בעוד כשעה.',
  global_rate_limit:
    'המערכת עמוסה כרגע ומגבילה בקשות חדשות. נסה שוב בעוד כחצי שעה.',
  server_error: 'שגיאה במערכת. נסה שוב או פנה למנהל.',
};

export default function RequestAccessPage() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState('');
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [pending, startTransition] = useTransition();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setOutcome(null);

    startTransition(async () => {
      try {
        const res = await fetch('/api/access-requests', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            full_name: fullName.trim(),
            email: email.trim().toLowerCase(),
            phone: phone.trim(),
            requested_role: role.trim(),
          }),
        });

        const body = await res.json();

        if (!res.ok) {
          setOutcome({
            kind: 'error',
            message: ERROR_MESSAGES[body.code] || body.message || ERROR_MESSAGES.server_error,
          });
          return;
        }

        setOutcome({
          kind: 'success',
          message:
            'הבקשה נשלחה בהצלחה. המנהל יאשר אותה בהקדם ותישלח אלייך הודעה במייל עם לינק לקביעת סיסמה.',
        });

        setFullName('');
        setEmail('');
        setPhone('');
        setRole('');
      } catch {
        setOutcome({ kind: 'error', message: ERROR_MESSAGES.server_error });
      }
    });
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f0f4f8]" dir="rtl">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-lg p-8">
        <div className="flex flex-col items-center mb-6">
          <div className="w-14 h-14 rounded-xl bg-[#1a56db] flex items-center justify-center text-white text-2xl font-bold">
            F
          </div>
          <h1 className="mt-4 text-2xl font-bold text-gray-800">בקשת גישה למערכת</h1>
          <p className="text-sm text-gray-500 mt-1 text-center">
            מלא את הפרטים. המנהל יאשר את הבקשה ותקבל לינק לקביעת סיסמה במייל.
          </p>
        </div>

        {outcome?.kind === 'success' ? (
          <div className="bg-green-50 border border-green-200 text-green-800 rounded-lg p-4 text-sm">
            <p className="font-semibold">✓ הבקשה נשלחה</p>
            <p className="mt-1">{outcome.message}</p>
            <Link
              href="/login"
              className="mt-3 inline-block text-[#1a56db] hover:underline"
            >
              חזרה לדף התחברות ←
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                שם מלא
              </label>
              <input
                type="text"
                required
                className="w-full border border-[#e2e8f0] rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#1a56db]/30"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                מייל ארגוני
              </label>
              <input
                type="email"
                required
                pattern=".+@(fibertech\.co\.il|maya-group\.co\.il|prizma-ind\.co\.il)"
                title="חובה להשתמש במייל של פיברטק, מאיה גרופ או פריזמה"
                dir="ltr"
                className="w-full border border-[#e2e8f0] rounded-lg px-3 py-2 text-right focus:outline-none focus:ring-2 focus:ring-[#1a56db]/30"
                placeholder="you@fibertech.co.il"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <p className="text-[11px] text-gray-400 mt-1">
                מותר: @fibertech.co.il · @maya-group.co.il · @prizma-ind.co.il
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                תפקיד בחברה
              </label>
              <input
                type="text"
                required
                className="w-full border border-[#e2e8f0] rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#1a56db]/30"
                placeholder="למשל: ייבוא, שדה, כספים..."
                value={role}
                onChange={(e) => setRole(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                טלפון
              </label>
              <input
                type="tel"
                dir="ltr"
                className="w-full border border-[#e2e8f0] rounded-lg px-3 py-2 text-right focus:outline-none focus:ring-2 focus:ring-[#1a56db]/30"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>

            {outcome?.kind === 'error' && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">
                {outcome.message}
              </div>
            )}

            <button
              type="submit"
              disabled={pending}
              className="w-full bg-[#1a56db] text-white font-medium py-2.5 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {pending ? 'שולח...' : 'שלח בקשה'}
            </button>

            <div className="text-sm text-center pt-3 border-t border-gray-100">
              <Link href="/login" className="text-gray-500 hover:text-gray-800">
                יש לי כבר גישה - התחברות
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
