'use client';

/**
 * תשלומים לספקים — supplier invoices (import_invoices) with live balances
 * (supplier_invoice_balances view), grouped by supplier, in the invoice's
 * original currency. Partial payments in supplier_payments — a DB trigger
 * keeps payment_status in sync. Requires import:view; actions need import:edit.
 */
import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { usePermissions } from '@/lib/auth/permissions-context';
import Icon from '@/components/ui/Icon';
import SectionTabs from '@/components/ui/SectionTabs';
import { FINANCE_TABS } from '@/lib/nav';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input, Textarea, Select } from '@/components/ui/Input';
import { Field } from '@/components/ui/Field';

const METHOD_LABELS: Record<string, string> = {
  bank_transfer: 'העברה בנקאית', check: 'צ׳ק', credit: 'אשראי', cash: 'מזומן', other: 'אחר',
};

function money(n: number | string | null | undefined, currency: string | null) {
  const cur = currency || 'USD';
  try {
    return new Intl.NumberFormat(cur === 'ILS' ? 'he-IL' : 'en-US', { style: 'currency', currency: cur, maximumFractionDigits: 0 }).format(Number(n) || 0);
  } catch {
    return `${(Number(n) || 0).toLocaleString()} ${cur}`;
  }
}
function fmtDate(d: string | null | undefined) {
  return d ? new Date(d).toLocaleDateString('he-IL') : '—';
}
function todayYmd() {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
}
function overdueDays(due: string | null | undefined) {
  if (!due) return 0;
  const d = new Date(due); d.setHours(0, 0, 0, 0);
  const now = new Date(); now.setHours(0, 0, 0, 0);
  return Math.floor((now.getTime() - d.getTime()) / 86400000);
}

type Filter = 'open' | 'overdue' | 'paid' | 'all';

