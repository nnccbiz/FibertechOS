'use client';

import { useEffect, useState, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';

function formatCurrency(v: number) {
  return new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(v);
}

function formatDate(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('he-IL');
}

function calcDeadline(signedDate: string | null, deliveryTime: string | null): string | null {
  if (!signedDate) return null;
  const match = deliveryTime?.match(/(\d+)/);
  const days = match ? parseInt(match[1]) : 70;
  const deadline = new Date(signedDate);
  deadline.setDate(deadline.getDate() + days);
  return deadline.toISOString();
}

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  pending: { label: 'ממתין', color: 'bg-warning-soft text-warning' },
  confirmed: { label: 'הזמנה אושרה', color: 'bg-azure-100 text-azure-600' },
  in_production: { label: 'בייצור', color: 'bg-primary-50 text-primary' },
  delivered: { label: 'סופק', color: 'bg-success-soft text-success' },
  completed: { label: 'הושלם', color: 'bg-neutral-100 text-content-body' },
};

const STEPS = [
  { status: 'confirmed', label: 'הזמנה אושרה', docType: 'signed_order', docLabel: 'הזמנה חתומה', icon: '📝' },
  { status: 'in_production', label: 'בייצור', docType: 'signed_drawing', docLabel: 'שרטוט חתום', icon: '📐' },
  { status: 'delivered', label: 'סופק', docType: 'delivery_certificate', docLabel: 'תעודת משלוח', icon: '🚚' },
];

const STATUS_ORDER = ['pending', 'confirmed', 'in_production', 'delivered', 'completed'];

