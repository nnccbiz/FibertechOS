'use client';

/**
 * "גבייה" — open customer-invoice balance + overdue slice, straight from the
 * customer_invoice_balances view. Renders nothing for users without
 * import:view (RLS returns no rows) or when there is nothing open.
 */
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import Icon from '@/components/ui/Icon';

function ils(n: number) {
  return new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(n || 0);
}

export default function CollectionsWidget() {
  const [totalOpen, setTotalOpen] = useState(0);
  const [totalOverdue, setTotalOverdue] = useState(0);
  const [overdueCount, setOverdueCount] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const supabase = createClient();
        const { data, error } = await supabase
          .from('customer_invoice_balances')
          .select('balance, payment_due_date, status')
          .in('status', ['open', 'partially_paid']);
        if (error || !data || data.length === 0) return;
        const today = new Date(); today.setHours(0, 0, 0, 0);
        let open = 0, overdue = 0, count = 0;
        data.forEach((r: any) => {
          const b = Number(r.balance) || 0;
          open += b;
          if (r.payment_due_date && new Date(r.payment_due_date) < today) { overdue += b; count += 1; }
        });
        setTotalOpen(open); setTotalOverdue(overdue); setOverdueCount(count);
        setVisible(true);
      } catch { /* stay hidden */ }
    })();
  }, []);

  if (!visible) return null;

  return (
    <div className={`bg-white rounded-xl border p-5 ${totalOverdue > 0 ? 'border-danger' : 'border-line-subtle'}`}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-bold text-content-body"><Icon name="money" size={20} /> גבייה</h3>
        <a href="/finance/collections" className="text-[12px] text-primary hover:underline">למסך הגבייה</a>
      </div>
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-[12px] text-content-muted">חוב פתוח</p>
          <p className="text-xl font-bold text-content-strong ft-figure" dir="ltr">{ils(totalOpen)}</p>
        </div>
        {totalOverdue > 0 && (
          <div className="text-left">
            <p className="text-[12px] text-danger font-semibold">{overdueCount} חשבוניות בפיגור</p>
            <p className="text-lg font-bold text-danger ft-figure" dir="ltr">{ils(totalOverdue)}</p>
          </div>
        )}
      </div>
    </div>
  );
}