export default function SupplierPaymentsPage() {
  const supabase = createClient();
  const { canAccess } = usePermissions();
  const canEdit = canAccess('import', 'edit');

  const [invoices, setInvoices] = useState<any[]>([]);
  const [orders, setOrders] = useState<Record<string, any>>({});
  const [suppliers, setSuppliers] = useState<Record<string, string>>({});
  const [shipments, setShipments] = useState<Record<string, any>>({});
  const [filter, setFilter] = useState<Filter>('open');
  const [loading, setLoading] = useState(true);

  const [payFor, setPayFor] = useState<any | null>(null);
  const [payForm, setPayForm] = useState({ amount: '', paid_at: todayYmd(), method: 'bank_transfer', reference: '', notes: '' });
  const [dueFor, setDueFor] = useState<any | null>(null);
  const [dueDate, setDueDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const [{ data: invs }, { data: ords }, { data: sups }, { data: ships }] = await Promise.all([
      supabase.from('supplier_invoice_balances').select('*').order('payment_due_date', { ascending: true, nullsFirst: false }),
      supabase.from('import_orders').select('id, po_number, supplier_id, project_name, currency'),
      supabase.from('suppliers').select('id, name'),
      supabase.from('import_shipments').select('id, bl_number, supplier_id, eta, status'),
    ]);
    setInvoices(invs || []);
    const om: Record<string, any> = {};
    (ords || []).forEach((o: any) => { om[o.id] = o; });
    setOrders(om);
    const sm: Record<string, string> = {};
    (sups || []).forEach((s: any) => { sm[s.id] = s.name; });
    setSuppliers(sm);
    const shm: Record<string, any> = {};
    (ships || []).forEach((s: any) => { shm[s.id] = s; });
    setShipments(shm);
    setLoading(false);
  }
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const isOpen = (i: any) => i.payment_status === 'open' || i.payment_status === 'partially_paid';

  // Supplier for an invoice: via its order, else via its shipment.
  const supplierOf = (i: any): string => {
    const viaOrder = i.import_order_id && orders[i.import_order_id]?.supplier_id;
    const viaShip = i.shipment_id && shipments[i.shipment_id]?.supplier_id;
    return suppliers[viaOrder || viaShip] || 'ספק לא מזוהה';
  };

  const filtered = useMemo(() => invoices.filter((i) => {
    if (filter === 'open') return isOpen(i);
    if (filter === 'overdue') return isOpen(i) && overdueDays(i.payment_due_date) > 0;
    if (filter === 'paid') return i.payment_status === 'paid';
    return true;
  }), [invoices, filter]);

  const groups = useMemo(() => {
    const m: Record<string, { label: string; rows: any[] }> = {};
    filtered.forEach((i) => {
      const label = supplierOf(i);
      (m[label] = m[label] || { label, rows: [] }).rows.push(i);
    });
    return Object.values(m);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, orders, suppliers, shipments]);

  // Open totals per currency (foreign invoices stay in their currency).
  const openByCurrency = useMemo(() => {
    const m: Record<string, { open: number; overdue: number }> = {};
    invoices.filter(isOpen).forEach((i) => {
      const cur = i.currency || 'USD';
      const e = m[cur] || { open: 0, overdue: 0 };
      const b = Number(i.balance) || 0;
      e.open += b;
      if (overdueDays(i.payment_due_date) > 0) e.overdue += b;
      m[cur] = e;
    });
    return m;
  }, [invoices]);

  const counts = useMemo(() => ({
    open: invoices.filter(isOpen).length,
    overdue: invoices.filter((i) => isOpen(i) && overdueDays(i.payment_due_date) > 0).length,
    paid: invoices.filter((i) => i.payment_status === 'paid').length,
    all: invoices.length,
  }), [invoices]);

  function openPayment(i: any) {
    setError(null);
    setPayFor(i);
    setPayForm({ amount: String(Number(i.balance) > 0 ? Number(i.balance) : ''), paid_at: todayYmd(), method: 'bank_transfer', reference: '', notes: '' });
  }
  async function savePayment() {
    if (!payFor) return;
    const amt = Number(payForm.amount);
    if (!amt || amt <= 0) { setError('יש להזין סכום'); return; }
    setSaving(true); setError(null);
    const { data: { user } } = await supabase.auth.getUser();
    const { error: err } = await supabase.from('supplier_payments').insert({
      invoice_id: payFor.id, amount: amt, paid_at: payForm.paid_at || todayYmd(),
      method: payForm.method, reference: payForm.reference.trim() || null,
      notes: payForm.notes.trim() || null, created_by: user?.id || null,
    });
    setSaving(false);
    if (err) { setError(err.message); return; }
    setPayFor(null);
    load();
  }

  function openDue(i: any) {
    setError(null);
    setDueFor(i);
    setDueDate(i.payment_due_date || '');
  }
  async function saveDue() {
    if (!dueFor) return;
    setSaving(true); setError(null);
    const { error: err } = await supabase.from('import_invoices')
      .update({ payment_due_date: dueDate || null }).eq('id', dueFor.id);
    setSaving(false);
    if (err) { setError(err.message); return; }
    setDueFor(null);
    load();
  }

  const FILTERS: { key: Filter; label: string }[] = [
    { key: 'open', label: `פתוחות (${counts.open})` },
    { key: 'overdue', label: `בפיגור (${counts.overdue})` },
    { key: 'paid', label: `שולמו (${counts.paid})` },
    { key: 'all', label: `הכל (${counts.all})` },
  ];

  return (
    <div className="p-6 max-w-6xl mx-auto" dir="rtl">
      <SectionTabs tabs={FINANCE_TABS} />
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-content-strong"><Icon name="money" size={24} /> תשלומים לספקים</h1>
        <p className="text-sm text-content-muted mt-1">חשבוניות ספק ממודול היבוא — מועדי פירעון, תשלומים חלקיים ויתרות במטבע המקור</p>
      </div>

      {/* Open totals per currency */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        {Object.keys(openByCurrency).length === 0 ? (
          <div className="bg-white rounded-xl border border-line-subtle p-4">
            <p className="text-[12px] text-content-muted">חוב פתוח לספקים</p>
            <p className="text-xl font-bold text-content-strong ft-figure" dir="ltr">0</p>
          </div>
        ) : Object.entries(openByCurrency).map(([cur, v]) => (
          <div key={cur} className={`bg-white rounded-xl border p-4 ${v.overdue > 0 ? 'border-danger' : 'border-line-subtle'}`}>
            <p className="text-[12px] text-content-muted">חוב פתוח ({cur})</p>
            <p className="text-xl font-bold text-content-strong ft-figure" dir="ltr">{money(v.open, cur)}</p>
            {v.overdue > 0 && <p className="text-[12px] text-danger font-semibold ft-figure" dir="ltr">בפיגור: {money(v.overdue, cur)}</p>}
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {FILTERS.map((f) => (
          <button key={f.key} onClick={() => setFilter(f.key)}
            className={`text-[12px] px-3 py-1.5 rounded-full border ${filter === f.key ? 'bg-primary text-white border-primary' : 'bg-white text-content-body border-line-subtle hover:bg-neutral-50'}`}>
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-neutral-400 text-center py-12">טוען…</p>
      ) : groups.length === 0 ? (
        <div className="bg-white rounded-xl border border-line-subtle p-12 text-center">
          <p className="mb-3 text-neutral-300"><Icon name="empty" size={40} /></p>
          <p className="text-content-muted">אין חשבוניות ספק בסינון הזה</p>
          <p className="text-[13px] text-neutral-400 mt-2">חשבוניות ספק נקלטות בכרטיסי המשלוחים במסך <a href="/import" className="text-primary hover:underline">היבוא</a> ומופיעות כאן אוטומטית.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map((g) => (
            <div key={g.label} className="bg-white rounded-xl border border-line-subtle overflow-hidden">
              <div className="px-4 py-3 bg-neutral-50 border-b border-line-subtle">
                <p className="font-bold text-content-strong text-sm m-0"><Icon name="import" size={15} /> {g.label}</p>
              </div>
              <div className="divide-y divide-line-subtle">
                {g.rows.map((i) => {
                  const days = overdueDays(i.payment_due_date);
                  const open = isOpen(i);
                  const order = i.import_order_id ? orders[i.import_order_id] : null;
                  return (
                    <div key={i.id} className="px-4 py-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2 text-sm">
                          <span className="font-bold text-content-strong" dir="ltr">{i.invoice_no || 'ללא מספר'}</span>
                          {i.invoice_type && <span className="text-[11px] px-1.5 py-0.5 rounded bg-neutral-100 text-content-muted">{i.invoice_type}</span>}
                          {order?.po_number && <span className="text-[12px] font-mono text-content-muted" dir="ltr">{order.po_number}</span>}
                          {order?.project_name && <span className="text-[12px] text-content-muted">{order.project_name}</span>}
                          <span className="text-[12px] text-content-muted">הופקה {fmtDate(i.invoice_date)}</span>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                          {i.booked && <span className="px-2 py-0.5 rounded-full bg-neutral-100 text-content-muted font-semibold">נקלטה בהנה"ח</span>}
                          {open && i.payment_due_date && (
                            days > 0
                              ? <span className="px-2 py-0.5 rounded-full bg-danger-soft text-danger font-semibold">בפיגור {days} ימים</span>
                              : <span className="px-2 py-0.5 rounded-full bg-warning-soft text-warning font-semibold">לתשלום עד {fmtDate(i.payment_due_date)}</span>
                          )}
                          {open && !i.payment_due_date && <span className="px-2 py-0.5 rounded-full bg-neutral-100 text-content-muted font-semibold">ללא מועד פירעון</span>}
                          {i.payment_status === 'partially_paid' && <span className="px-2 py-0.5 rounded-full bg-azure-100 text-azure-600 font-semibold">שולם חלקית</span>}
                          {i.payment_status === 'paid' && <span className="px-2 py-0.5 rounded-full bg-success-soft text-success font-semibold"><Icon name="confirm" size={11} /> שולם {fmtDate(i.paid_at)}</span>}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-2 mt-1.5">
                        <div className="flex flex-wrap items-center gap-3 text-[12px] text-content-muted">
                          <span dir="ltr" className="ft-figure">סה"כ {money(i.payable_amount, i.currency)}</span>
                          {Number(i.paid_total) > 0 && <span dir="ltr" className="ft-figure text-success">שולם {money(i.paid_total, i.currency)}</span>}
                          {open && <span dir="ltr" className="ft-figure font-bold text-content-strong">יתרה {money(i.balance, i.currency)}</span>}
                        </div>
                        {canEdit && (
                          <div className="flex flex-wrap items-center gap-3 text-[12px]">
                            {open && <button onClick={() => openPayment(i)} className="font-semibold text-success hover:underline"><Icon name="payment" size={12} /> רישום תשלום</button>}
                            <button onClick={() => openDue(i)} className="text-primary hover:underline"><Icon name="calendar" size={12} /> מועד פירעון</button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* payment modal */}
      <Modal open={!!payFor} onClose={() => setPayFor(null)} size="md"
        title={`רישום תשלום לספק — חשבונית ${payFor?.invoice_no || ''}`}
        footer={<>
          <Button variant="secondary" size="sm" onClick={() => setPayFor(null)} disabled={saving}>סגור</Button>
          <Button size="sm" onClick={savePayment} disabled={saving}>{saving ? 'שומר…' : 'שמור תשלום'}</Button>
        </>}>
        {payFor && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4" dir="rtl">
            <div className="sm:col-span-2 text-[13px] text-content-muted">
              יתרה: <span className="font-bold text-content-strong ft-figure" dir="ltr">{money(payFor.balance, payFor.currency)}</span>
              {' · '}הסכום במטבע החשבונית ({payFor.currency || 'USD'})
            </div>
            <Field label={`סכום (${payFor.currency || 'USD'})`} required>
              <Input dir="ltr" type="number" min="0" step="0.01" value={payForm.amount} onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })} />
            </Field>
            <Field label="תאריך">
              <Input dir="ltr" type="date" value={payForm.paid_at} onChange={(e) => setPayForm({ ...payForm, paid_at: e.target.value })} />
            </Field>
            <Field label="אמצעי תשלום">
              <Select value={payForm.method} onChange={(e) => setPayForm({ ...payForm, method: e.target.value })}>
                {Object.entries(METHOD_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </Field>
            <Field label="אסמכתא">
              <Input dir="ltr" value={payForm.reference} onChange={(e) => setPayForm({ ...payForm, reference: e.target.value })} />
            </Field>
            <div className="sm:col-span-2">
              <Field label="הערות">
                <Textarea rows={2} value={payForm.notes} onChange={(e) => setPayForm({ ...payForm, notes: e.target.value })} />
              </Field>
            </div>
            {error && <p className="sm:col-span-2 text-sm text-danger">{error}</p>}
          </div>
        )}
      </Modal>

      {/* due-date modal */}
      <Modal open={!!dueFor} onClose={() => setDueFor(null)} size="sm"
        title={`מועד פירעון — חשבונית ${dueFor?.invoice_no || ''}`}
        footer={<>
          <Button variant="secondary" size="sm" onClick={() => setDueFor(null)} disabled={saving}>סגור</Button>
          <Button size="sm" onClick={saveDue} disabled={saving}>{saving ? 'שומר…' : 'שמור'}</Button>
        </>}>
        <div dir="rtl">
          <Field label="לתשלום עד">
            <Input dir="ltr" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </Field>
          {error && <p className="text-sm text-danger mt-2">{error}</p>}
        </div>
      </Modal>
    </div>
  );
}