export default function ProductionPage() {
  const supabase = createClient();
  const [orders, setOrders] = useState<any[]>([]);
  const [docsByOrder, setDocsByOrder] = useState<Record<string, any[]>>({});
  const [loading, setLoading] = useState(true);

  async function loadData() {
    const { data: ordersData } = await supabase
      .from('orders')
      .select('*, quotes(*), projects(name, client_name, location)')
      .order('created_at', { ascending: false });

    if (ordersData) {
      const quoteIds = ordersData.map((o: any) => o.quote_id).filter(Boolean);
      let itemsByQuote: Record<string, any[]> = {};
      if (quoteIds.length > 0) {
        const { data: items } = await supabase
          .from('quote_items')
          .select('*')
          .in('quote_id', quoteIds)
          .order('sort_order');
        if (items) {
          items.forEach((item: any) => {
            if (!itemsByQuote[item.quote_id]) itemsByQuote[item.quote_id] = [];
            itemsByQuote[item.quote_id].push(item);
          });
        }
      }

      const orderIds = ordersData.map((o: any) => o.id);
      let docsMap: Record<string, any[]> = {};
      if (orderIds.length > 0) {
        const { data: docs } = await supabase
          .from('order_documents')
          .select('*')
          .in('order_id', orderIds)
          .order('created_at');
        if (docs) {
          docs.forEach((doc: any) => {
            if (!docsMap[doc.order_id]) docsMap[doc.order_id] = [];
            docsMap[doc.order_id].push(doc);
          });
        }
      }
      setDocsByOrder(docsMap);

      const enriched = ordersData.map((o: any) => ({
        ...o,
        items: itemsByQuote[o.quote_id] || [],
        deadline: calcDeadline(o.created_at, o.quotes?.delivery_time),
      }));
      setOrders(enriched);
    }
    setLoading(false);
  }

  useEffect(() => { loadData(); }, []);

  if (loading) {
    return (
      <div className="p-6" dir="rtl">
        <p className="text-neutral-400 text-center py-12">טוען הזמנות...</p>
      </div>
    );
  }

  const activeOrders = orders.filter((o) => o.status !== 'completed');
  const completedOrders = orders.filter((o) => o.status === 'completed');

  return (
    <div className="p-6 max-w-6xl mx-auto" dir="rtl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-content-strong">🏭 ייצור</h1>
          <p className="text-sm text-content-muted mt-1">הזמנות שאושרו לייצור מכל הפרויקטים</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-content-muted">{activeOrders.length} הזמנות פעילות</span>
        </div>
      </div>

      {activeOrders.length === 0 && (
        <div className="bg-white rounded-xl border border-line-subtle p-12 text-center">
          <p className="text-4xl mb-3">📭</p>
          <p className="text-content-muted">אין הזמנות פעילות כרגע</p>
          <p className="text-sm text-neutral-400 mt-1">הזמנות חדשות יופיעו כאן כאשר הצעת מחיר תסומן כנחתמה</p>
        </div>
      )}

      {activeOrders.length > 0 && (
        <div className="space-y-4 mb-8">
          {activeOrders.map((order) => (
            <OrderCard key={order.id} order={order} docs={docsByOrder[order.id] || []} onUpdate={loadData} />
          ))}
        </div>
      )}

      {completedOrders.length > 0 && (
        <div>
          <h2 className="text-lg font-bold text-content-body mb-3">הזמנות שהושלמו ({completedOrders.length})</h2>
          <div className="space-y-3 opacity-60">
            {completedOrders.map((order) => (
              <OrderCard key={order.id} order={order} docs={docsByOrder[order.id] || []} onUpdate={loadData} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function OrderCard({ order, docs, onUpdate }: { order: any; docs: any[]; onUpdate: () => void }) {
  const supabase = createClient();
  const st = STATUS_MAP[order.status] || STATUS_MAP.pending;
  const project = order.projects;
  const quote = order.quotes;
  const isOverdue = order.deadline && new Date(order.deadline) < new Date() && order.status !== 'completed' && order.status !== 'delivered';
  const [uploading, setUploading] = useState<string | null>(null);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const currentIdx = STATUS_ORDER.indexOf(order.status);

  function hasDoc(docType: string) {
    return docs.some((d) => d.doc_type === docType);
  }

  async function handleUploadAndAdvance(step: typeof STEPS[number], file: File) {
    setUploading(step.docType);
    try {
      const path = `orders/${order.id}/${step.docType}_${Date.now()}_${file.name}`;
      const { error: uploadErr } = await supabase.storage.from('project-files').upload(path, file);
      if (uploadErr) { alert('שגיאה בהעלאת הקובץ'); return; }

      await supabase.from('order_documents').insert({
        order_id: order.id,
        doc_type: step.docType,
        file_name: file.name,
        file_path: path,
      });

      await supabase.from('orders').update({
        status: step.status,
        updated_at: new Date().toISOString(),
      }).eq('id', order.id);

      onUpdate();
    } finally {
      setUploading(null);
    }
  }

  async function openDoc(doc: any) {
    const { data } = await supabase.storage.from('project-files').createSignedUrl(doc.file_path, 300);
    if (data?.signedUrl) window.open(data.signedUrl, '_blank');
  }

  async function handleReset() {
    if (!confirm('לאפס את ההזמנה לסטטוס ממתין? כל המסמכים שהועלו יימחקו.')) return;
    for (const doc of docs) {
      await supabase.storage.from('project-files').remove([doc.file_path]);
    }
    await supabase.from('order_documents').delete().eq('order_id', order.id);
    await supabase.from('orders').update({ status: 'pending', updated_at: new Date().toISOString() }).eq('id', order.id);
    onUpdate();
  }

  return (
    <div className={`bg-white rounded-xl border ${isOverdue ? 'border-danger' : 'border-line-subtle'} overflow-hidden`}>
      <div className="px-5 py-4">
        {/* Header row */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <span className="text-sm font-mono text-neutral-400">{order.order_number}</span>
            <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${st.color}`}>{st.label}</span>
            {isOverdue && <span className="text-[11px] px-2 py-0.5 rounded-full font-semibold bg-danger-soft text-danger">⚠️ באיחור</span>}
          </div>
          <span className="text-sm font-bold text-content-body">{formatCurrency(order.total_amount || 0)}</span>
        </div>

        {/* Info grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-3">
          <div>
            <p className="text-[11px] text-neutral-400 mb-0.5">לקוח</p>
            <p className="text-sm font-semibold text-content-body">{project?.client_name || quote?.client_name || '—'}</p>
          </div>
          <div>
            <p className="text-[11px] text-neutral-400 mb-0.5">פרויקט</p>
            <p className="text-sm font-semibold text-content-body">{project?.name || '—'}</p>
          </div>
          <div>
            <p className="text-[11px] text-neutral-400 mb-0.5">מועד הזמנה</p>
            <p className="text-sm text-content-body">{formatDate(order.created_at)}</p>
          </div>
          <div>
            <p className="text-[11px] text-neutral-400 mb-0.5">מועד אספקה אחרון</p>
            <p className={`text-sm font-semibold ${isOverdue ? 'text-danger' : 'text-content-body'}`}>{formatDate(order.deadline)}</p>
          </div>
        </div>

        {/* Items to produce */}
        {order.items.length > 0 && (
          <div className="border-t border-line-subtle pt-3 mb-3">
            <p className="text-[11px] text-neutral-400 mb-1.5">אביזרים לייצור</p>
            <div className="flex flex-wrap gap-2">
              {order.items.map((item: any) => (
                <div key={item.id} className="bg-neutral-50 rounded-lg px-2.5 py-1 text-[12px]">
                  <span className="text-content-body font-medium">{item.product_name}</span>
                  {item.dn_size && <span className="text-neutral-400 mr-1">({item.dn_size})</span>}
                  <span className="text-content-muted mr-1">× {item.quantity} {item.unit}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Status workflow */}
        <div className="border-t border-line-subtle pt-3">
          <div className="flex flex-wrap gap-2">
            {STEPS.map((step, idx) => {
              const stepIdx = STATUS_ORDER.indexOf(step.status);
              const isCompleted = currentIdx >= stepIdx;
              const isNext = stepIdx === currentIdx + 1;
              const doc = docs.find((d) => d.doc_type === step.docType);
              const isUploading = uploading === step.docType;

              if (isCompleted && doc) {
                return (
                  <button
                    key={step.docType}
                    onClick={() => openDoc(doc)}
                    className="flex items-center gap-1.5 text-[12px] px-3 py-1.5 rounded-lg bg-success-soft text-success border border-success hover:bg-success-soft transition-colors"
                  >
                    <span>{step.icon}</span>
                    <span className="font-medium">{step.label}</span>
                    <span className="text-success">✓</span>
                  </button>
                );
              }

              if (isNext && !isCompleted) {
                return (
                  <label
                    key={step.docType}
                    className={`flex items-center gap-1.5 text-[12px] px-3 py-1.5 rounded-lg border transition-colors ${
                      isUploading
                        ? 'bg-neutral-100 text-neutral-400 border-line-subtle cursor-wait'
                        : 'bg-azure-100 text-azure-600 border-azure hover:bg-azure-100 cursor-pointer'
                    }`}
                  >
                    <span>{step.icon}</span>
                    <span className="font-medium">{isUploading ? 'מעלה...' : step.label}</span>
                    <span className="text-[10px] text-azure">({step.docLabel})</span>
                    <input
                      ref={(el) => { fileInputRefs.current[step.docType] = el; }}
                      type="file"
                      className="hidden"
                      accept=".pdf,.png,.jpg,.jpeg,.doc,.docx"
                      disabled={isUploading}
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        await handleUploadAndAdvance(step, file);
                        e.target.value = '';
                      }}
                    />
                  </label>
                );
              }

              return (
                <div
                  key={step.docType}
                  className="flex items-center gap-1.5 text-[12px] px-3 py-1.5 rounded-lg bg-neutral-50 text-neutral-400 border border-line-subtle"
                >
                  <span>{step.icon}</span>
                  <span className="font-medium">{step.label}</span>
                  <span className="text-[10px]">({step.docLabel})</span>
                </div>
              );
            })}
            {currentIdx > 0 && (
              <button
                onClick={handleReset}
                className="flex items-center gap-1 text-[12px] px-3 py-1.5 rounded-lg bg-danger-soft text-danger border border-danger hover:bg-danger-soft transition-colors mr-auto"
              >
                🔄 איפוס
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
