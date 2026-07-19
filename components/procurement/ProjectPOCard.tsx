'use client';

/**
 * Project-page rubric: the purchase orders behind this project — created in
 * /procurement, tracked in /import once sent. Read-only summary; RLS silently
 * hides it from users without the import module (the card then shows nothing).
 */
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import Icon from '@/components/ui/Icon';

function money(v: number | string | null | undefined, currency: string) {
  const n = Number(v) || 0;
  const cur = currency || 'ILS';
  try {
    return new Intl.NumberFormat(cur === 'ILS' ? 'he-IL' : 'en-US', { style: 'currency', currency: cur, maximumFractionDigits: 0 }).format(n);
  } catch {
    return `${n.toLocaleString()} ${cur}`;
  }
}

const IMPORT_STATUS: Record<string, string> = {
  draft: 'טיוטה', planned: 'מתוכננת', ordered: 'הוזמנה', in_production: 'בייצור',
  in_transit: 'בדרך', partially_received: 'התקבלה חלקית', received: 'התקבלה',
  open: 'פתוחה', closed: 'סגורה', cancelled: 'בוטלה',
};

export default function ProjectPOCard({ projectId }: { projectId: string }) {
  const supabase = createClient();
  const [pos, setPos] = useState<any[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('import_orders')
        .select('id, po_number, supplier_order_no, currency, total_amount, order_date, status, po_sent_at, suppliers(name)')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false });
      if (!cancelled) { setPos(data || []); setLoaded(true); }
    })();
    return () => { cancelled = true; };
  }, [projectId]);

  // No POs (or no import permission — RLS returns []) → don't render an empty box.
  if (!loaded || pos.length === 0) return null;

  return (
    <section className="bg-white rounded-xl border border-line-subtle p-5">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h2 className="text-lg font-bold text-content-body"><Icon name="procurement" size={20} /> הזמנות רכש</h2>
        <a href="/procurement" className="text-[13px] text-primary hover:underline">לעמוד הרכש ←</a>
      </div>
      <div className="space-y-2">
        {pos.map((po) => {
          const inProcurement = !po.po_sent_at;
          return (
            <a
              key={po.id}
              href={inProcurement ? '/procurement' : '/import'}
              className="flex items-center gap-3 bg-neutral-50 rounded-lg px-3 py-2.5 text-sm flex-wrap hover:bg-azure-100 transition-colors no-underline"
            >
              <span className="font-mono font-bold text-content-strong" dir="ltr">{po.po_number || po.supplier_order_no || '—'}</span>
              {inProcurement
                ? <span className="text-[11px] px-2 py-0.5 rounded-full font-semibold bg-warning-soft text-warning">בהכנה ברכש</span>
                : <span className="text-[11px] px-2 py-0.5 rounded-full font-semibold bg-success-soft text-success">נשלחה לספק · {IMPORT_STATUS[po.status] || po.status}</span>}
              <span className="text-content-body" dir="ltr">{(po.suppliers as any)?.name || ''}</span>
              <span className="flex-1" />
              <span className="font-semibold text-content-strong" dir="ltr">{money(po.total_amount, po.currency)}</span>
              {po.order_date && <span className="text-[12px] text-neutral-400">{new Date(po.order_date).toLocaleDateString('he-IL')}</span>}
            </a>
          );
        })}
      </div>
    </section>
  );
}
