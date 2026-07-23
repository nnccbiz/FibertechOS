'use client';

/**
 * דוחות ותזרים — expected inflows (open customer invoices by due date) vs
 * expected outflows (open supplier invoices by due date, converted to ILS at
 * today's BoI rate), bucketed by month with a running balance. Requires
 * import:view (RLS hides the rows otherwise).
 */
import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import Icon from '@/components/ui/Icon';
import SectionTabs from '@/components/ui/SectionTabs';
import { FINANCE_TABS } from '@/lib/nav';
import { fetchExchangeRate } from '@/lib/exchange-rate';
import { MONTH_NAMES } from '@/lib/revenue';

function ils(n: number) {
  return new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(n || 0);
}

interface Bucket { key: string; label: string; inflow: number; outflow: number; }

export default function FinanceReportsPage() {
  const supabase = createClient();
  const [customerInvs, setCustomerInvs] = useState<any[]>([]);
  const [supplierInvs, setSupplierInvs] = useState<any[]>([]);
  const [rates, setRates] = useState<Record<string, number>>({ ILS: 1 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [{ data: cust }, { data: sup }] = await Promise.all([
        supabase.from('customer_invoice_balances')
          .select('balance, payment_due_date, status')
          .in('status', ['open', 'partially_paid']),
        supabase.from('supplier_invoice_balances')
          .select('balance, payment_due_date, payment_status, currency')
          .in('payment_status', ['open', 'partially_paid']),
      ]);
      setCustomerInvs(cust || []);
      setSupplierInvs(sup || []);
      // Rates for whatever foreign currencies actually appear.
      const curs = Array.from(new Set((sup || []).map((s: any) => s.currency).filter((c: any) => c && c !== 'ILS')));
      const r: Record<string, number> = { ILS: 1 };
      await Promise.all(curs.map(async (c: any) => {
        try { r[c] = (await fetchExchangeRate(c)).rate; } catch { r[c] = 0; }
      }));
      setRates(r);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { buckets, noDateIn, noDateOut, totalIn, totalOut, missingRate } = useMemo(() => {
    const map = new Map<string, Bucket>();
    let ndIn = 0, ndOut = 0, tIn = 0, tOut = 0, missing = false;
    const bucketFor = (d: string) => {
      const dt = new Date(d);
      const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
      if (!map.has(key)) {
        map.set(key, { key, label: `${MONTH_NAMES[dt.getMonth()]} ${dt.getFullYear()}`, inflow: 0, outflow: 0 });
      }
      return map.get(key)!;
    };
    customerInvs.forEach((r) => {
      const b = Number(r.balance) || 0;
      tIn += b;
      if (r.payment_due_date) bucketFor(r.payment_due_date).inflow += b;
      else ndIn += b;
    });
    supplierInvs.forEach((r) => {
      const rate = rates[r.currency || 'ILS'] ?? 0;
      if (!rate) { missing = true; return; }
      const b = (Number(r.balance) || 0) * rate;
      tOut += b;
      if (r.payment_due_date) bucketFor(r.payment_due_date).outflow += b;
      else ndOut += b;
    });
    const sorted = Array.from(map.values()).sort((a, b) => a.key.localeCompare(b.key));
    return { buckets: sorted, noDateIn: ndIn, noDateOut: ndOut, totalIn: tIn, totalOut: tOut, missingRate: missing };
  }, [customerInvs, supplierInvs, rates]);

  const maxFlow = Math.max(1, ...buckets.map((b) => Math.max(b.inflow, b.outflow)));
  let running = 0;

  return (
    <div className="p-6 max-w-6xl mx-auto" dir="rtl">
      <SectionTabs tabs={FINANCE_TABS} />
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-content-strong"><Icon name="reports" size={24} /> דוחות ותזרים</h1>
        <p className="text-sm text-content-muted mt-1">צפי תקבולים מלקוחות מול צפי תשלומים לספקים, לפי מועדי הפירעון (מט"ח בשער בנק ישראל של היום)</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
        <div className="bg-white rounded-xl border border-line-subtle p-4">
          <p className="text-[12px] text-content-muted">צפי תקבולים (חוב לקוחות פתוח)</p>
          <p className="text-xl font-bold text-success ft-figure" dir="ltr">{ils(totalIn)}</p>
        </div>
        <div className="bg-white rounded-xl border border-line-subtle p-4">
          <p className="text-[12px] text-content-muted">צפי תשלומים (חוב לספקים פתוח)</p>
          <p className="text-xl font-bold text-danger ft-figure" dir="ltr">{ils(totalOut)}</p>
        </div>
        <div className={`bg-white rounded-xl border p-4 ${totalIn - totalOut < 0 ? 'border-danger' : 'border-line-subtle'}`}>
          <p className="text-[12px] text-content-muted">מאזן צפוי</p>
          <p className={`text-xl font-bold ft-figure ${totalIn - totalOut < 0 ? 'text-danger' : 'text-content-strong'}`} dir="ltr">{ils(totalIn - totalOut)}</p>
        </div>
      </div>

      {missingRate && (
        <div className="bg-warning-soft border border-warning rounded-lg px-4 py-2.5 mb-4 text-[13px] text-content-body">
          <Icon name="warning" size={14} /> לא התקבל שער חליפין לחלק מחשבוניות הספק — הן לא נכללות בדוח.
        </div>
      )}

      {loading ? (
        <p className="text-neutral-400 text-center py-12">טוען…</p>
      ) : buckets.length === 0 && !noDateIn && !noDateOut ? (
        <div className="bg-white rounded-xl border border-line-subtle p-12 text-center">
          <p className="mb-3 text-neutral-300"><Icon name="empty" size={40} /></p>
          <p className="text-content-muted">אין חשבוניות פתוחות — התזרים ריק.</p>
          <p className="text-[13px] text-neutral-400 mt-2">הדוח נבנה מחשבוניות פתוחות ב<a href="/finance/collections" className="text-primary hover:underline">גבייה</a> וב<a href="/finance/suppliers" className="text-primary hover:underline">תשלומים לספקים</a>. חשבונית בלי מועד פירעון לא משובצת על ציר הזמן.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-line-subtle overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-neutral-50 text-neutral-400 text-[11px] text-right">
                  <th className="font-medium py-2 px-3">חודש</th>
                  <th className="font-medium py-2 px-3">תקבולים</th>
                  <th className="font-medium py-2 px-3">תשלומים</th>
                  <th className="font-medium py-2 px-3">נטו</th>
                  <th className="font-medium py-2 px-3">מצטבר</th>
                  <th className="font-medium py-2 px-3 min-w-[180px]"></th>
                </tr>
              </thead>
              <tbody>
                {buckets.map((b) => {
                  const net = b.inflow - b.outflow;
                  running += net;
                  const runningNow = running;
                  return (
                    <tr key={b.key} className="border-t border-line-subtle">
                      <td className="py-2 px-3 font-semibold text-content-strong whitespace-nowrap">{b.label}</td>
                      <td className="py-2 px-3 text-success ft-figure whitespace-nowrap" dir="ltr">{b.inflow ? ils(b.inflow) : '—'}</td>
                      <td className="py-2 px-3 text-danger ft-figure whitespace-nowrap" dir="ltr">{b.outflow ? ils(b.outflow) : '—'}</td>
                      <td className={`py-2 px-3 font-semibold ft-figure whitespace-nowrap ${net < 0 ? 'text-danger' : 'text-content-strong'}`} dir="ltr">{ils(net)}</td>
                      <td className={`py-2 px-3 font-bold ft-figure whitespace-nowrap ${runningNow < 0 ? 'text-danger' : 'text-content-strong'}`} dir="ltr">{ils(runningNow)}</td>
                      <td className="py-2 px-3">
                        <div className="flex flex-col gap-0.5">
                          <div className="h-2 rounded bg-success-soft" style={{ width: `${Math.round((b.inflow / maxFlow) * 100)}%`, minWidth: b.inflow ? 4 : 0 }} />
                          <div className="h-2 rounded bg-danger-soft" style={{ width: `${Math.round((b.outflow / maxFlow) * 100)}%`, minWidth: b.outflow ? 4 : 0 }} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {(noDateIn > 0 || noDateOut > 0) && (
                  <tr className="border-t border-line-subtle bg-neutral-50">
                    <td className="py-2 px-3 text-content-muted">ללא מועד פירעון</td>
                    <td className="py-2 px-3 text-success ft-figure" dir="ltr">{noDateIn ? ils(noDateIn) : '—'}</td>
                    <td className="py-2 px-3 text-danger ft-figure" dir="ltr">{noDateOut ? ils(noDateOut) : '—'}</td>
                    <td className="py-2 px-3" colSpan={3}>
                      <span className="text-[12px] text-content-muted">השלם מועדי פירעון ב<a href="/finance/collections" className="text-primary hover:underline">גבייה</a> / ב<a href="/finance/suppliers" className="text-primary hover:underline">תשלומים לספקים</a> כדי לשבץ אותן</span>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
