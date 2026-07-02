'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { usePermissions } from '@/lib/auth/permissions-context';
import SmartUpload from '@/components/import/SmartUpload';

export const dynamic = 'force-dynamic';

// ---------- helpers ----------
function money(v: number | null | undefined, currency = 'USD') {
  if (v == null) return '—';
  try { return new Intl.NumberFormat('he-IL', { style: 'currency', currency, maximumFractionDigits: 0 }).format(v); }
  catch { return `${v} ${currency}`; }
}
function fmtDate(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('he-IL');
}
function num(v: any) { const n = parseFloat(v); return isNaN(n) ? 0 : n; }

const ORDER_STATUS: Record<string, { label: string; color: string }> = {
  draft: { label: 'טיוטה (מהצעה)', color: 'bg-purple-50 text-purple-700' },
  planned: { label: 'מתוכננת (תפ"י)', color: 'bg-teal-50 text-teal-700' },
  open: { label: 'פתוחה', color: 'bg-gray-100 text-gray-600' },
  confirmed: { label: 'אושרה', color: 'bg-blue-50 text-blue-700' },
  in_transit: { label: 'בשילוח', color: 'bg-indigo-50 text-indigo-700' },
  partially_received: { label: 'התקבלה חלקית', color: 'bg-amber-50 text-amber-700' },
  received: { label: 'התקבלה', color: 'bg-green-50 text-green-700' },
  closed: { label: 'נסגרה', color: 'bg-gray-100 text-gray-500' },
};
const ORDER_STATUS_KEYS = Object.keys(ORDER_STATUS);

const SHIPMENT_STATUS: Record<string, { label: string; color: string }> = {
  booked: { label: 'הוזמן', color: 'bg-gray-100 text-gray-600' },
  sailing: { label: 'בהפלגה', color: 'bg-blue-50 text-blue-700' },
  arrived: { label: 'הגיע לנמל', color: 'bg-indigo-50 text-indigo-700' },
  customs: { label: 'במכס', color: 'bg-amber-50 text-amber-700' },
  delivered: { label: 'שוחרר', color: 'bg-green-50 text-green-700' },
  closed: { label: 'נסגר', color: 'bg-gray-100 text-gray-500' },
};
const SHIPMENT_STATUS_KEYS = Object.keys(SHIPMENT_STATUS);

const DOC_TYPES = [
  { key: 'email', label: '📧 אימייל' },
  { key: 'order_confirmation', label: 'אישור הזמנה (OC)' },
  { key: 'proforma_invoice', label: 'חשבונית פרופורמה (PI)' },
  { key: 'commercial_invoice', label: 'חשבונית מסחרית (CI)' },
  { key: 'packing_list', label: 'תעודת משלוח / Packing List' },
  { key: 'bl', label: 'שטר מטען (BL)' },
  { key: 'coa', label: 'תעודת אנליזה (COA)' },
  { key: 'other', label: 'אחר' },
];
const DOC_LABEL: Record<string, string> = Object.fromEntries(DOC_TYPES.map((d) => [d.key, d.label]));
const CURRENCIES = ['USD', 'EUR', 'GBP', 'ILS'];

