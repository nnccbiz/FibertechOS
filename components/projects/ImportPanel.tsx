'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import Icon from '@/components/ui/Icon';

const ORDER_STATUS: Record<string, { label: string; color: string }> = {
  open: { label: 'פתוחה', color: 'bg-neutral-100 text-content-body' },
  confirmed: { label: 'אושרה', color: 'bg-azure-100 text-azure-600' },
  in_transit: { label: 'בשילוח', color: 'bg-primary-50 text-primary' },
  partially_received: { label: 'התקבלה חלקית', color: 'bg-warning-soft text-warning' },
  received: { label: 'התקבלה', color: 'bg-success-soft text-success' },
  closed: { label: 'נסגרה', color: 'bg-neutral-100 text-content-muted' },
};
const DOC_LABEL: Record<string, string> = {
  email: 'אימייל', order_confirmation: 'OC', proforma_invoice: 'PI', commercial_invoice: 'CI',
  packing_list: 'ת.משלוח', bl: 'BL', coa: 'COA', other: 'מסמך',
};

export default function ImportPanel({ projectId }: { projectId: string }) {
  const supabase = createClient();
  const [orders, setOrders] = useState<any[]>([]);
  const [docs, setDocs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: o } = await supabase.from('import_orders').select('*, suppliers(name)').eq('project_id', projectId).order('created_at', { ascending: false });
      const ords = o || [];
      setOrders(ords);
      if (ords.length) {
        const { data: d } = await supabase.from('import_documents').select('*').in('import_order_id', ords.map((x: any) => x.id)).order('created_at');
        setDocs(d || []);
      }
      setLoading(false);
    })();
  }, [projectId]);

  async function openDoc(d: any) {
    const w = window.open('about:blank', '_blank');
    const { data } = await supabase.storage.from('project-files').createSignedUrl(d.file_path, 300);
    if (data?.signedUrl) { if (w) w.location.href = data.signedUrl; else window.open(data.signedUrl, '_blank'); }
    else if (w) w.close();
  }

  if (loading || orders.length === 0) return null; // show only when the project has import activity

  return (
    <div className="bg-white rounded-2xl border border-line-subtle p-6 mb-6" dir="rtl">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-content-body"><Icon name="import" size={20} /> יבוא</h2>
        <a href="/import" className="text-[13px] text-primary hover:underline">פתח במודול היבוא <Icon name="external" size={14} /></a>
      </div>
      <div className="space-y-3">
        {orders.map((o) => {
          const st = ORDER_STATUS[o.status] || ORDER_STATUS.open;
          const oDocs = docs.filter((d) => d.import_order_id === o.id);
          return (
            <div key={o.id} className="border border-line-subtle rounded-xl p-3">
              <div className="flex items-center gap-3 flex-wrap mb-2">
                <span className="text-sm font-mono text-neutral-400" dir="ltr">{o.po_number || o.supplier_order_no || '—'}</span>
                <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${st.color}`}>{st.label}</span>
                {o.suppliers?.name && <span className="text-[12px] text-content-muted">{o.suppliers.name}</span>}
                {o.supplier_order_no && <span className="text-[11px] text-neutral-400" dir="ltr">Sales Order {o.supplier_order_no}</span>}
              </div>
              {oDocs.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {oDocs.map((d) => (
                    <button key={d.id} onClick={() => openDoc(d)} className="text-[11px] bg-neutral-50 hover:bg-azure-100 border border-line-subtle rounded px-2 py-1 text-content-body">
                      <Icon name="attach" size={14} /> {DOC_LABEL[d.doc_type] || d.doc_type}
                    </button>
                  ))}
                </div>
              ) : <p className="text-[12px] text-neutral-400">אין מסמכים עדיין</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
