'use client';

import { useEffect, useState, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { usePermissions } from '@/lib/auth/permissions-context';

export const dynamic = 'force-dynamic';

// ---------- helpers ----------
function formatMoney(v: number | null, currency = 'EUR') {
  if (v == null) return '—';
  try {
    return new Intl.NumberFormat('he-IL', { style: 'currency', currency, maximumFractionDigits: 0 }).format(v);
  } catch {
    return `${v} ${currency}`;
  }
}
function formatDate(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('he-IL');
}

// ---------- constants ----------
const STAGES = [
  { key: 'po_sent', label: 'הזמנה נשלחה', icon: '📤' },
  { key: 'confirmed', label: 'אושר ע״י ספק', icon: '✅' },
  { key: 'booking', label: 'שריון אוניה', icon: '🛳️' },
  { key: 'sailing', label: 'בהפלגה', icon: '🌊' },
  { key: 'docs_received', label: 'מסמכים התקבלו', icon: '📄' },
  { key: 'at_port', label: 'הגיע לנמל', icon: '⚓' },
  { key: 'customs_cleared', label: 'שוחרר ממכס', icon: '🛃' },
  { key: 'delivered', label: 'סופק ללקוח', icon: '🚚' },
  { key: 'closed', label: 'נסגר', icon: '🔒' },
];
const STAGE_ORDER = STAGES.map((s) => s.key);
const STAGE_MAP: Record<string, { label: string; icon: string }> = Object.fromEntries(
  STAGES.map((s) => [s.key, { label: s.label, icon: s.icon }])
);

const DOC_TYPES = [
  { key: 'purchase_order', label: 'הזמנת רכש' },
  { key: 'order_confirmation', label: 'אישור הזמנה' },
  { key: 'packing_list', label: 'רשימת אריזה' },
  { key: 'commercial_invoice', label: 'חשבונית מסחרית' },
  { key: 'vgm', label: 'VGM' },
  { key: 'analysis', label: 'אנליזות' },
  { key: 'bl', label: 'שטר מטען (BL)' },
  { key: 'customs_account', label: 'גמר חשבון מכס' },
  { key: 'other', label: 'אחר' },
];
const DOC_LABEL: Record<string, string> = Object.fromEntries(DOC_TYPES.map((d) => [d.key, d.label]));

const CURRENCIES = ['EUR', 'USD', 'GBP', 'ILS'];

// ============================================================
// Page
// ============================================================
export default function ImportPage() {
  const supabase = createClient();
  const { canAccess } = usePermissions();
  const canEdit = canAccess('import', 'edit');

  const [orders, setOrders] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('active');
  const [showNew, setShowNew] = useState(false);

  async function loadData() {
    const [ordersRes, supRes, projRes] = await Promise.all([
      supabase
        .from('import_orders')
        .select('*, suppliers(name), projects(name, client_name)')
        .order('created_at', { ascending: false }),
      supabase.from('suppliers').select('id, name').order('name'),
      supabase.from('projects').select('id, name, client_name').order('name'),
    ]);
    setOrders(ordersRes.data || []);
    setSuppliers(supRes.data || []);
    setProjects(projRes.data || []);
    setLoading(false);
  }

  useEffect(() => { loadData(); }, []);

  if (loading) {
    return (
      <div className="p-6" dir="rtl">
        <p className="text-gray-400 text-center py-12">טוען הזמנות יבוא...</p>
      </div>
    );
  }

  const filtered = orders.filter((o) => {
    if (filter === 'active') return o.status !== 'closed';
    if (filter === 'all') return true;
    return o.status === filter;
  });

  return (
    <div className="p-6 max-w-6xl mx-auto" dir="rtl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">🚢 יבוא</h1>
          <p className="text-sm text-gray-500 mt-1">הזמנות רכש מספקים, מעקב משלוח, מסמכים ואספקה ללקוח</p>
        </div>
        {canEdit && (
          <button
            onClick={() => setShowNew(true)}
            className="bg-[#1a56db] text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
          >
            + הזמנת יבוא חדשה
          </button>
        )}
      </div>

      {/* filter chips */}
      <div className="flex flex-wrap gap-2 mb-5">
        <FilterChip label="פעילות" active={filter === 'active'} onClick={() => setFilter('active')} />
        <FilterChip label="הכל" active={filter === 'all'} onClick={() => setFilter('all')} />
        {STAGES.map((s) => (
          <FilterChip key={s.key} label={`${s.icon} ${s.label}`} active={filter === s.key} onClick={() => setFilter(s.key)} />
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <p className="text-4xl mb-3">📦</p>
          <p className="text-gray-500">אין הזמנות יבוא להצגה</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((order) => (
            <OrderCard key={order.id} order={order} canEdit={canEdit} canDelete={canAccess('import', 'full')} onUpdate={loadData} />
          ))}
        </div>
      )}

      {showNew && (
        <NewOrderModal
          suppliers={suppliers}
          projects={projects}
          onClose={() => setShowNew(false)}
          onCreated={() => { setShowNew(false); loadData(); }}
        />
      )}
    </div>
  );
}

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`text-[12px] px-3 py-1.5 rounded-full border transition-colors ${
        active ? 'bg-[#1a56db] text-white border-[#1a56db]' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
      }`}
    >
      {label}
    </button>
  );
}

