'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { formatILS } from '@/lib/revenue';

const STATUS: Record<string, { label: string; color: string }> = {
  draft: { label: 'טיוטה', color: 'bg-gray-100 text-gray-600' },
  sent: { label: 'נשלח', color: 'bg-blue-50 text-blue-700' },
  rejected: { label: 'נדחה', color: 'bg-red-50 text-red-600' },
  expired: { label: 'פג תוקף', color: 'bg-amber-50 text-amber-700' },
};
// Statuses selectable from the dashboard. "נחתם" (signed) is intentionally not
// here — signing triggers the downstream flow (production order, snapshots) and
// is done from the quote itself.
const SELECTABLE = ['draft', 'sent', 'rejected', 'expired'];

export default function OpenQuotesWidget() {
  const supabase = createClient();
  const router = useRouter();
  const [quotes, setQuotes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    const { data } = await supabase
      .from('quotes')
      .select('id, project_id, quote_number, client_name, total_amount, currency, status, updated_at, sent_at, projects(name)')
      .in('status', ['draft', 'sent'])
      .order('updated_at', { ascending: false });
    setQuotes(data || []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function changeStatus(q: any, newStatus: string) {
    if (newStatus === q.status) return;
    const patch: any = { status: newStatus, updated_at: new Date().toISOString() };
    if (newStatus === 'sent' && !q.sent_at) patch.sent_at = new Date().toISOString();
    await supabase.from('quotes').update(patch).eq('id', q.id);
    load();
  }

  return (
    <div className="bg-white rounded-xl border border-[#e2e8f0] p-5" dir="rtl">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-bold text-gray-700">📝 הצעות מחיר פתוחות</h3>
        <span className="text-sm text-gray-400">{quotes.length}</span>
      </div>

      {loading ? (
        <div className="space-y-2">{[1, 2, 3].map((i) => <div key={i} className="skeleton h-10 w-full" />)}</div>
      ) : quotes.length === 0 ? (
        <p className="text-gray-400 text-center py-4">אין הצעות פתוחות</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-gray-400 text-[11px] text-right border-b border-gray-100">
                <th className="font-medium pb-2">הצעה</th>
                <th className="font-medium pb-2">לקוח / פרויקט</th>
                <th className="font-medium pb-2">סכום</th>
                <th className="font-medium pb-2">סטטוס</th>
                <th className="pb-2"></th>
              </tr>
            </thead>
            <tbody>
              {quotes.map((q) => {
                const st = STATUS[q.status] || STATUS.draft;
                return (
                  <tr key={q.id} className="border-b border-gray-50 hover:bg-gray-50/60">
                    <td className="py-2 font-mono text-gray-500 whitespace-nowrap" dir="ltr">{q.quote_number || '—'}</td>
                    <td className="py-2 text-gray-700">
                      <button onClick={() => router.push(`/projects/${q.project_id}`)} className="hover:text-[#1a56db] hover:underline text-right">
                        {q.client_name || q.projects?.name || '—'}
                      </button>
                    </td>
                    <td className="py-2 text-gray-600 whitespace-nowrap">{formatILS(q.total_amount || 0)}</td>
                    <td className="py-2">
                      <select
                        value={SELECTABLE.includes(q.status) ? q.status : 'draft'}
                        onChange={(e) => changeStatus(q, e.target.value)}
                        className={`text-[11px] font-semibold rounded-full px-2 py-1 border-0 cursor-pointer ${st.color}`}
                      >
                        {SELECTABLE.map((s) => <option key={s} value={s}>{STATUS[s].label}</option>)}
                      </select>
                    </td>
                    <td className="py-2 text-left whitespace-nowrap">
                      {q.project_id && (
                        <button onClick={() => router.push(`/projects/${q.project_id}/quote/${q.id}`)} className="text-[12px] text-[#1a56db] hover:underline">פתח ↗</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
