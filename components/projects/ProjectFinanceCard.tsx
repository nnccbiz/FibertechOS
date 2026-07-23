'use client';

/**
 * "כספים" rubric on the project page — the project's customer invoices with
 * live balances (customer_invoice_balances), open-debt total and a link to the
 * collections screen filtered to this project. Renders nothing when RLS hides
 * the rows (no import permission) or when the project has no invoices.
 */
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import Icon from '@/components/ui/Icon';

const TYPE_LABELS: Record<string, string> = {
  delivery: 'אספקה', advance: 'מקדמה', milestone: 'אבן דרך', final: 'חשבון סופי', proforma: 'פרופורמה', other: 'אחר',
};

function ils(n: number) {
  return new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(n || 0);
}
function fmtDate(d: string | null | undefined) {
  return d ? new Date(d).toLocaleDateString('he-IL') : '—';
}

export default function ProjectFinanceCard({ projectId }: { projectId: string }) {
  const [invoices, setInvoices] = useState<any[]>([]);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const supabase = createClient();
        const { data, error } = await supabase
          .from('customer_invoice_balances')
          .select('id, invoice_number, invoice_type, status, total_amount, paid_total, balance, payment_due_date, issued_at')
          .eq('project_id', projectId)
          .order('issued_at', { ascending: false });
        if (error || !data || data.length === 0) return;
        setInvoices(data);
        setVisible(true);
      } catch { /* stay hidden */ }
    })();
  }, [projectId]);

  if (!visible) return null;

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const isOpen = (i: any) => i.status === 'open' || i.status === 'partially_paid';
  const openTotal = invoices.filter(isOpen).reduce((s, i) => s + (Number(i.balance) || 0), 0);
  const overdue = invoices.filter((i) => isOpen(i) && i.payment_due_date && new Date(i.payment_due_date) < today);

  return (
    <div className="bg-white rounded-xl border border-line-subtle p-5 mb-6">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h2 className="text-lg font-bold text-content-strong m-0"><Icon name="money" size={20} /> כספים</h2>
        <div className="flex items-center gap-3">
          {openTotal > 0 && (
            <span className={`text-sm font-bold ft-figure ${overdue.length ? 'text-danger' : 'text-content-strong'}`} dir="ltr">
              {ils(openTotal)}
            </span>
          )}
          <a href={`/finance/collections?project=${projectId}`} className="text-[12px] text-primary hover:underline">למעקב הגבייה ←</a>
        </div>
      </div>
      <div className="space-y-1.5">
        {invoices.map((i) => {
          const open = isOpen(i);
          const late = open && i.payment_due_date && new Date(i.payment_due_date) < today;
          return (
            <div key={i.id} className="flex flex-wrap items-center justify-between gap-2 text-[13px] border-b border-line-subtle last:border-0 pb-1.5 last:pb-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-content-strong" dir="ltr">{i.invoice_number || 'ללא מספר'}</span>
                <span className="text-[11px] px-1.5 py-0.5 rounded bg-neutral-100 text-content-muted">{TYPE_LABELS[i.invoice_type] || i.invoice_type}</span>
                <span className="text-[12px] text-content-muted">{fmtDate(i.issued_at)}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-[12px]">
                <span className="ft-figure text-content-muted" dir="ltr">{ils(Number(i.total_amount))}</span>
                {open && <span className="ft-figure font-bold text-content-strong" dir="ltr">יתרה {ils(Number(i.balance))}</span>}
                {late && <span className="px-2 py-0.5 rounded-full bg-danger-soft text-danger text-[11px] font-semibold">בפיגור</span>}
                {i.status === 'paid' && <span className="px-2 py-0.5 rounded-full bg-success-soft text-success text-[11px] font-semibold">שולם</span>}
                {i.status === 'partially_paid' && <span className="px-2 py-0.5 rounded-full bg-azure-100 text-azure-600 text-[11px] font-semibold">שולם חלקית</span>}
                {i.status === 'cancelled' && <span className="px-2 py-0.5 rounded-full bg-neutral-100 text-content-muted text-[11px] font-semibold">בוטלה</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