// ============================================================
// Page
// ============================================================
export default function ImportPage() {
  const supabase = createClient();
  const { canAccess } = usePermissions();
  const canEdit = canAccess('import', 'edit');
  const canDelete = canAccess('import', 'full');

  const [view, setView] = useState<'quotes' | 'orders' | 'shipments'>('quotes');
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>({
    orders: [], items: [], shipments: [], containers: [], packing: [],
    invoices: [], coa: [], docs: [], custDeliv: [], suppliers: [], projects: [], signedQuotes: [],
  });
  const [showNewOrder, setShowNewOrder] = useState(false);
  const [showNewShipment, setShowNewShipment] = useState(false);
  const [showSmart, setShowSmart] = useState(false);

  async function load() {
    const [o, it, sh, co, pk, inv, coa, doc, cd, sup, proj] = await Promise.all([
      supabase.from('import_orders').select('*, suppliers(name), projects(name, client_name)').order('created_at', { ascending: false }),
      supabase.from('import_order_items').select('*').order('sort_order'),
      supabase.from('import_shipments').select('*, suppliers(name)').order('created_at', { ascending: false }),
      supabase.from('import_containers').select('*').order('created_at'),
      supabase.from('import_packing_lines').select('*').order('created_at'),
      supabase.from('import_invoices').select('*').order('invoice_date'),
      supabase.from('import_coa').select('*').order('coa_date'),
      supabase.from('import_documents').select('*').order('created_at'),
      supabase.from('import_customer_deliveries').select('*').order('created_at'),
      supabase.from('suppliers').select('id, name').order('name'),
      supabase.from('projects').select('id, name, client_name').order('name'),
    ]);
    const { data: sq } = await supabase
      .from('quotes')
      .select('id, project_id, quote_number, client_name, total_amount, currency, status, sent_at, updated_at, created_at')
      .eq('status', 'signed')
      .order('updated_at', { ascending: false });
    setData({
      orders: o.data || [], items: it.data || [], shipments: sh.data || [], containers: co.data || [],
      packing: pk.data || [], invoices: inv.data || [], coa: coa.data || [], docs: doc.data || [],
      custDeliv: cd.data || [], suppliers: sup.data || [], projects: proj.data || [], signedQuotes: sq || [],
    });
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  if (loading) {
    return <div className="p-6" dir="rtl"><p className="text-gray-400 text-center py-12">טוען יבוא...</p></div>;
  }

  return (
    <div className="p-6 max-w-6xl mx-auto" dir="rtl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">🚢 יבוא</h1>
          <p className="text-sm text-gray-500 mt-1">הזמנות רכש, משלוחים ומכולות, מסמכים ואספקה</p>
        </div>
        <div className="flex items-center gap-2">
          {canEdit && (
            <button onClick={() => setShowSmart(true)} className="bg-gradient-to-l from-[#1a56db] to-indigo-500 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:opacity-90">⚡ העלאה חכמה</button>
          )}
          <div className="flex bg-gray-100 rounded-lg p-0.5">
            <button onClick={() => setView('quotes')} className={`text-[13px] px-3 py-1.5 rounded-md ${view === 'quotes' ? 'bg-white shadow-sm font-semibold text-gray-800' : 'text-gray-500'}`}>הצעות מאושרות</button>
            <button onClick={() => setView('orders')} className={`text-[13px] px-3 py-1.5 rounded-md ${view === 'orders' ? 'bg-white shadow-sm font-semibold text-gray-800' : 'text-gray-500'}`}>הזמנות</button>
            <button onClick={() => setView('shipments')} className={`text-[13px] px-3 py-1.5 rounded-md ${view === 'shipments' ? 'bg-white shadow-sm font-semibold text-gray-800' : 'text-gray-500'}`}>משלוחים</button>
          </div>
          {canEdit && view === 'orders' && (
            <button onClick={() => setShowNewOrder(true)} className="bg-[#1a56db] text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-blue-700">+ הזמנה</button>
          )}
          {canEdit && view === 'shipments' && (
            <button onClick={() => setShowNewShipment(true)} className="bg-[#1a56db] text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-blue-700">+ משלוח</button>
          )}
        </div>
      </div>

      {view === 'quotes' && <ApprovedQuotesView data={data} onSmartUpload={() => setShowSmart(true)} />}
      {view === 'orders' && <OrdersView data={data} canEdit={canEdit} canDelete={canDelete} onUpdate={load} />}
      {view === 'shipments' && <ShipmentsView data={data} canEdit={canEdit} canDelete={canDelete} onUpdate={load} />}

      {showNewOrder && <NewOrderModal data={data} onClose={() => setShowNewOrder(false)} onCreated={() => { setShowNewOrder(false); load(); }} />}
      {showNewShipment && <NewShipmentModal data={data} onClose={() => setShowNewShipment(false)} onCreated={() => { setShowNewShipment(false); load(); }} />}
      {showSmart && <SmartUpload data={data} onClose={() => setShowSmart(false)} onSaved={() => { setShowSmart(false); load(); }} />}
    </div>
  );
}

function Info({ label, value }: { label: string; value?: any }) {
  return (<div><p className="text-[11px] text-gray-400 mb-0.5">{label}</p><p className="text-sm font-semibold text-gray-700">{value || '—'}</p></div>);
}

// ============================================================
// Approved-quotes view — every signed quote + its import status
// ============================================================
function ApprovedQuotesView({ data, onSmartUpload }: any) {
  const [filter, setFilter] = useState<'all' | 'pending' | 'ordered'>('all');

  function orderFor(q: any) {
    return data.orders.find((o: any) => o.quote_id === q.id)
      || (q.project_id ? data.orders.find((o: any) => o.project_id && o.project_id === q.project_id) : null)
      || null;
  }
  const rows = data.signedQuotes.map((q: any) => ({ q, order: orderFor(q) }));
  const pendingCount = rows.filter((r: any) => !r.order).length;
  const shown = rows.filter((r: any) => filter === 'all' ? true : filter === 'pending' ? !r.order : !!r.order);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-5">
        <Chip label={`הכל (${rows.length})`} active={filter === 'all'} onClick={() => setFilter('all')} />
        <Chip label={`🔴 טרם הזמנת יבוא (${pendingCount})`} active={filter === 'pending'} onClick={() => setFilter('pending')} />
        <Chip label="עם הזמנת יבוא" active={filter === 'ordered'} onClick={() => setFilter('ordered')} />
      </div>

      {shown.length === 0 ? <Empty text="אין הצעות מאושרות להצגה" /> : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="bg-gray-50 text-gray-400 text-[11px] text-right">
                <th className="font-medium py-2 px-3">הצעה</th>
                <th className="font-medium py-2 px-3">לקוח</th>
                <th className="font-medium py-2 px-3">סכום</th>
                <th className="font-medium py-2 px-3">אושרה</th>
                <th className="font-medium py-2 px-3">סטטוס יבוא</th>
                <th className="font-medium py-2 px-3"></th>
              </tr>
            </thead>
            <tbody>
              {shown.map(({ q, order }: any) => {
                const st = order ? (ORDER_STATUS[order.status] || ORDER_STATUS.open) : null;
                return (
                  <tr key={q.id} className="border-t border-gray-100 hover:bg-gray-50/50">
                    <td className="py-2 px-3 font-mono text-gray-500" dir="ltr">{q.quote_number || '—'}</td>
                    <td className="py-2 px-3 text-gray-700">{q.client_name || '—'}</td>
                    <td className="py-2 px-3 text-gray-600">{money(q.total_amount, q.currency || 'ILS')}</td>
                    <td className="py-2 px-3 text-gray-500">{fmtDate(q.sent_at || q.updated_at)}</td>
                    <td className="py-2 px-3">
                      {order && st
                        ? <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${st.color}`}>{st.label}</span>
                        : <span className="text-[11px] px-2 py-0.5 rounded-full font-semibold bg-red-50 text-red-600">🔴 טרם הזמנת יבוא</span>}
                    </td>
                    <td className="py-2 px-3 text-left">
                      {!order
                        ? <button onClick={onSmartUpload} className="text-[12px] text-[#1a56db] hover:underline">פתח הזמנה ⚡</button>
                        : <span className="text-[11px] text-gray-400" dir="ltr">{order.supplier_order_no || order.po_number || ''}</span>}
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

// ============================================================
// Orders view
// ============================================================
function OrdersView({ data, canEdit, canDelete, onUpdate }: any) {
  const [filter, setFilter] = useState('active');
  const orders = data.orders.filter((o: any) => filter === 'all' ? true : filter === 'active' ? o.status !== 'closed' : o.status === filter);

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-5">
        <Chip label="פעילות" active={filter === 'active'} onClick={() => setFilter('active')} />
        <Chip label="הכל" active={filter === 'all'} onClick={() => setFilter('all')} />
        {ORDER_STATUS_KEYS.map((k) => <Chip key={k} label={ORDER_STATUS[k].label} active={filter === k} onClick={() => setFilter(k)} />)}
      </div>
      {orders.length === 0
        ? <Empty text="אין הזמנות יבוא" />
        : <div className="space-y-4">{orders.map((o: any) => <OrderCard key={o.id} order={o} data={data} canEdit={canEdit} canDelete={canDelete} onUpdate={onUpdate} />)}</div>}
    </div>
  );
}

function OrderCard({ order, data, canEdit, canDelete, onUpdate }: any) {
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'items' | 'invoices' | 'coa' | 'docs' | 'map'>('items');
  const st = ORDER_STATUS[order.status] || ORDER_STATUS.open;
  const items = data.items.filter((i: any) => i.import_order_id === order.id);
  const packing = data.packing.filter((p: any) => p.import_order_id === order.id);

  // received qty per item = sum of packing lines matched to that item (or by material/dn)
  function receivedFor(item: any) {
    return packing.filter((p: any) =>
      p.import_order_item_id === item.id ||
      (p.material_no && item.material_no && p.material_no === item.material_no) ||
      (!p.import_order_item_id && !p.material_no && p.dn && item.dn && p.dn === item.dn)
    ).reduce((s: number, p: any) => s + num(p.shipped_qty), 0);
  }

  async function setStatus(s: string) {
    await supabase.from('import_orders').update({ status: s, updated_at: new Date().toISOString() }).eq('id', order.id);
    onUpdate();
  }
  async function del() {
    if (!confirm('למחוק את ההזמנה? פעולה זו תמחק גם פריטים, חשבוניות ומסמכים מקושרים.')) return;
    if (!confirm('בטוח? לא ניתן לשחזר.')) return;
    await supabase.from('import_orders').delete().eq('id', order.id);
    onUpdate();
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-5 py-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-sm font-mono text-gray-400" dir="ltr">{order.po_number || order.supplier_order_no || '—'}</span>
            <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${st.color}`}>{st.label}</span>
            {order.is_stock && <span className="text-[11px] px-2 py-0.5 rounded-full font-semibold bg-amber-50 text-amber-700">מלאי</span>}
          </div>
          <span className="text-sm font-bold text-gray-700">{money(order.total_amount, order.currency)}</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-3">
          <Info label="ספק" value={order.suppliers?.name} />
          <Info label="פרויקט" value={order.is_stock ? 'מלאי' : (order.project_name || order.projects?.name || order.projects?.client_name)} />
          <Info label="הזמנת ספק" value={order.supplier_order_no} />
          <Info label="Incoterms" value={order.incoterms} />
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => setOpen(!open)} className="text-[12px] text-[#1a56db] font-medium hover:underline">
            {open ? 'הסתר ▲' : 'פריטים, חשבוניות, COA ומסמכים ▼'}
          </button>
          {canEdit && (
            <select value={order.status} onChange={(e) => setStatus(e.target.value)} className="text-[12px] border border-gray-200 rounded px-2 py-1 text-gray-600">
              {ORDER_STATUS_KEYS.map((k) => <option key={k} value={k}>{ORDER_STATUS[k].label}</option>)}
            </select>
          )}
          {canDelete && <button onClick={del} className="text-[12px] text-red-500 hover:underline mr-auto">מחיקה</button>}
        </div>
      </div>

      {open && (
        <div className="border-t border-gray-100 bg-gray-50/50 px-5 py-4">
          <div className="flex gap-2 mb-3 border-b border-gray-200">
            {([['items', 'פריטים'], ['invoices', 'חשבוניות'], ['coa', 'COA'], ['docs', 'מסמכים'], ['map', '🗺️ מפת קשרים']] as const).map(([k, l]) => (
              <button key={k} onClick={() => setTab(k)} className={`text-[13px] px-3 py-2 -mb-px border-b-2 ${tab === k ? 'border-[#1a56db] text-[#1a56db] font-semibold' : 'border-transparent text-gray-500'}`}>{l}</button>
            ))}
          </div>

          {tab === 'items' && (
            <div className="overflow-x-auto">
              {items.length === 0 ? <p className="text-[13px] text-gray-400 py-2">אין פריטים</p> : (
                <table className="w-full text-[13px]">
                  <thead><tr className="text-gray-400 text-[11px] text-right">
                    <th className="font-medium py-1">חומר</th><th className="font-medium py-1">תיאור</th>
                    <th className="font-medium py-1">DN</th><th className="font-medium py-1">PN</th><th className="font-medium py-1">SN</th>
                    <th className="font-medium py-1">הוזמן</th><th className="font-medium py-1">התקבל</th><th className="font-medium py-1">נותר</th><th className="font-medium py-1">מחיר</th>
                  </tr></thead>
                  <tbody>
                    {items.map((it: any) => {
                      const rec = receivedFor(it); const rem = num(it.ordered_qty) - rec;
                      const pct = it.ordered_qty ? Math.min(100, Math.round((rec / it.ordered_qty) * 100)) : 0;
                      return (
                        <tr key={it.id} className="border-t border-gray-100">
                          <td className="py-1.5 text-gray-500 font-mono" dir="ltr">{it.material_no || '—'}</td>
                          <td className="py-1.5 text-gray-700" dir="rtl">{it.description}</td>
                          <td className="py-1.5 text-gray-500" dir="ltr">{it.dn || '—'}</td>
                          <td className="py-1.5 text-gray-500" dir="ltr">{it.pn || '—'}</td>
                          <td className="py-1.5 text-gray-500" dir="ltr">{it.sn || '—'}</td>
                          <td className="py-1.5 text-gray-500">{it.ordered_qty} {it.unit}</td>
                          <td className="py-1.5 text-gray-700">{rec} {it.unit}</td>
                          <td className="py-1.5">
                            <span className={rem > 0 ? 'text-amber-600' : 'text-green-600'}>{Math.round(rem * 100) / 100}</span>
                            <div className="w-14 h-1 bg-gray-100 rounded-full mt-0.5 overflow-hidden"><div className={`h-full ${pct >= 100 ? 'bg-green-500' : 'bg-[#1a56db]'}`} style={{ width: `${pct}%` }} /></div>
                          </td>
                          <td className="py-1.5 text-gray-500">{money(it.unit_price, order.currency)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
              {packing.length > 0 && (
                <div className="mt-3">
                  <p className="text-[11px] text-gray-400 mb-1">משלוחים שהתקבלו (לפי מכולה)</p>
                  <div className="flex flex-wrap gap-2">
                    {packing.map((p: any) => {
                      const cont = data.containers.find((c: any) => c.id === p.container_id);
                      return <span key={p.id} className="text-[11px] bg-white border border-gray-200 rounded px-2 py-1" dir="ltr">{cont?.container_number || '—'}: {p.dn} × {p.shipped_qty}{p.unit} (DN {p.delivery_note_no})</span>;
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === 'invoices' && <InvoicesSection order={order} data={data} canEdit={canEdit} canDelete={canDelete} onUpdate={onUpdate} />}
          {tab === 'coa' && <CoaSection order={order} data={data} canEdit={canEdit} canDelete={canDelete} onUpdate={onUpdate} />}
          {tab === 'docs' && <DocsSection order={order} data={data} canEdit={canEdit} canDelete={canDelete} onUpdate={onUpdate} />}
          {tab === 'map' && <RelationshipMap order={order} data={data} />}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Relationship map — bidirectional document/entity links for a lot
// ============================================================
function RelationshipMap({ order, data }: any) {
  const supabase = createClient();
  const packing = data.packing.filter((p: any) => p.import_order_id === order.id);
  const invoices = data.invoices.filter((i: any) => i.import_order_id === order.id);
  const coa = data.coa.filter((c: any) => c.import_order_id === order.id);
  const orderDocs = data.docs.filter((d: any) => d.import_order_id === order.id);
  const contIds = new Set(packing.map((p: any) => p.container_id).filter(Boolean));
  const containers = data.containers.filter((c: any) => contIds.has(c.id));
  const shipIds = new Set(containers.map((c: any) => c.shipment_id).filter(Boolean));
  const shipments = data.shipments.filter((s: any) => shipIds.has(s.id));

  async function openPath(path: string) {
    const w = window.open('about:blank', '_blank');
    const { data: s } = await supabase.storage.from('project-files').createSignedUrl(path, 300);
    if (s?.signedUrl) { if (w) w.location.href = s.signedUrl; else window.open(s.signedUrl, '_blank'); }
    else if (w) w.close();
  }
  function docFor(predicate: (d: any) => boolean) {
    return [...orderDocs, ...data.docs.filter((d: any) => shipIds.has(d.shipment_id))].find(predicate);
  }

  const projectHref = order.project_id ? `/projects/${order.project_id}` : null;
  const projectLabel = order.is_stock ? 'מלאי' : (order.project_name || order.projects?.name || order.projects?.client_name || 'ללא פרויקט');

  return (
    <div className="text-[13px]">
      <p className="text-[11px] text-gray-400 mb-2">לחיצה על מסמך (📎) פותחת את המקור. הפרויקט מקשר חזרה לעמוד הפרויקט.</p>
      <div className="space-y-1">
        <Node icon="📁" color="bg-emerald-50 border-emerald-200 text-emerald-800" depth={0}>
          פרויקט: {projectHref ? <a href={projectHref} className="font-semibold underline hover:text-emerald-900">{projectLabel} ↗</a> : <span className="font-semibold">{projectLabel}</span>}
        </Node>
        <Node icon="📋" color="bg-blue-50 border-blue-200 text-blue-800" depth={1}>
          הזמנה: <span className="font-mono" dir="ltr">{order.po_number || order.supplier_order_no || '—'}</span>
          {order.supplier_order_no && <span className="text-blue-500 mr-2" dir="ltr">Sales Order {order.supplier_order_no}</span>}
        </Node>

        {invoices.map((iv: any) => {
          const d = docFor((x: any) => x.doc_type?.includes('invoice') && (x.doc_number === iv.invoice_no || x.file_name?.includes(iv.invoice_no)));
          return <Node key={iv.id} icon="🧾" color="bg-gray-50 border-gray-200 text-gray-700" depth={2} onClick={d ? () => openPath(d.file_path) : undefined}>
            חשבונית <span dir="ltr">{iv.invoice_no}</span>{iv.delivery_notes ? <span className="text-gray-400 mr-2" dir="ltr">→ ת.משלוח {iv.delivery_notes}</span> : ''}{d ? ' 📎' : ''}
          </Node>;
        })}
        {coa.map((c: any) => {
          const d = docFor((x: any) => x.doc_type === 'coa' && (x.doc_number === c.coa_no || x.file_name?.includes((c.coa_no || '').replace('/', '_'))));
          return <Node key={c.id} icon="🔬" color="bg-gray-50 border-gray-200 text-gray-700" depth={2} onClick={d ? () => openPath(d.file_path) : undefined}>
            COA <span dir="ltr">{c.coa_no}</span> <span className="text-gray-400" dir="ltr">DN{c.dn}</span>{c.delivery_notes ? <span className="text-gray-400 mr-2" dir="ltr">→ {c.delivery_notes}</span> : ''}{d ? ' 📎' : ''}
          </Node>;
        })}

        {shipments.map((s: any) => {
          const bl = data.docs.find((d: any) => d.shipment_id === s.id && d.doc_type === 'bl');
          return (
            <div key={s.id}>
              <Node icon="🚢" color="bg-indigo-50 border-indigo-200 text-indigo-800" depth={2} onClick={bl ? () => openPath(bl.file_path) : undefined}>
                משלוח BL <span dir="ltr">{s.bl_number || '—'}</span> <span className="text-indigo-400" dir="ltr">{s.vessel_name || ''}</span>{bl ? ' 📎' : ''}
              </Node>
              {containers.filter((c: any) => c.shipment_id === s.id).map((c: any) => {
                const lines = packing.filter((p: any) => p.container_id === c.id);
                return (
                  <div key={c.id}>
                    <Node icon="📦" color="bg-amber-50 border-amber-200 text-amber-800" depth={3}>
                      מכולה <span dir="ltr">{c.container_number}</span>{c.pieces ? <span className="text-amber-500 mr-1">· {c.pieces} צינ'</span> : ''}
                    </Node>
                    {lines.map((pl: any) => {
                      const d = pl.delivery_note_no ? docFor((x: any) => x.doc_type === 'packing_list' && x.file_name?.includes(pl.delivery_note_no)) : null;
                      return <Node key={pl.id} icon="📦" color="bg-white border-gray-200 text-gray-600" depth={4} onClick={d ? () => openPath(d.file_path) : undefined}>
                        <span dir="ltr">{pl.dn} × {pl.shipped_qty}{pl.unit}</span>{pl.delivery_note_no ? <span className="text-gray-400 mr-2" dir="ltr">ת.משלוח {pl.delivery_note_no}</span> : ''}{d ? ' 📎' : ''}
                      </Node>;
                    })}
                  </div>
                );
              })}
            </div>
          );
        })}

        {orderDocs.filter((d: any) => !d.doc_type?.includes('invoice') && d.doc_type !== 'coa' && d.doc_type !== 'bl' && d.doc_type !== 'packing_list').map((d: any) => (
          <Node key={d.id} icon="📄" color="bg-gray-50 border-gray-200 text-gray-600" depth={2} onClick={() => openPath(d.file_path)}>
            <span dir="ltr">{d.file_name}</span> 📎
          </Node>
        ))}
      </div>
    </div>
  );
}

function Node({ icon, color, depth, children, onClick }: any) {
  return (
    <div style={{ marginRight: `${depth * 18}px` }} className="flex items-center">
      {depth > 0 && <span className="text-gray-300 ml-1">└</span>}
      <span onClick={onClick} className={`inline-flex items-center gap-1.5 border rounded-lg px-2.5 py-1 ${color} ${onClick ? 'cursor-pointer hover:brightness-95' : ''}`}>
        <span>{icon}</span><span>{children}</span>
      </span>
    </div>
  );
}

// ---------- Invoices ----------
function InvoicesSection({ order, data, canEdit, canDelete, onUpdate }: any) {
  const supabase = createClient();
  const rows = data.invoices.filter((i: any) => i.import_order_id === order.id);
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState<any>({ invoice_no: '', invoice_type: 'commercial', invoice_date: '', net_value: '', freight: '', down_payment: '', final_amount: '' });
  async function add() {
    if (!f.invoice_no) return;
    await supabase.from('import_invoices').insert({
      import_order_id: order.id, invoice_no: f.invoice_no, invoice_type: f.invoice_type,
      invoice_date: f.invoice_date || null, currency: order.currency,
      net_value: f.net_value === '' ? null : Number(f.net_value), freight: f.freight === '' ? null : Number(f.freight),
      down_payment: f.down_payment === '' ? null : Number(f.down_payment), final_amount: f.final_amount === '' ? null : Number(f.final_amount),
    });
    setF({ invoice_no: '', invoice_type: 'commercial', invoice_date: '', net_value: '', freight: '', down_payment: '', final_amount: '' });
    setAdding(false); onUpdate();
  }
  async function del(id: string) { if (!confirm('למחוק חשבונית?')) return; await supabase.from('import_invoices').delete().eq('id', id); onUpdate(); }
  return (
    <div>
      {rows.length === 0 && <p className="text-[13px] text-gray-400 py-1">אין חשבוניות</p>}
      <div className="space-y-2">
        {rows.map((iv: any) => (
          <div key={iv.id} className="flex items-center justify-between bg-white border border-gray-200 rounded-lg px-3 py-2 text-[13px]">
            <div><span className="font-semibold text-gray-700" dir="ltr">🧾 {iv.invoice_no}</span><span className="text-gray-400 mr-2">{iv.invoice_type === 'proforma' ? 'PI' : 'CI'}</span><span className="text-gray-500 mr-2">{fmtDate(iv.invoice_date)}</span></div>
            <div className="flex items-center gap-3"><span className="text-gray-700 font-medium">{money(iv.final_amount ?? iv.net_value, iv.currency)}</span>{canDelete && <button onClick={() => del(iv.id)} className="text-red-400 hover:text-red-600">✕</button>}</div>
          </div>
        ))}
      </div>
      {canEdit && (adding ? (
        <div className="flex flex-wrap items-end gap-2 mt-3 bg-white p-3 rounded-lg border border-gray-200">
          <input placeholder="מס' חשבונית" value={f.invoice_no} onChange={(e) => setF({ ...f, invoice_no: e.target.value })} className="text-[13px] border border-gray-200 rounded px-2 py-1 w-36" dir="ltr" />
          <select value={f.invoice_type} onChange={(e) => setF({ ...f, invoice_type: e.target.value })} className="text-[13px] border border-gray-200 rounded px-2 py-1"><option value="commercial">CI</option><option value="proforma">PI</option><option value="advance">מקדמה</option></select>
          <input type="date" value={f.invoice_date} onChange={(e) => setF({ ...f, invoice_date: e.target.value })} className="text-[13px] border border-gray-200 rounded px-2 py-1" />
          <input placeholder="ערך נטו" type="number" value={f.net_value} onChange={(e) => setF({ ...f, net_value: e.target.value })} className="text-[13px] border border-gray-200 rounded px-2 py-1 w-24" />
          <input placeholder="freight" type="number" value={f.freight} onChange={(e) => setF({ ...f, freight: e.target.value })} className="text-[13px] border border-gray-200 rounded px-2 py-1 w-20" />
          <input placeholder="סופי" type="number" value={f.final_amount} onChange={(e) => setF({ ...f, final_amount: e.target.value })} className="text-[13px] border border-gray-200 rounded px-2 py-1 w-24" />
          <button onClick={add} className="bg-[#1a56db] text-white text-[12px] px-3 py-1.5 rounded">הוסף</button>
          <button onClick={() => setAdding(false)} className="text-[12px] text-gray-500 px-2">ביטול</button>
        </div>
      ) : <button onClick={() => setAdding(true)} className="text-[12px] text-[#1a56db] hover:underline mt-3">+ הוסף חשבונית</button>)}
    </div>
  );
}

// ---------- COA ----------
function CoaSection({ order, data, canEdit, canDelete, onUpdate }: any) {
  const supabase = createClient();
  const rows = data.coa.filter((c: any) => c.import_order_id === order.id);
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState<any>({ coa_no: '', coa_date: '', dn: '', pn: '', sn: '', delivery_notes: '', passed: true });
  async function add() {
    if (!f.coa_no) return;
    await supabase.from('import_coa').insert({ import_order_id: order.id, ...f, coa_date: f.coa_date || null });
    setF({ coa_no: '', coa_date: '', dn: '', pn: '', sn: '', delivery_notes: '', passed: true }); setAdding(false); onUpdate();
  }
  async function del(id: string) { if (!confirm('למחוק COA?')) return; await supabase.from('import_coa').delete().eq('id', id); onUpdate(); }
  return (
    <div>
      {rows.length === 0 && <p className="text-[13px] text-gray-400 py-1">אין תעודות אנליזה</p>}
      <div className="space-y-2">
        {rows.map((c: any) => (
          <div key={c.id} className="flex items-center justify-between bg-white border border-gray-200 rounded-lg px-3 py-2 text-[13px]">
            <div><span className="font-semibold text-gray-700" dir="ltr">🔬 {c.coa_no}</span><span className="text-gray-500 mr-2" dir="ltr">DN{c.dn} PN{c.pn} SN{c.sn}</span>{c.passed != null && <span className={c.passed ? 'text-green-600' : 'text-red-600'}>{c.passed ? '✓ עבר' : '✗ נכשל'}</span>}</div>
            {canDelete && <button onClick={() => del(c.id)} className="text-red-400 hover:text-red-600">✕</button>}
          </div>
        ))}
      </div>
      {canEdit && (adding ? (
        <div className="flex flex-wrap items-end gap-2 mt-3 bg-white p-3 rounded-lg border border-gray-200">
          <input placeholder="מס' COA" value={f.coa_no} onChange={(e) => setF({ ...f, coa_no: e.target.value })} className="text-[13px] border border-gray-200 rounded px-2 py-1 w-28" dir="ltr" />
          <input type="date" value={f.coa_date} onChange={(e) => setF({ ...f, coa_date: e.target.value })} className="text-[13px] border border-gray-200 rounded px-2 py-1" />
          <input placeholder="DN" value={f.dn} onChange={(e) => setF({ ...f, dn: e.target.value })} className="text-[13px] border border-gray-200 rounded px-2 py-1 w-16" dir="ltr" />
          <input placeholder="PN" value={f.pn} onChange={(e) => setF({ ...f, pn: e.target.value })} className="text-[13px] border border-gray-200 rounded px-2 py-1 w-14" dir="ltr" />
          <input placeholder="SN" value={f.sn} onChange={(e) => setF({ ...f, sn: e.target.value })} className="text-[13px] border border-gray-200 rounded px-2 py-1 w-16" dir="ltr" />
          <input placeholder="תעודות משלוח" value={f.delivery_notes} onChange={(e) => setF({ ...f, delivery_notes: e.target.value })} className="text-[13px] border border-gray-200 rounded px-2 py-1 w-40" dir="ltr" />
          <button onClick={add} className="bg-[#1a56db] text-white text-[12px] px-3 py-1.5 rounded">הוסף</button>
          <button onClick={() => setAdding(false)} className="text-[12px] text-gray-500 px-2">ביטול</button>
        </div>
      ) : <button onClick={() => setAdding(true)} className="text-[12px] text-[#1a56db] hover:underline mt-3">+ הוסף COA</button>)}
    </div>
  );
}

// ---------- Documents (shared by order + shipment) ----------
function DocsSection({ order, shipment, data, canEdit, canDelete, onUpdate }: any) {
  const supabase = createClient();
  const rows = data.docs.filter((d: any) => order ? d.import_order_id === order.id : d.shipment_id === shipment.id);
  const [uploading, setUploading] = useState(false);
  const [docType, setDocType] = useState('commercial_invoice');
  const ownerId = order ? order.id : shipment.id;
  const ownerCol = order ? 'import_order_id' : 'shipment_id';
  async function upload(file: File) {
    setUploading(true);
    try {
      const path = `import/${ownerCol}/${ownerId}/${docType}_${Date.now()}_${file.name}`;
      const { error } = await supabase.storage.from('project-files').upload(path, file);
      if (error) { alert('שגיאה בהעלאת הקובץ'); return; }
      await supabase.from('import_documents').insert({ [ownerCol]: ownerId, doc_type: docType, file_name: file.name, file_path: path });
      onUpdate();
    } finally { setUploading(false); }
  }
  async function openDoc(d: any) { const { data: s } = await supabase.storage.from('project-files').createSignedUrl(d.file_path, 300); if (s?.signedUrl) window.open(s.signedUrl, '_blank'); }
  async function del(d: any) { if (!confirm('למחוק מסמך?')) return; await supabase.storage.from('project-files').remove([d.file_path]); await supabase.from('import_documents').delete().eq('id', d.id); onUpdate(); }
  return (
    <div>
      {rows.length === 0 && <p className="text-[13px] text-gray-400 py-1">לא הועלו מסמכים</p>}
      <div className="flex flex-wrap gap-2">
        {rows.map((d: any) => (
          <div key={d.id} className="flex items-center gap-1.5 bg-white border border-gray-200 rounded-lg px-2.5 py-1.5">
            <button onClick={() => openDoc(d)} className="text-[12px] text-gray-700 hover:text-[#1a56db]">📄 <span className="font-medium">{DOC_LABEL[d.doc_type] || d.doc_type}</span> <span className="text-gray-400 mr-1" dir="ltr">{d.file_name}</span></button>
            {canDelete && <button onClick={() => del(d)} className="text-red-400 hover:text-red-600 text-[12px]">✕</button>}
          </div>
        ))}
      </div>
      {canEdit && (
        <div className="flex items-center gap-2 mt-3 bg-white p-2.5 rounded-lg border border-gray-200 w-fit">
          <select value={docType} onChange={(e) => setDocType(e.target.value)} className="text-[12px] border border-gray-200 rounded px-2 py-1">{DOC_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}</select>
          <label className={`text-[12px] px-3 py-1.5 rounded cursor-pointer ${uploading ? 'bg-gray-100 text-gray-400' : 'bg-blue-50 text-blue-700 hover:bg-blue-100'}`}>
            {uploading ? 'מעלה...' : '⬆ העלאה'}
            <input type="file" className="hidden" accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.xls,.xlsx" disabled={uploading} onChange={async (e) => { const f = e.target.files?.[0]; if (f) await upload(f); e.target.value = ''; }} />
          </label>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Shipments view
// ============================================================
function ShipmentsView({ data, canEdit, canDelete, onUpdate }: any) {
  const [filter, setFilter] = useState('active');
  const ships = data.shipments.filter((s: any) => filter === 'all' ? true : filter === 'active' ? s.status !== 'closed' : s.status === filter);
  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-5">
        <Chip label="פעילים" active={filter === 'active'} onClick={() => setFilter('active')} />
        <Chip label="הכל" active={filter === 'all'} onClick={() => setFilter('all')} />
        {SHIPMENT_STATUS_KEYS.map((k) => <Chip key={k} label={SHIPMENT_STATUS[k].label} active={filter === k} onClick={() => setFilter(k)} />)}
      </div>
      {ships.length === 0 ? <Empty text="אין משלוחים" /> : <div className="space-y-4">{ships.map((s: any) => <ShipmentCard key={s.id} shipment={s} data={data} canEdit={canEdit} canDelete={canDelete} onUpdate={onUpdate} />)}</div>}
    </div>
  );
}

function ShipmentCard({ shipment, data, canEdit, canDelete, onUpdate }: any) {
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [tracking, setTracking] = useState(false);
  const st = SHIPMENT_STATUS[shipment.status] || SHIPMENT_STATUS.booked;
  const containers = data.containers.filter((c: any) => c.shipment_id === shipment.id);
  async function setStatus(s: string) { await supabase.from('import_shipments').update({ status: s, updated_at: new Date().toISOString() }).eq('id', shipment.id); onUpdate(); }
  async function del() { if (!confirm('למחוק משלוח? המכולות שלו יימחקו.')) return; if (!confirm('בטוח?')) return; await supabase.from('import_shipments').delete().eq('id', shipment.id); onUpdate(); }

  function orderName(orderId: string) {
    const o = data.orders.find((x: any) => x.id === orderId);
    return o ? (o.project_name || o.projects?.name || o.po_number || o.supplier_order_no || 'הזמנה') : '—';
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-5 py-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-sm font-mono text-gray-400" dir="ltr">BL {shipment.bl_number || '—'}</span>
            <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${st.color}`}>{st.label}</span>
            <span className="text-[12px] text-gray-500">{containers.length} מכולות</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600" dir="ltr">{shipment.vessel_name}</span>
            {shipment.vessel_name && (
              <button onClick={() => setTracking(!tracking)} className={`text-[12px] px-2 py-0.5 rounded-full border ${tracking ? 'bg-cyan-600 text-white border-cyan-600' : 'bg-cyan-50 text-cyan-700 border-cyan-200 hover:bg-cyan-100'}`}>
                🛰️ אתר ספינה
              </button>
            )}
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-3">
          <Info label="ספק" value={shipment.suppliers?.name} />
          <Info label="נמלים" value={shipment.port_loading && shipment.port_discharge ? `${shipment.port_loading} → ${shipment.port_discharge}` : null} />
          <Info label="ETD" value={fmtDate(shipment.etd)} />
          <Info label="ETA" value={fmtDate(shipment.eta)} />
        </div>
        {tracking && <VesselTracker vesselName={shipment.vessel_name} />}
        <div className="flex items-center gap-3">
          <button onClick={() => setOpen(!open)} className="text-[12px] text-[#1a56db] font-medium hover:underline">{open ? 'הסתר ▲' : 'מכולות, תכולה ומסמכים ▼'}</button>
          {canEdit && <select value={shipment.status} onChange={(e) => setStatus(e.target.value)} className="text-[12px] border border-gray-200 rounded px-2 py-1 text-gray-600">{SHIPMENT_STATUS_KEYS.map((k) => <option key={k} value={k}>{SHIPMENT_STATUS[k].label}</option>)}</select>}
          {canDelete && <button onClick={del} className="text-[12px] text-red-500 hover:underline mr-auto">מחיקה</button>}
        </div>
      </div>

      {open && (
        <div className="border-t border-gray-100 bg-gray-50/50 px-5 py-4 space-y-4">
          <ContainersSection shipment={shipment} containers={containers} data={data} orderName={orderName} canEdit={canEdit} canDelete={canDelete} onUpdate={onUpdate} />
          <div>
            <p className="text-[12px] font-semibold text-gray-600 mb-2">מסמכי משלוח</p>
            <DocsSection shipment={shipment} data={data} canEdit={canEdit} canDelete={canDelete} onUpdate={onUpdate} />
          </div>
        </div>
      )}
    </div>
  );
}

function ContainersSection({ shipment, containers, data, orderName, canEdit, canDelete, onUpdate }: any) {
  const supabase = createClient();
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState<any>({ container_number: '', seal_number: '', pieces: '', gross_weight: '' });
  async function add() {
    if (!f.container_number) return;
    await supabase.from('import_containers').insert({ shipment_id: shipment.id, container_number: f.container_number, seal_number: f.seal_number || null, pieces: f.pieces === '' ? null : Number(f.pieces), gross_weight: f.gross_weight === '' ? null : Number(f.gross_weight) });
    setF({ container_number: '', seal_number: '', pieces: '', gross_weight: '' }); setAdding(false); onUpdate();
  }
  async function del(id: string) { if (!confirm('למחוק מכולה?')) return; await supabase.from('import_containers').delete().eq('id', id); onUpdate(); }
  return (
    <div>
      <p className="text-[12px] font-semibold text-gray-600 mb-2">מכולות ותכולה</p>
      {containers.length === 0 && <p className="text-[13px] text-gray-400 py-1">אין מכולות</p>}
      <div className="space-y-2">
        {containers.map((c: any) => {
          const lines = data.packing.filter((p: any) => p.container_id === c.id);
          return (
            <div key={c.id} className="bg-white border border-gray-200 rounded-lg px-3 py-2.5">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[13px] font-semibold text-gray-700" dir="ltr">📦 {c.container_number}{c.seal_number ? ` · חותם ${c.seal_number}` : ''}</span>
                <span className="text-[12px] text-gray-400">{c.pieces ? `${c.pieces} צינורות` : ''} {c.gross_weight ? `· ${c.gross_weight} ק"ג` : ''}{canDelete && <button onClick={() => del(c.id)} className="text-red-400 hover:text-red-600 mr-2">✕</button>}</span>
              </div>
              {lines.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {lines.map((p: any) => (
                    <span key={p.id} className="text-[11px] bg-gray-50 border border-gray-200 rounded px-2 py-0.5" dir="rtl">
                      <span className="text-gray-500">{orderName(p.import_order_id)}:</span> <span dir="ltr">{p.dn} × {p.shipped_qty}{p.unit}</span>
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {canEdit && (adding ? (
        <div className="flex flex-wrap items-end gap-2 mt-3 bg-white p-3 rounded-lg border border-gray-200">
          <input placeholder="מס' מכולה" value={f.container_number} onChange={(e) => setF({ ...f, container_number: e.target.value })} className="text-[13px] border border-gray-200 rounded px-2 py-1 w-40" dir="ltr" />
          <input placeholder="חותם" value={f.seal_number} onChange={(e) => setF({ ...f, seal_number: e.target.value })} className="text-[13px] border border-gray-200 rounded px-2 py-1 w-28" dir="ltr" />
          <input placeholder="צינורות" type="number" value={f.pieces} onChange={(e) => setF({ ...f, pieces: e.target.value })} className="text-[13px] border border-gray-200 rounded px-2 py-1 w-20" />
          <input placeholder='משקל ק"ג' type="number" value={f.gross_weight} onChange={(e) => setF({ ...f, gross_weight: e.target.value })} className="text-[13px] border border-gray-200 rounded px-2 py-1 w-24" />
          <button onClick={add} className="bg-[#1a56db] text-white text-[12px] px-3 py-1.5 rounded">הוסף</button>
          <button onClick={() => setAdding(false)} className="text-[12px] text-gray-500 px-2">ביטול</button>
        </div>
      ) : <button onClick={() => setAdding(true)} className="text-[12px] text-[#1a56db] hover:underline mt-3">+ הוסף מכולה</button>)}
    </div>
  );
}

// ============================================================
// Live vessel tracking — where is the ship, when does it reach
// Ashdod/Haifa. Data via /api/import/vessel-track (Datalastic when
// configured; external map links always).
// ============================================================
function VesselTracker({ vesselName }: { vesselName: string }) {
  const [state, setState] = useState<any>({ loading: true });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/import/vessel-track?vessel=${encodeURIComponent(vesselName)}`);
        const json = await res.json();
        if (!cancelled) setState({ loading: false, ...json });
      } catch {
        if (!cancelled) setState({ loading: false, error: 'fetch_failed' });
      }
    })();
    return () => { cancelled = true; };
  }, [vesselName]);

  const v = state.vessel;
  const fmtWhen = (iso: string | null) => iso ? new Date(iso).toLocaleString('he-IL', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' }) : null;

  return (
    <div className="bg-cyan-50/60 border border-cyan-100 rounded-lg px-4 py-3 mb-3 text-[13px]">
      {state.loading ? (
        <p className="text-cyan-700">🛰️ מאתר את {vesselName}...</p>
      ) : v ? (
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="font-semibold text-cyan-900" dir="ltr">🚢 {v.name}</span>
            {v.lat != null && (
              <a href={`https://www.google.com/maps?q=${v.lat},${v.lon}`} target="_blank" rel="noreferrer" className="text-cyan-700 underline" dir="ltr">
                {v.lat.toFixed(2)}°, {v.lon.toFixed(2)}°
              </a>
            )}
            {v.speed_kn > 0 && <span className="text-gray-600" dir="ltr">{v.speed_kn} kn</span>}
            {v.destination && <span className="text-gray-600">יעד מדווח: <b dir="ltr">{v.destination}</b></span>}
            {v.reported_eta && <span className="text-gray-600">ETA מדווח: {fmtWhen(v.reported_eta)}</span>}
          </div>
          {state.ports?.length > 0 && (
            <div className="flex flex-wrap gap-x-5 gap-y-1">
              {state.ports.map((p: any) => (
                <span key={p.key} className="text-gray-700">
                  ⚓ {p.name}: <b>{p.distance_nm.toLocaleString()}</b> מייל ימי
                  {p.eta_date ? <> · הגעה משוערת <b>{fmtWhen(p.eta_date)}</b></> : ' (הספינה עוגנת/איטית)'}
                </span>
              ))}
            </div>
          )}
          {v.last_position_at && <p className="text-[11px] text-gray-400">עדכון מיקום אחרון: {fmtWhen(v.last_position_at)}</p>}
        </div>
      ) : (
        <div className="space-y-1">
          <p className="text-gray-600">
            {state.configured === false
              ? 'מעקב חי לא מוגדר (חסר DATALASTIC_API_KEY) — אפשר לפתוח במפה חיצונית:'
              : `לא נמצא מידע חי על ${vesselName} — נסו במפה חיצונית:`}
          </p>
          {state.links && (
            <p className="flex gap-3">
              <a href={state.links.vesselfinder} target="_blank" rel="noreferrer" className="text-cyan-700 underline">VesselFinder ↗</a>
              <a href={state.links.marinetraffic} target="_blank" rel="noreferrer" className="text-cyan-700 underline">MarineTraffic ↗</a>
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ---------- shared bits ----------
function Chip({ label, active, onClick }: any) {
  return <button onClick={onClick} className={`text-[12px] px-3 py-1.5 rounded-full border ${active ? 'bg-[#1a56db] text-white border-[#1a56db]' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>{label}</button>;
}
function Empty({ text }: { text: string }) {
  return <div className="bg-white rounded-xl border border-gray-200 p-12 text-center"><p className="text-4xl mb-3">📦</p><p className="text-gray-500">{text}</p></div>;
}

// ============================================================
// Modals
// ============================================================
function NewOrderModal({ data, onClose, onCreated }: any) {
  const supabase = createClient();
  const [saving, setSaving] = useState(false);
  const [f, setF] = useState<any>({ po_number: '', supplier_id: '', project_id: '', is_stock: false, supplier_order_no: '', project_name: '', currency: 'USD', incoterms: '', payment_terms: '', total_amount: '', order_date: '' });
  async function create() {
    setSaving(true);
    try {
      const { error } = await supabase.from('import_orders').insert({
        po_number: f.po_number || null, supplier_id: f.supplier_id || null, project_id: f.is_stock ? null : (f.project_id || null),
        is_stock: f.is_stock, supplier_order_no: f.supplier_order_no || null, project_name: f.project_name || null,
        currency: f.currency, incoterms: f.incoterms || null, payment_terms: f.payment_terms || null,
        total_amount: f.total_amount === '' ? 0 : Number(f.total_amount), order_date: f.order_date || null,
      });
      if (error) { alert('שגיאה: ' + error.message); return; }
      onCreated();
    } finally { setSaving(false); }
  }
  return (
    <Modal title="הזמנת יבוא חדשה" onClose={onClose} onSave={create} saving={saving}>
      <Field label="מספר הזמנת רכש (שלנו)"><input value={f.po_number} onChange={(e) => setF({ ...f, po_number: e.target.value })} className={inp} dir="ltr" /></Field>
      <Field label="הזמנת ספק (Sales Order)"><input value={f.supplier_order_no} onChange={(e) => setF({ ...f, supplier_order_no: e.target.value })} className={inp} dir="ltr" /></Field>
      <Field label="ספק"><select value={f.supplier_id} onChange={(e) => setF({ ...f, supplier_id: e.target.value })} className={inp}><option value="">— בחר —</option>{data.suppliers.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
      <label className="flex items-center gap-2 col-span-2"><input type="checkbox" checked={f.is_stock} onChange={(e) => setF({ ...f, is_stock: e.target.checked })} /><span className="text-[13px] text-gray-600">יבוא למלאי (ללא פרויקט)</span></label>
      {!f.is_stock && <Field label="פרויקט" full><select value={f.project_id} onChange={(e) => setF({ ...f, project_id: e.target.value })} className={inp}><option value="">— בחר —</option>{data.projects.map((p: any) => <option key={p.id} value={p.id}>{p.name || p.client_name}</option>)}</select></Field>}
      <Field label="שם פרויקט אצל הספק" full><input value={f.project_name} onChange={(e) => setF({ ...f, project_name: e.target.value })} className={inp} placeholder="IL - Electra - Matash Stage 4" /></Field>
      <Field label="מטבע"><select value={f.currency} onChange={(e) => setF({ ...f, currency: e.target.value })} className={inp}>{CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}</select></Field>
      <Field label="סכום"><input type="number" value={f.total_amount} onChange={(e) => setF({ ...f, total_amount: e.target.value })} className={inp} /></Field>
      <Field label="Incoterms"><input value={f.incoterms} onChange={(e) => setF({ ...f, incoterms: e.target.value })} className={inp} placeholder="CIF Ashdod" /></Field>
      <Field label="תנאי תשלום"><input value={f.payment_terms} onChange={(e) => setF({ ...f, payment_terms: e.target.value })} className={inp} /></Field>
      <Field label="תאריך הזמנה"><input type="date" value={f.order_date} onChange={(e) => setF({ ...f, order_date: e.target.value })} className={inp} /></Field>
    </Modal>
  );
}

function NewShipmentModal({ data, onClose, onCreated }: any) {
  const supabase = createClient();
  const [saving, setSaving] = useState(false);
  const [f, setF] = useState<any>({ bl_number: '', supplier_id: '', carrier: '', vessel_name: '', voyage_no: '', port_loading: '', port_discharge: 'Ashdod', etd: '', eta: '' });
  async function create() {
    setSaving(true);
    try {
      const { error } = await supabase.from('import_shipments').insert({
        bl_number: f.bl_number || null, supplier_id: f.supplier_id || null, carrier: f.carrier || null,
        vessel_name: f.vessel_name || null, voyage_no: f.voyage_no || null, port_loading: f.port_loading || null,
        port_discharge: f.port_discharge || null, etd: f.etd || null, eta: f.eta || null,
      });
      if (error) { alert('שגיאה: ' + error.message); return; }
      onCreated();
    } finally { setSaving(false); }
  }
  return (
    <Modal title="משלוח חדש" onClose={onClose} onSave={create} saving={saving}>
      <Field label="שטר מטען / Booking"><input value={f.bl_number} onChange={(e) => setF({ ...f, bl_number: e.target.value })} className={inp} dir="ltr" /></Field>
      <Field label="ספק"><select value={f.supplier_id} onChange={(e) => setF({ ...f, supplier_id: e.target.value })} className={inp}><option value="">— בחר —</option>{data.suppliers.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
      <Field label="חברת ספנות"><input value={f.carrier} onChange={(e) => setF({ ...f, carrier: e.target.value })} className={inp} placeholder="Maersk" /></Field>
      <Field label="אוניה"><input value={f.vessel_name} onChange={(e) => setF({ ...f, vessel_name: e.target.value })} className={inp} dir="ltr" /></Field>
      <Field label="מס' הפלגה"><input value={f.voyage_no} onChange={(e) => setF({ ...f, voyage_no: e.target.value })} className={inp} dir="ltr" /></Field>
      <Field label="נמל טעינה"><input value={f.port_loading} onChange={(e) => setF({ ...f, port_loading: e.target.value })} className={inp} dir="ltr" /></Field>
      <Field label="נמל פריקה"><input value={f.port_discharge} onChange={(e) => setF({ ...f, port_discharge: e.target.value })} className={inp} dir="ltr" /></Field>
      <Field label="ETD"><input type="date" value={f.etd} onChange={(e) => setF({ ...f, etd: e.target.value })} className={inp} /></Field>
      <Field label="ETA"><input type="date" value={f.eta} onChange={(e) => setF({ ...f, eta: e.target.value })} className={inp} /></Field>
    </Modal>
  );
}

const inp = 'w-full text-sm border border-gray-200 rounded-md px-2 py-1.5 mt-0.5';
function Field({ label, children, full }: any) {
  return <label className={`block ${full ? 'col-span-2' : ''}`}><span className="text-[11px] text-gray-400">{label}</span>{children}</label>;
}
function Modal({ title, children, onClose, onSave, saving }: any) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" dir="rtl" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold text-gray-800 mb-4">{title}</h2>
        <div className="grid grid-cols-2 gap-3">{children}</div>
        <div className="flex gap-2 mt-5">
          <button onClick={onSave} disabled={saving} className="bg-[#1a56db] text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50">{saving ? 'שומר...' : 'שמירה'}</button>
          <button onClick={onClose} className="text-sm px-4 py-2 rounded-lg border border-gray-200 text-gray-600">ביטול</button>
        </div>
      </div>
    </div>
  );
}
