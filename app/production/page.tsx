'use client';

import { useEffect, useState, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Badge } from '@/components/ui/Badge';
import Icon, { type IconName } from '@/components/ui/Icon';

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
  { status: 'confirmed', label: 'הזמנה אושרה', docType: 'signed_order', docLabel: 'הזמנה חתומה', icon: 'note' as IconName },
  { status: 'in_production', label: 'בייצור', docType: 'signed_drawing', docLabel: 'שרטוט חתום', icon: 'drawings' as IconName },
  { status: 'delivered', label: 'סופק', docType: 'delivery_certificate', docLabel: 'תעודת משלוח', icon: 'truck' as IconName },
];

const STATUS_ORDER = ['pending', 'confirmed', 'in_production', 'delivered', 'completed'];

// Labels for the opposite-side (import) status chip. Mirrors ORDER_STATUS on /import.
const IMPORT_STATUS_LABEL: Record<string, { label: string; color: string }> = {
  draft: { label: 'טיוטה', color: 'bg-primary-50 text-primary' },
  planned: { label: 'מתוכננת', color: 'bg-azure-100 text-azure-600' },
  open: { label: 'פתוחה', color: 'bg-neutral-100 text-content-body' },
  confirmed: { label: 'אושרה', color: 'bg-azure-100 text-azure-600' },
  in_transit: { label: 'בשילוח', color: 'bg-primary-50 text-primary' },
  partially_received: { label: 'התקבלה חלקית', color: 'bg-warning-soft text-warning' },
  received: { label: 'התקבלה', color: 'bg-success-soft text-success' },
  closed: { label: 'נסגרה', color: 'bg-neutral-100 text-content-muted' },
};