// ============================================================
// Order card
// ============================================================
function OrderCard({ order, canEdit, canDelete, onUpdate }: { order: any; canEdit: boolean; canDelete: boolean; onUpdate: () => void }) {
  const supabase = createClient();
  const [expanded, setExpanded] = useState(false);
  const [tab, setTab] = useState<'items' | 'docs' | 'containers' | 'delivery'>('items');
  const stage = STAGE_MAP[order.status] || { label: order.status, icon: '•' };
  const currentIdx = STAGE_ORDER.indexOf(order.status);

  async function changeStatus(newStatus: string) {
    await supabase.from('import_orders').update({ status: newStatus, updated_at: new Date().toISOString() }).eq('id', order.id);
    onUpdate();
  }

  async function deleteOrder() {
    if (!confirm(`למחוק את הזמנת היבוא ${order.po_number || ''}? פעולה זו תמחק גם פריטים, מסמכים, מכולות ותעודות משלוח.`)) return;
    if (!confirm('האם אתה בטוח? לא ניתן לשחזר.')) return;
    await supabase.from('import_orders').delete().eq('id', order.id);
    onUpdate();
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-5 py-4">
        {/* header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-sm font-mono text-gray-400">{order.po_number || '—'}</span>
            <span className="text-[11px] px-2 py-0.5 rounded-full font-semibold bg-blue-50 text-blue-700">
              {stage.icon} {stage.label}
            </span>
            {order.is_stock ? (
              <span className="text-[11px] px-2 py-0.5 rounded-full font-semibold bg-amber-50 text-amber-700">יבוא מלאי</span>
            ) : null}
          </div>
          <span className="text-sm font-bold text-gray-700">{formatMoney(order.total_amount, order.currency)}</span>
        </div>

        {/* info grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-3">
          <Info label="ספק" value={order.suppliers?.name} />
          <Info label="פרויקט / לקוח" value={order.is_stock ? 'מלאי' : (order.projects?.name || order.projects?.client_name)} />
          <Info label="הפלגה (ETD)" value={formatDate(order.etd)} />
          <Info label="הגעה צפויה (ETA)" value={formatDate(order.eta)} />
        </div>

        {/* stage progress */}
        <div className="border-t border-gray-100 pt-3">
          <div className="flex flex-wrap gap-1.5">
            {STAGES.map((s, idx) => {
              const done = currentIdx >= idx;
              const isCurrent = currentIdx === idx;
              return (
                <button
                  key={s.key}
                  disabled={!canEdit}
                  onClick={() => canEdit && changeStatus(s.key)}
                  title={s.label}
                  className={`text-[11px] px-2 py-1 rounded-md border transition-colors ${
                    isCurrent
                      ? 'bg-[#1a56db] text-white border-[#1a56db]'
                      : done
                      ? 'bg-green-50 text-green-700 border-green-200'
                      : 'bg-gray-50 text-gray-400 border-gray-200'
                  } ${canEdit ? 'hover:opacity-80 cursor-pointer' : 'cursor-default'}`}
                >
                  {s.icon}
                </button>
              );
            })}
          </div>
        </div>

        {/* actions */}
        <div className="flex items-center gap-3 mt-3">
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-[12px] text-[#1a56db] font-medium hover:underline"
          >
            {expanded ? 'הסתר פרטים ▲' : 'פרטים, מסמכים, מכולות ואספקה ▼'}
          </button>
          {canDelete && (
            <button onClick={deleteOrder} className="text-[12px] text-red-500 hover:underline mr-auto">מחיקה</button>
          )}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-gray-100 bg-gray-50/50 px-5 py-4">
          {/* shipment / customs / invoice details */}
          <ShipmentDetails order={order} canEdit={canEdit} onUpdate={onUpdate} />

          {/* tabs */}
          <div className="flex gap-2 mt-4 mb-3 border-b border-gray-200">
            {([
              ['items', 'פריטים'],
              ['docs', 'מסמכים'],
              ['containers', 'מכולות'],
              ['delivery', 'תעודות משלוח'],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`text-[13px] px-3 py-2 -mb-px border-b-2 transition-colors ${
                  tab === key ? 'border-[#1a56db] text-[#1a56db] font-semibold' : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === 'items' && <ItemsSection orderId={order.id} currency={order.currency} canEdit={canEdit} canDelete={canDelete} />}
          {tab === 'docs' && <DocsSection orderId={order.id} canEdit={canEdit} canDelete={canDelete} />}
          {tab === 'containers' && <ContainersSection orderId={order.id} canEdit={canEdit} canDelete={canDelete} />}
          {tab === 'delivery' && <DeliverySection order={order} canEdit={canEdit} canDelete={canDelete} />}
        </div>
      )}
    </div>
  );
}

function Info({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <p className="text-[11px] text-gray-400 mb-0.5">{label}</p>
      <p className="text-sm font-semibold text-gray-700">{value || '—'}</p>
    </div>
  );
}

// ============================================================
// Shipment / customs / invoice editable details
// ============================================================
function ShipmentDetails({ order, canEdit, onUpdate }: { order: any; canEdit: boolean; onUpdate: () => void }) {
  const supabase = createClient();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<any>({
    confirmed_ship_date: order.confirmed_ship_date || '',
    booking_ref: order.booking_ref || '',
    vessel_name: order.vessel_name || '',
    bl_number: order.bl_number || '',
    etd: order.etd || '',
    eta: order.eta || '',
    port: order.port || '',
    customs_agent: order.customs_agent || '',
    customs_clearance_date: order.customs_clearance_date || '',
    customs_final_amount: order.customs_final_amount ?? '',
    supplier_invoice_number: order.supplier_invoice_number || '',
    supplier_invoice_amount: order.supplier_invoice_amount ?? '',
    invoice_matches_po: order.invoice_matches_po ?? false,
    carrier: order.carrier || '',
  });

  async function save() {
    const payload: any = { ...form, updated_at: new Date().toISOString() };
    // normalize empty strings to null for date/number cols
    ['confirmed_ship_date', 'etd', 'eta', 'customs_clearance_date'].forEach((k) => { if (!payload[k]) payload[k] = null; });
    ['customs_final_amount', 'supplier_invoice_amount'].forEach((k) => { payload[k] = payload[k] === '' ? null : Number(payload[k]); });
    await supabase.from('import_orders').update(payload).eq('id', order.id);
    setEditing(false);
    onUpdate();
  }

  if (!editing) {
    return (
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-[12px] font-semibold text-gray-600">פרטי משלוח, מכס וחשבונית</p>
          {canEdit && <button onClick={() => setEditing(true)} className="text-[12px] text-[#1a56db] hover:underline">עריכה</button>}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Info label="בוקינג / שריון" value={order.booking_ref} />
          <Info label="אוניה" value={order.vessel_name} />
          <Info label="שטר מטען (BL)" value={order.bl_number} />
          <Info label="נמל יעד" value={order.port} />
          <Info label="עמיל מכס" value={order.customs_agent} />
          <Info label="תאריך שחרור" value={formatDate(order.customs_clearance_date)} />
          <Info label="גמר חשבון מכס" value={order.customs_final_amount != null ? formatMoney(order.customs_final_amount, 'ILS') : '—'} />
          <Info label="מוביל" value={order.carrier} />
          <Info label="חשבונית ספק #" value={order.supplier_invoice_number} />
          <Info label="סכום חשבונית ספק" value={order.supplier_invoice_amount != null ? formatMoney(order.supplier_invoice_amount, order.currency) : '—'} />
          <Info label="תואמת הזמנת רכש?" value={order.invoice_matches_po == null ? '—' : order.invoice_matches_po ? 'כן ✓' : 'לא ✗'} />
        </div>
      </div>
    );
  }

  const Field = ({ k, label, type = 'text' }: { k: string; label: string; type?: string }) => (
    <label className="block">
      <span className="text-[11px] text-gray-400">{label}</span>
      <input
        type={type}
        value={form[k]}
        onChange={(e) => setForm({ ...form, [k]: e.target.value })}
        className="w-full text-sm border border-gray-200 rounded-md px-2 py-1.5 mt-0.5"
      />
    </label>
  );

  return (
    <div>
      <p className="text-[12px] font-semibold text-gray-600 mb-2">עריכת פרטי משלוח, מכס וחשבונית</p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Field k="confirmed_ship_date" label="תאריך יעד למשלוח" type="date" />
        <Field k="booking_ref" label="בוקינג / שריון" />
        <Field k="vessel_name" label="שם אוניה" />
        <Field k="bl_number" label="שטר מטען (BL)" />
        <Field k="etd" label="הפלגה (ETD)" type="date" />
        <Field k="eta" label="הגעה צפויה (ETA)" type="date" />
        <Field k="port" label="נמל יעד" />
        <Field k="carrier" label="מוביל" />
        <Field k="customs_agent" label="עמיל מכס" />
        <Field k="customs_clearance_date" label="תאריך שחרור" type="date" />
        <Field k="customs_final_amount" label="גמר חשבון מכס (₪)" type="number" />
        <Field k="supplier_invoice_number" label="חשבונית ספק #" />
        <Field k="supplier_invoice_amount" label="סכום חשבונית ספק" type="number" />
        <label className="flex items-center gap-2 mt-5">
          <input
            type="checkbox"
            checked={!!form.invoice_matches_po}
            onChange={(e) => setForm({ ...form, invoice_matches_po: e.target.checked })}
          />
          <span className="text-[12px] text-gray-600">חשבונית תואמת הזמנת רכש</span>
        </label>
      </div>
      <div className="flex gap-2 mt-3">
        <button onClick={save} className="bg-[#1a56db] text-white text-[13px] px-4 py-1.5 rounded-lg hover:bg-blue-700">שמירה</button>
        <button onClick={() => setEditing(false)} className="text-[13px] px-4 py-1.5 rounded-lg border border-gray-200 text-gray-600">ביטול</button>
      </div>
    </div>
  );
}

// ============================================================
// Items section — quantitative tracking
// ============================================================
function ItemsSection({ orderId, currency, canEdit, canDelete }: { orderId: string; currency: string; canEdit: boolean; canDelete: boolean }) {
  const supabase = createClient();
  const [items, setItems] = useState<any[]>([]);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<any>({ description: '', dn: '', unit: 'm', ordered_qty: '', unit_price: '' });

  async function load() {
    const { data } = await supabase.from('import_order_items').select('*').eq('import_order_id', orderId).order('sort_order');
    setItems(data || []);
  }
  useEffect(() => { load(); }, [orderId]);

  async function addItem() {
    if (!form.description) return;
    await supabase.from('import_order_items').insert({
      import_order_id: orderId,
      description: form.description,
      dn: form.dn || null,
      unit: form.unit || 'm',
      ordered_qty: form.ordered_qty === '' ? 0 : Number(form.ordered_qty),
      unit_price: form.unit_price === '' ? null : Number(form.unit_price),
      sort_order: items.length,
    });
    setForm({ description: '', dn: '', unit: 'm', ordered_qty: '', unit_price: '' });
    setAdding(false);
    load();
  }

  async function updateReceived(id: string, val: string) {
    await supabase.from('import_order_items').update({ received_qty: val === '' ? 0 : Number(val) }).eq('id', id);
    load();
  }

  async function removeItem(id: string) {
    if (!confirm('למחוק פריט זה?')) return;
    await supabase.from('import_order_items').delete().eq('id', id);
    load();
  }

  return (
    <div>
      {items.length === 0 && <p className="text-[13px] text-gray-400 py-2">אין פריטים</p>}
      {items.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-gray-400 text-[11px] text-right">
                <th className="font-medium py-1">תיאור</th>
                <th className="font-medium py-1">DN</th>
                <th className="font-medium py-1">הוזמן</th>
                <th className="font-medium py-1">התקבל</th>
                <th className="font-medium py-1">נותר</th>
                <th className="font-medium py-1">מחיר יח׳</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => {
                const remaining = (Number(it.ordered_qty) || 0) - (Number(it.received_qty) || 0);
                const pct = it.ordered_qty ? Math.min(100, Math.round((it.received_qty / it.ordered_qty) * 100)) : 0;
                return (
                  <tr key={it.id} className="border-t border-gray-100">
                    <td className="py-1.5 text-gray-700">{it.description}</td>
                    <td className="py-1.5 text-gray-500">{it.dn || '—'}</td>
                    <td className="py-1.5 text-gray-500">{it.ordered_qty} {it.unit}</td>
                    <td className="py-1.5">
                      {canEdit ? (
                        <input
                          type="number"
                          defaultValue={it.received_qty}
                          onBlur={(e) => updateReceived(it.id, e.target.value)}
                          className="w-20 border border-gray-200 rounded px-1.5 py-0.5 text-[12px]"
                        />
                      ) : (
                        <span>{it.received_qty} {it.unit}</span>
                      )}
                    </td>
                    <td className="py-1.5">
                      <span className={remaining > 0 ? 'text-amber-600' : 'text-green-600'}>{remaining} {it.unit}</span>
                      <div className="w-16 h-1 bg-gray-100 rounded-full mt-0.5 overflow-hidden">
                        <div className={`h-full ${pct >= 100 ? 'bg-green-500' : 'bg-[#1a56db]'}`} style={{ width: `${pct}%` }} />
                      </div>
                    </td>
                    <td className="py-1.5 text-gray-500">{it.unit_price != null ? formatMoney(it.unit_price, currency) : '—'}</td>
                    <td className="py-1.5 text-left">
                      {canDelete && <button onClick={() => removeItem(it.id)} className="text-red-400 hover:text-red-600 text-[12px]">✕</button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {canEdit && (adding ? (
        <div className="flex flex-wrap items-end gap-2 mt-3 bg-white p-3 rounded-lg border border-gray-200">
          <input placeholder="תיאור" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="text-[13px] border border-gray-200 rounded px-2 py-1 flex-1 min-w-[140px]" />
          <input placeholder="DN" value={form.dn} onChange={(e) => setForm({ ...form, dn: e.target.value })} className="text-[13px] border border-gray-200 rounded px-2 py-1 w-20" />
          <input placeholder="יח׳" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} className="text-[13px] border border-gray-200 rounded px-2 py-1 w-16" />
          <input placeholder="כמות" type="number" value={form.ordered_qty} onChange={(e) => setForm({ ...form, ordered_qty: e.target.value })} className="text-[13px] border border-gray-200 rounded px-2 py-1 w-24" />
          <input placeholder="מחיר יח׳" type="number" value={form.unit_price} onChange={(e) => setForm({ ...form, unit_price: e.target.value })} className="text-[13px] border border-gray-200 rounded px-2 py-1 w-24" />
          <button onClick={addItem} className="bg-[#1a56db] text-white text-[12px] px-3 py-1.5 rounded">הוסף</button>
          <button onClick={() => setAdding(false)} className="text-[12px] text-gray-500 px-2">ביטול</button>
        </div>
      ) : (
        <button onClick={() => setAdding(true)} className="text-[12px] text-[#1a56db] hover:underline mt-3">+ הוסף פריט</button>
      ))}
    </div>
  );
}

// ============================================================
// Documents section
// ============================================================
function DocsSection({ orderId, canEdit, canDelete }: { orderId: string; canEdit: boolean; canDelete: boolean }) {
  const supabase = createClient();
  const [docs, setDocs] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);
  const [docType, setDocType] = useState('purchase_order');
  const fileRef = useRef<HTMLInputElement | null>(null);

  async function load() {
    const { data } = await supabase.from('import_documents').select('*').eq('import_order_id', orderId).order('created_at');
    setDocs(data || []);
  }
  useEffect(() => { load(); }, [orderId]);

  async function upload(file: File) {
    setUploading(true);
    try {
      const path = `import/${orderId}/${docType}_${Date.now()}_${file.name}`;
      const { error } = await supabase.storage.from('project-files').upload(path, file);
      if (error) { alert('שגיאה בהעלאת הקובץ'); return; }
      await supabase.from('import_documents').insert({
        import_order_id: orderId,
        doc_type: docType,
        file_name: file.name,
        file_path: path,
      });
      load();
    } finally {
      setUploading(false);
    }
  }

  async function openDoc(d: any) {
    const { data } = await supabase.storage.from('project-files').createSignedUrl(d.file_path, 300);
    if (data?.signedUrl) window.open(data.signedUrl, '_blank');
  }

  async function removeDoc(d: any) {
    if (!confirm('למחוק מסמך זה?')) return;
    await supabase.storage.from('project-files').remove([d.file_path]);
    await supabase.from('import_documents').delete().eq('id', d.id);
    load();
  }

  return (
    <div>
      {docs.length === 0 && <p className="text-[13px] text-gray-400 py-2">לא הועלו מסמכים</p>}
      <div className="flex flex-wrap gap-2">
        {docs.map((d) => (
          <div key={d.id} className="flex items-center gap-1.5 bg-white border border-gray-200 rounded-lg px-2.5 py-1.5">
            <button onClick={() => openDoc(d)} className="text-[12px] text-gray-700 hover:text-[#1a56db]">
              📄 <span className="font-medium">{DOC_LABEL[d.doc_type] || d.doc_type}</span>
              <span className="text-gray-400 mr-1">{d.file_name}</span>
            </button>
            {canDelete && <button onClick={() => removeDoc(d)} className="text-red-400 hover:text-red-600 text-[12px]">✕</button>}
          </div>
        ))}
      </div>

      {canEdit && (
        <div className="flex items-center gap-2 mt-3 bg-white p-2.5 rounded-lg border border-gray-200 w-fit">
          <select value={docType} onChange={(e) => setDocType(e.target.value)} className="text-[12px] border border-gray-200 rounded px-2 py-1">
            {DOC_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
          </select>
          <label className={`text-[12px] px-3 py-1.5 rounded cursor-pointer ${uploading ? 'bg-gray-100 text-gray-400' : 'bg-blue-50 text-blue-700 hover:bg-blue-100'}`}>
            {uploading ? 'מעלה...' : '⬆ העלאה'}
            <input
              ref={fileRef}
              type="file"
              className="hidden"
              accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.xls,.xlsx"
              disabled={uploading}
              onChange={async (e) => { const f = e.target.files?.[0]; if (f) await upload(f); e.target.value = ''; }}
            />
          </label>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Containers section (basic)
// ============================================================
function ContainersSection({ orderId, canEdit, canDelete }: { orderId: string; canEdit: boolean; canDelete: boolean }) {
  const supabase = createClient();
  const [rows, setRows] = useState<any[]>([]);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<any>({ container_number: '', seal_number: '', contents: '', notes: '' });

  async function load() {
    const { data } = await supabase.from('import_containers').select('*').eq('import_order_id', orderId).order('created_at');
    setRows(data || []);
  }
  useEffect(() => { load(); }, [orderId]);

  async function add() {
    if (!form.container_number && !form.contents) return;
    await supabase.from('import_containers').insert({ import_order_id: orderId, ...form });
    setForm({ container_number: '', seal_number: '', contents: '', notes: '' });
    setAdding(false);
    load();
  }
  async function remove(id: string) {
    if (!confirm('למחוק מכולה זו?')) return;
    await supabase.from('import_containers').delete().eq('id', id);
    load();
  }

  return (
    <div>
      <p className="text-[11px] text-gray-400 mb-2">מבנה בסיסי. פירוט מלא פר-מכולה יתווסף לפי קובץ האקסל.</p>
      {rows.length === 0 && <p className="text-[13px] text-gray-400 py-1">אין מכולות</p>}
      <div className="space-y-2">
        {rows.map((c) => (
          <div key={c.id} className="flex items-center justify-between bg-white border border-gray-200 rounded-lg px-3 py-2">
            <div className="text-[13px]">
              <span className="font-semibold text-gray-700">📦 {c.container_number || '—'}</span>
              {c.seal_number && <span className="text-gray-400 mr-2">חותם: {c.seal_number}</span>}
              {c.contents && <span className="text-gray-500 mr-2">— {c.contents}</span>}
            </div>
            {canDelete && <button onClick={() => remove(c.id)} className="text-red-400 hover:text-red-600 text-[12px]">✕</button>}
          </div>
        ))}
      </div>
      {canEdit && (adding ? (
        <div className="flex flex-wrap items-end gap-2 mt-3 bg-white p-3 rounded-lg border border-gray-200">
          <input placeholder="מספר מכולה" value={form.container_number} onChange={(e) => setForm({ ...form, container_number: e.target.value })} className="text-[13px] border border-gray-200 rounded px-2 py-1 w-40" />
          <input placeholder="חותם" value={form.seal_number} onChange={(e) => setForm({ ...form, seal_number: e.target.value })} className="text-[13px] border border-gray-200 rounded px-2 py-1 w-32" />
          <input placeholder="תכולה" value={form.contents} onChange={(e) => setForm({ ...form, contents: e.target.value })} className="text-[13px] border border-gray-200 rounded px-2 py-1 flex-1 min-w-[140px]" />
          <button onClick={add} className="bg-[#1a56db] text-white text-[12px] px-3 py-1.5 rounded">הוסף</button>
          <button onClick={() => setAdding(false)} className="text-[12px] text-gray-500 px-2">ביטול</button>
        </div>
      ) : (
        <button onClick={() => setAdding(true)} className="text-[12px] text-[#1a56db] hover:underline mt-3">+ הוסף מכולה</button>
      ))}
    </div>
  );
}

// ============================================================
// Delivery notes section
// ============================================================
function DeliverySection({ order, canEdit, canDelete }: { order: any; canEdit: boolean; canDelete: boolean }) {
  const supabase = createClient();
  const [rows, setRows] = useState<any[]>([]);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<any>({ delivery_note_number: '', delivery_date: '', quantity_summary: '' });

  async function load() {
    const { data } = await supabase.from('import_delivery_notes').select('*').eq('import_order_id', order.id).order('created_at');
    setRows(data || []);
  }
  useEffect(() => { load(); }, [order.id]);

  async function add() {
    if (!form.delivery_note_number && !form.quantity_summary) return;
    await supabase.from('import_delivery_notes').insert({
      import_order_id: order.id,
      project_id: order.project_id || null,
      delivery_note_number: form.delivery_note_number || null,
      delivery_date: form.delivery_date || null,
      quantity_summary: form.quantity_summary || null,
    });
    setForm({ delivery_note_number: '', delivery_date: '', quantity_summary: '' });
    setAdding(false);
    load();
  }
  async function toggle(id: string, field: string, val: boolean) {
    await supabase.from('import_delivery_notes').update({ [field]: val }).eq('id', id);
    load();
  }
  async function setInvoiceNumber(id: string, val: string) {
    await supabase.from('import_delivery_notes').update({ invoice_number: val || null }).eq('id', id);
    load();
  }
  async function remove(id: string) {
    if (!confirm('למחוק תעודת משלוח זו?')) return;
    await supabase.from('import_delivery_notes').delete().eq('id', id);
    load();
  }

  return (
    <div>
      {rows.length === 0 && <p className="text-[13px] text-gray-400 py-1">אין תעודות משלוח</p>}
      <div className="space-y-2">
        {rows.map((d) => (
          <div key={d.id} className="bg-white border border-gray-200 rounded-lg px-3 py-2.5">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[13px] font-semibold text-gray-700">🚚 ת. משלוח {d.delivery_note_number || '—'}</span>
              <span className="text-[12px] text-gray-400">{formatDate(d.delivery_date)}</span>
            </div>
            {d.quantity_summary && <p className="text-[12px] text-gray-500 mb-2">{d.quantity_summary}</p>}
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-1.5 text-[12px] text-gray-600">
                <input type="checkbox" disabled={!canEdit} checked={!!d.signed} onChange={(e) => toggle(d.id, 'signed', e.target.checked)} />
                נחתם ע״י לקוח
              </label>
              <label className="flex items-center gap-1.5 text-[12px] text-gray-600">
                <input type="checkbox" disabled={!canEdit} checked={!!d.sent_to_accounting} onChange={(e) => toggle(d.id, 'sent_to_accounting', e.target.checked)} />
                הועבר להנה״ח
              </label>
              <label className="flex items-center gap-1.5 text-[12px] text-gray-600">
                <input type="checkbox" disabled={!canEdit} checked={!!d.invoice_issued} onChange={(e) => toggle(d.id, 'invoice_issued', e.target.checked)} />
                הופקה חשבונית מס
              </label>
              {d.invoice_issued && (
                canEdit ? (
                  <input
                    placeholder="מס׳ חשבונית"
                    defaultValue={d.invoice_number || ''}
                    onBlur={(e) => setInvoiceNumber(d.id, e.target.value)}
                    className="text-[12px] border border-gray-200 rounded px-2 py-0.5 w-32"
                  />
                ) : (
                  d.invoice_number && <span className="text-[12px] text-gray-500">חשבונית {d.invoice_number}</span>
                )
              )}
              {canDelete && <button onClick={() => remove(d.id)} className="text-red-400 hover:text-red-600 text-[12px] mr-auto">✕</button>}
            </div>
          </div>
        ))}
      </div>
      {canEdit && (adding ? (
        <div className="flex flex-wrap items-end gap-2 mt-3 bg-white p-3 rounded-lg border border-gray-200">
          <input placeholder="מספר תעודה" value={form.delivery_note_number} onChange={(e) => setForm({ ...form, delivery_note_number: e.target.value })} className="text-[13px] border border-gray-200 rounded px-2 py-1 w-32" />
          <input type="date" value={form.delivery_date} onChange={(e) => setForm({ ...form, delivery_date: e.target.value })} className="text-[13px] border border-gray-200 rounded px-2 py-1" />
          <input placeholder="סיכום כמות שסופקה" value={form.quantity_summary} onChange={(e) => setForm({ ...form, quantity_summary: e.target.value })} className="text-[13px] border border-gray-200 rounded px-2 py-1 flex-1 min-w-[160px]" />
          <button onClick={add} className="bg-[#1a56db] text-white text-[12px] px-3 py-1.5 rounded">הוסף</button>
          <button onClick={() => setAdding(false)} className="text-[12px] text-gray-500 px-2">ביטול</button>
        </div>
      ) : (
        <button onClick={() => setAdding(true)} className="text-[12px] text-[#1a56db] hover:underline mt-3">+ הוסף תעודת משלוח</button>
      ))}
    </div>
  );
}

// ============================================================
// New order modal
// ============================================================
function NewOrderModal({ suppliers, projects, onClose, onCreated }: { suppliers: any[]; projects: any[]; onClose: () => void; onCreated: () => void }) {
  const supabase = createClient();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<any>({
    po_number: '',
    supplier_id: '',
    project_id: '',
    is_stock: false,
    currency: 'EUR',
    total_amount: '',
    order_date: '',
    status: 'po_sent',
  });

  async function create() {
    setSaving(true);
    try {
      const { error } = await supabase.from('import_orders').insert({
        po_number: form.po_number || null,
        supplier_id: form.supplier_id || null,
        project_id: form.is_stock ? null : (form.project_id || null),
        is_stock: form.is_stock,
        currency: form.currency,
        total_amount: form.total_amount === '' ? 0 : Number(form.total_amount),
        order_date: form.order_date || null,
        status: form.status,
      });
      if (error) { alert('שגיאה ביצירת ההזמנה: ' + error.message); return; }
      onCreated();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" dir="rtl" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold text-gray-800 mb-4">הזמנת יבוא חדשה</h2>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-[11px] text-gray-400">מספר הזמנת רכש</span>
            <input value={form.po_number} onChange={(e) => setForm({ ...form, po_number: e.target.value })} className="w-full text-sm border border-gray-200 rounded-md px-2 py-1.5 mt-0.5" />
          </label>
          <label className="block">
            <span className="text-[11px] text-gray-400">ספק</span>
            <select value={form.supplier_id} onChange={(e) => setForm({ ...form, supplier_id: e.target.value })} className="w-full text-sm border border-gray-200 rounded-md px-2 py-1.5 mt-0.5">
              <option value="">— בחר ספק —</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2 col-span-2">
            <input type="checkbox" checked={form.is_stock} onChange={(e) => setForm({ ...form, is_stock: e.target.checked })} />
            <span className="text-[13px] text-gray-600">יבוא למלאי (ללא פרויקט)</span>
          </label>
          {!form.is_stock && (
            <label className="block col-span-2">
              <span className="text-[11px] text-gray-400">פרויקט</span>
              <select value={form.project_id} onChange={(e) => setForm({ ...form, project_id: e.target.value })} className="w-full text-sm border border-gray-200 rounded-md px-2 py-1.5 mt-0.5">
                <option value="">— בחר פרויקט —</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name || p.client_name}</option>)}
              </select>
            </label>
          )}
          <label className="block">
            <span className="text-[11px] text-gray-400">מטבע</span>
            <select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} className="w-full text-sm border border-gray-200 rounded-md px-2 py-1.5 mt-0.5">
              {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="text-[11px] text-gray-400">סכום ההזמנה</span>
            <input type="number" value={form.total_amount} onChange={(e) => setForm({ ...form, total_amount: e.target.value })} className="w-full text-sm border border-gray-200 rounded-md px-2 py-1.5 mt-0.5" />
          </label>
          <label className="block">
            <span className="text-[11px] text-gray-400">תאריך הזמנה</span>
            <input type="date" value={form.order_date} onChange={(e) => setForm({ ...form, order_date: e.target.value })} className="w-full text-sm border border-gray-200 rounded-md px-2 py-1.5 mt-0.5" />
          </label>
          <label className="block">
            <span className="text-[11px] text-gray-400">שלב</span>
            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="w-full text-sm border border-gray-200 rounded-md px-2 py-1.5 mt-0.5">
              {STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </label>
        </div>
        <div className="flex gap-2 mt-5">
          <button onClick={create} disabled={saving} className="bg-[#1a56db] text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50">
            {saving ? 'יוצר...' : 'צור הזמנה'}
          </button>
          <button onClick={onClose} className="text-sm px-4 py-2 rounded-lg border border-gray-200 text-gray-600">ביטול</button>
        </div>
      </div>
    </div>
  );
}
