'use client';

/**
 * Deal lifecycle strip — one glance at where the deal stands:
 * הצעה ← ייצור ← יבוא ← אספקה ← חשבונית
 * Self-contained: fetches its own data with the user's client, so RLS-siloed
 * stages (import) simply show as unknown for users without that module.
 */
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import Icon, { type IconName } from '@/components/ui/Icon';

type StageState = 'done' | 'current' | 'pending' | 'unknown';

interface Stage {
  key: string;
  label: string;
  icon: IconName;
  state: StageState;
  detail?: string;
}

const STATE_STYLE: Record<StageState, { circle: string; label: string }> = {
  done: { circle: 'bg-success text-white', label: 'text-success' },
  current: { circle: 'bg-azure-600 text-white ring-4 ring-azure-100', label: 'text-azure-600 font-bold' },
  pending: { circle: 'bg-neutral-100 text-neutral-400', label: 'text-neutral-400' },
  unknown: { circle: 'bg-neutral-50 text-neutral-300 border border-dashed border-line-strong', label: 'text-neutral-300' },
};

function heDate(d?: string | null) {
  return d ? new Date(d).toLocaleDateString('he-IL') : '';
}

export default function DealTimeline({ projectId }: { projectId: string }) {
  const [stages, setStages] = useState<Stage[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const sb = createClient();
        const { data: quotes } = await sb.from('quotes')
          .select('id, status, sent_at, quote_number, updated_at')
          .eq('project_id', projectId).order('created_at', { ascending: false });
        const qs = quotes || [];
        const signed = qs.find((q: any) => q.status === 'signed');
        const sent = qs.find((q: any) => q.status === 'sent');
        const quoteIds = qs.map((q: any) => q.id);

        const [ordersRes, importRes, delivRes] = await Promise.all([
          quoteIds.length ? sb.from('orders').select('id, status, quote_id').in('quote_id', quoteIds) : Promise.resolve({ data: [] } as any),
          sb.from('import_orders').select('id, status').eq('project_id', projectId),
          sb.from('import_customer_deliveries').select('id, signed, sent_to_accounting, invoice_issued, invoice_number, signed_at').eq('project_id', projectId),
        ]);
        if (cancelled) return;
        const orders = ordersRes.data || [];
        const importOrders = importRes.error ? null : (importRes.data || []);
        const deliveries = delivRes.error ? null : (delivRes.data || []);

        // 1. הצעה
        const quoteStage: Stage = signed
          ? { key: 'quote', label: 'הצעה נחתמה', icon: 'contract', state: 'done', detail: `${signed.quote_number || ''} · ${heDate(signed.sent_at)}` }
          : sent
            ? { key: 'quote', label: 'הצעה נשלחה', icon: 'contract', state: 'current', detail: heDate(sent.sent_at) }
            : { key: 'quote', label: 'הצעה', icon: 'contract', state: qs.length ? 'current' : 'pending', detail: qs.length ? 'טיוטה' : '' };

        // 2. ייצור
        const doneOrder = orders.find((o: any) => ['delivered', 'completed'].includes(o.status));
        const activeOrder = orders.find((o: any) => ['confirmed', 'in_production', 'pending'].includes(o.status));
        const prodStage: Stage = doneOrder
          ? { key: 'prod', label: 'ייצור הושלם', icon: 'production', state: 'done' }
          : activeOrder
            ? { key: 'prod', label: 'בייצור', icon: 'production', state: 'current' }
            : { key: 'prod', label: 'ייצור', icon: 'production', state: 'pending' };

        // 3. יבוא (RLS may hide this module from the viewer)
        const importStage: Stage = importOrders === null
          ? { key: 'import', label: 'יבוא', icon: 'import', state: 'unknown', detail: 'אין הרשאה' }
          : importOrders.length === 0
            ? { key: 'import', label: 'יבוא', icon: 'import', state: 'pending' }
            : importOrders.some((o: any) => ['received', 'closed'].includes(o.status))
              ? { key: 'import', label: 'סחורה התקבלה', icon: 'import', state: 'done' }
              : { key: 'import', label: 'יבוא בתהליך', icon: 'import', state: 'current' };

        // 4. אספקה + 5. חשבונית
        const delStage: Stage = deliveries === null
          ? { key: 'deliv', label: 'אספקה', icon: 'truck', state: 'unknown', detail: 'אין הרשאה' }
          : deliveries.some((d: any) => d.signed)
            ? { key: 'deliv', label: 'סופק ללקוח', icon: 'truck', state: 'done', detail: heDate(deliveries.find((d: any) => d.signed)?.signed_at) }
            : deliveries.length
              ? { key: 'deliv', label: 'אספקה בתהליך', icon: 'truck', state: 'current' }
              : { key: 'deliv', label: 'אספקה', icon: 'truck', state: 'pending' };

        const invStage: Stage = deliveries === null
          ? { key: 'inv', label: 'חשבונית', icon: 'invoice', state: 'unknown', detail: 'אין הרשאה' }
          : deliveries.some((d: any) => d.invoice_issued)
            ? { key: 'inv', label: 'חשבונית הופקה', icon: 'invoice', state: 'done', detail: deliveries.find((d: any) => d.invoice_issued)?.invoice_number || '' }
            : deliveries.some((d: any) => d.sent_to_accounting)
              ? { key: 'inv', label: 'אצל הנה"ח', icon: 'invoice', state: 'current' }
              : { key: 'inv', label: 'חשבונית', icon: 'invoice', state: 'pending' };

        setStages([quoteStage, prodStage, importStage, delStage, invStage]);
      } catch {
        if (!cancelled) setStages(null);
      }
    })();
    return () => { cancelled = true; };
  }, [projectId]);

  if (!stages) return null;
  // Nothing started at all → don't add noise to a fresh project page.
  if (stages.every((s) => s.state === 'pending' || s.state === 'unknown')) return null;

  return (
    <div className="bg-white rounded-2xl border border-line-subtle p-5 mb-6" dir="rtl">
      <h2 className="text-lg font-bold text-content-body mb-4"><Icon name="trend" size={20} /> ציר העסקה</h2>
      <div className="flex items-start justify-between overflow-x-auto gap-1">
        {stages.map((s, i) => (
          <div key={s.key} className="flex items-start flex-1 min-w-[90px]">
            <div className="flex flex-col items-center text-center flex-1">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${STATE_STYLE[s.state].circle}`}>
                {s.state === 'done' ? <Icon name="confirm" size={18} /> : <Icon name={s.icon} size={18} />}
              </div>
              <p className={`text-[12px] mt-1.5 ${STATE_STYLE[s.state].label}`}>{s.label}</p>
              {s.detail && <p className="text-[10px] text-neutral-400 mt-0.5" dir="ltr">{s.detail}</p>}
            </div>
            {i < stages.length - 1 && (
              <div className={`h-0.5 flex-shrink-0 w-6 md:w-10 mt-5 ${s.state === 'done' ? 'bg-success' : 'bg-line-subtle'}`} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
