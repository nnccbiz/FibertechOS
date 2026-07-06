'use client';

/**
 * "סופק וממתין לחשבונית" — delivered goods whose invoice instruction was sent
 * to bookkeeping but no invoice was issued yet. Money on the floor.
 * Renders nothing for users without import:view (RLS returns no rows).
 */
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import Icon from '@/components/ui/Icon';

function daysSince(d: string | null) {
  return d ? Math.floor((Date.now() - new Date(d).getTime()) / 86400000) : 0;
}

export default function PendingInvoicesWidget() {
  const [rows, setRows] = useState<any[]>([]);
  const [projects, setProjects] = useState<Record<string, string>>({});
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const supabase = createClient();
        const { data, error } = await supabase
          .from('import_customer_deliveries')
          .select('id, project_id, delivery_note_number, sent_to_accounting_at, customer_name')
          .eq('sent_to_accounting', true)
          .eq('invoice_issued', false)
          .order('sent_to_accounting_at', { ascending: true })
          .limit(6);
        if (error || !data || data.length === 0) return;
        const ids = Array.from(new Set(data.map((d: any) => d.project_id).filter(Boolean)));
        if (ids.length) {
          const { data: projs } = await supabase.from('projects').select('id, name').in('id', ids);
          const pm: Record<string, string> = {};
          (projs || []).forEach((p: any) => { pm[p.id] = p.name; });
          setProjects(pm);
        }
        setRows(data);
        setVisible(true);
      } catch { /* stay hidden */ }
    })();
  }, []);

  if (!visible) return null;

  return (
    <div className="bg-white rounded-xl border border-warning p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-bold text-content-body"><Icon name="invoice" size={20} /> ממתין לחשבונית</h3>
        <a href="/deliveries" className="text-[12px] text-primary hover:underline">כל התעודות</a>
      </div>
      <div className="space-y-2">
        {rows.map((d) => {
          const days = daysSince(d.sent_to_accounting_at);
          return (
            <a key={d.id} href="/deliveries" className="block bg-warning-soft border border-warning rounded-lg px-3 py-2 no-underline hover:opacity-90">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-content-body">
                  <span dir="ltr">{d.delivery_note_number || '—'}</span>
                  {d.project_id && projects[d.project_id] ? ` · ${projects[d.project_id]}` : d.customer_name ? ` · ${d.customer_name}` : ''}
                </p>
                <span className={`text-[11px] font-bold ${days > 7 ? 'text-danger' : 'text-warning'}`}>{days} ימים</span>
              </div>
            </a>
          );
        })}
      </div>
    </div>
  );
}