export default function ProductionPage() {
  const supabase = createClient();
  const [orders, setOrders] = useState<any[]>([]);
  const [docsByOrder, setDocsByOrder] = useState<Record<string, any[]>>({});
  const [cross, setCross] = useState<Record<string, any>>({});
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

      // Cross-module link: pull the import side for these quotes (RLS-siloed, so
      // via a server route). Non-fatal — chips just won't show if it fails.
      if (quoteIds.length > 0) {
        try {
          const res = await fetch(`/api/deal/cross-status?quoteIds=${quoteIds.join(',')}`);
          if (res.ok) setCross((await res.json()).statuses || {});
        } catch { /* ignore */ }
      }
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
          <h1 className="text-2xl font-bold text-content-strong"><Icon name="production" size={24} /> ייצור</h1>
          <p className="text-sm text-content-muted mt-1">הזמנות שאושרו לייצור מכל הפרויקטים</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-content-muted">{activeOrders.length} הזמנות פעילות</span>
        </div>
      </div>

      {activeOrders.length === 0 && (
        <div className="bg-white rounded-xl border border-line-subtle p-12 text-center">
          <p className="mb-3 text-neutral-300"><Icon name="empty" size={40} /></p>
          <p className="text-content-muted">אין הזמנות פעילות כרגע</p>
          <p className="text-sm text-neutral-400 mt-1">הזמנות חדשות יופיעו כאן כאשר הצעת מחיר תסומן כנחתמה</p>
        </div>
      )}

      {activeOrders.length > 0 && (
        <div className="space-y-4 mb-8">
          {activeOrders.map((order) => (
            <OrderCard key={order.id} order={order} docs={docsByOrder[order.id] || []} cross={cross[order.quote_id]} onUpdate={loadData} />
          ))}
        </div>
      )}

      {completedOrders.length > 0 && (
        <div>
          <h2 className="text-lg font-bold text-content-body mb-3">הזמנות שהושלמו ({completedOrders.length})</h2>
          <div className="space-y-3 opacity-60">
            {completedOrders.map((order) => (
              <OrderCard key={order.id} order={order} docs={docsByOrder[order.id] || []} cross={cross[order.quote_id]} onUpdate={loadData} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function OrderCard({ order, docs, cross, onUpdate }: { order: any; docs: any[]; cross?: any; onUpdate: () => void }) {
  const supabase = createClient();
  const st = STATUS_MAP[order.status] || STATUS_MAP.pending;
  const imp = cross?.import;
  const impSt = imp ? (IMPORT_STATUS_LABEL[imp.status] || { label: imp.status, color: 'bg-neutral-100 text-content-body' }) : null;
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
            {isOverdue && <span className="text-[11px] px-2 py-0.5 rounded-full font-semibold bg-danger-soft text-danger"><Icon name="warning" size={14} /> באיחור</span>}
            {impSt && (
              <a href="/import" className="no-underline" title="הזמנת היבוא המקושרת (לפי הצעה)">
                <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${impSt.color}`}>
                  <Icon name="ship" size={14} /> יבוא: {impSt.label}{imp.eta ? ` · ETA ${formatDate(imp.eta)}` : ''}
                </span>
              </a>
            )}
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
                    <span><Icon name={step.icon} size={16} /></span>
                    <span className="font-medium">{step.label}</span>
                    <span className="text-success"><Icon name="confirm" size={14} /></span>
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
                    <span><Icon name={step.icon} size={16} /></span>
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
                  <span><Icon name={step.icon} size={16} /></span>
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
                <Icon name="refresh" size={14} /> איפוס
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Full production hand-off — live drawings/specs/details from the project */}
      <ProductionHandoff orderId={order.id} projectId={order.project_id} />
    </div>
  );
}

const DETAIL_FIELDS: { key: string; label: string; date?: boolean }[] = [
  { key: 'location', label: 'מיקום' },
  { key: 'project_type', label: 'סוג פרויקט' },
  { key: 'installation_type', label: 'סוג התקנה' },
  { key: 'special_requirements', label: 'דרישות מיוחדות' },
  { key: 'field_supervision', label: 'פיקוח שדה' },
  { key: 'soil_type', label: 'סוג קרקע' },
  { key: 'push_depth', label: 'עומק דחיקה' },
  { key: 'manhole_type', label: 'סוג שוחות' },
  { key: 'connection_method', label: 'אופן התחברות' },
  { key: 'winning_contractor', label: 'קבלן זוכה' },
  { key: 'order_received_date', label: 'קבלת הזמנה', date: true },
  { key: 'approved_order_date', label: 'הזמנה מאושרת', date: true },
  { key: 'pipe_installation_start', label: 'תחילת הנחת צנרת', date: true },
  { key: 'tender_submission_date', label: 'הגשת מכרז', date: true },
];

function ProductionHandoff({ orderId, projectId }: { orderId: string; projectId: string | null }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && !data && !loading) {
      setLoading(true);
      setErr(null);
      try {
        const res = await fetch(`/api/production/order-context?orderId=${orderId}`);
        const j = await res.json();
        if (!res.ok) setErr(j.error || 'שגיאה בטעינת נתוני הפרויקט');
        else setData(j);
      } catch {
        setErr('שגיאת רשת');
      } finally {
        setLoading(false);
      }
    }
  }

  function openFile(url: string | null) {
    if (url) window.open(url, '_blank', 'noopener');
  }

  if (!projectId) return null;

  return (
    <div className="border-t border-line-subtle">
      <button
        onClick={toggle}
        className="w-full flex items-center justify-between px-5 py-2.5 text-sm font-semibold text-content-body hover:bg-neutral-50 transition-colors"
      >
        <span><Icon name="clipboard" size={16} /> מסירה לייצור — שרטוטים, מפרטים ופרטי פרויקט</span>
        <span className={`text-content-muted transition-transform duration-fast ${open ? 'rotate-180' : ''}`}><Icon name="caretDown" size={14} /></span>
      </button>
      {open && (
        <div className="px-5 pb-4 pt-1 space-y-4">
          {loading && <p className="text-sm text-content-muted py-3">טוען נתוני פרויקט...</p>}
          {err && <p className="text-sm text-danger py-3">{err}</p>}
          {data && !loading && !err && <HandoffBody data={data} openFile={openFile} />}
        </div>
      )}
    </div>
  );
}

function HandoffBody({ data, openFile }: { data: any; openFile: (u: string | null) => void }) {
  const drawings: any[] = data.drawings || [];
  const specs: any[] = data.specs || [];
  const pipeSpecs: any[] = data.pipeSpecs || [];
  const details: any = data.details;
  const contacts: any[] = data.contacts || [];
  const pn = details?.project_number;

  if (!drawings.length && !specs.length && !pipeSpecs.length && !details && !contacts.length) {
    return <p className="text-sm text-content-muted py-2">אין נתוני פרויקט מקושרים להזמנה זו.</p>;
  }

  return (
    <>
      {(drawings.length > 0 || specs.length > 0) && (
        <div>
          <p className="text-[11px] text-neutral-400 mb-1.5">שרטוטים ומפרטים</p>
          <div className="flex flex-wrap gap-2">
            {drawings.map((d) => (
              <button
                key={d.id}
                onClick={() => openFile(d.signedUrl)}
                disabled={!d.signedUrl}
                className="inline-flex items-center gap-1.5 text-[12px] px-2.5 py-1 rounded-lg bg-azure-100 text-azure-600 border border-azure hover:bg-azure-100 transition-colors disabled:opacity-50"
              >
                <span><Icon name="drawings" size={14} /></span>
                <span dir="ltr">{pn && d.drawing_number ? `${pn}/${d.drawing_number}` : d.file_name}</span>
              </button>
            ))}
            {specs.map((s) => (
              <button
                key={s.id}
                onClick={() => openFile(s.signedUrl)}
                disabled={!s.signedUrl}
                className="inline-flex items-center gap-1.5 text-[12px] px-2.5 py-1 rounded-lg bg-warning-soft text-warning border border-warning hover:bg-warning-soft transition-colors disabled:opacity-50"
              >
                <span><Icon name="spec" size={14} /></span>
                <span>{s.file_name}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {pipeSpecs.length > 0 && (
        <div>
          <p className="text-[11px] text-neutral-400 mb-1.5">מפרט צינורות</p>
          <div className="overflow-x-auto">
            <table className="w-full text-[12px] text-right">
              <thead>
                <tr className="text-neutral-400">
                  <th className="font-medium pb-1 pl-3">קוטר (מ״מ)</th>
                  <th className="font-medium pb-1 pl-3">אורך קו (מ׳)</th>
                  <th className="font-medium pb-1 pl-3">אורך יחידה (מ׳)</th>
                  <th className="font-medium pb-1 pl-3">קשיחות (Pa)</th>
                  <th className="font-medium pb-1">לחץ (בר)</th>
                </tr>
              </thead>
              <tbody className="text-content-body">
                {pipeSpecs.map((ps) => (
                  <tr key={ps.id} className="border-t border-line-subtle">
                    <td className="py-1 pl-3" dir="ltr">{ps.diameter_mm ?? '—'}</td>
                    <td className="py-1 pl-3" dir="ltr">{ps.line_length_m ?? '—'}</td>
                    <td className="py-1 pl-3" dir="ltr">{ps.unit_length_m ?? '—'}</td>
                    <td className="py-1 pl-3" dir="ltr">{ps.stiffness_pascal ?? '—'}</td>
                    <td className="py-1" dir="ltr">{ps.pressure_bar ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {details && (
        <div>
          <p className="text-[11px] text-neutral-400 mb-1.5">פרטי פרויקט לייצור</p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-2">
            {DETAIL_FIELDS.filter((f) => details[f.key]).map((f) => (
              <div key={f.key}>
                <p className="text-[11px] text-neutral-400">{f.label}</p>
                <p className="text-[12px] text-content-body">{f.date ? formatDate(details[f.key]) : details[f.key]}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {contacts.length > 0 && (
        <div>
          <p className="text-[11px] text-neutral-400 mb-1.5">אנשי קשר</p>
          <div className="flex flex-wrap gap-2">
            {contacts.map((c) => (
              <div key={c.id} className="bg-neutral-50 rounded-lg px-2.5 py-1.5 text-[12px]">
                <div className="flex items-center gap-1.5">
                  <Badge variant="steel" size="sm">{c.role || '—'}</Badge>
                  <span className="font-semibold text-content-body">{c.name}</span>
                </div>
                {(c.phone || c.email) && (
                  <div className="text-content-muted mt-0.5" dir="ltr">
                    {c.phone || ''}{c.phone && c.email ? ' · ' : ''}{c.email || ''}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
