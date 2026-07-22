'use client';

/**
 * Central delivery-certificates screen — the bookkeeping view.
 * Every certificate across all import orders: who's waiting for a signature,
 * what's waiting for an invoice (the money on the floor), and what's done.
 * Requires import:view (RLS); invoice actions need import:edit.
 */
import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { usePermissions } from '@/lib/auth/permissions-context';
import Icon from '@/components/ui/Icon';
import SectionTabs from '@/components/ui/SectionTabs';
import { LOGISTICS_TABS } from '@/lib/nav';
import { paymentDueDate } from '@/lib/inventory';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Field } from '@/components/ui/Field';

const VAT_RATE = 0.18;

function todayYmd() {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
}

type Filter = 'all' | 'awaiting_signature' | 'awaiting_invoice' | 'awaiting_payment' | 'done';

function fmtDate(d: string | null) {
  return d ? new Date(d).toLocaleDateString('he-IL') : '—';
}
function daysSince(d: string | null) {
  return d ? Math.floor((Date.now() - new Date(d).getTime()) / 86400000) : 0;
}

export default function DeliveriesPage() {
  const supabase = createClient();
  const { canAccess } = usePermissions();
  const canEdit = canAccess('import', 'edit');
  const [rows, setRows] = useState<any[]>([]);
  const [projects, setProjects] = useState<Record<string, string>>({});
  const [containers, setContainers] = useState<Record<string, any>>({});
  const [signedOrderDocs, setSignedOrderDocs] = useState<Record<string, string>>({});
  const [team, setTeam] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<Filter>('awaiting_invoice');
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const [{ data: dels }, { data: projs }, { data: conts }, { data: members }] = await Promise.all([
      supabase.from('import_customer_deliveries').select('*').order('created_at', { ascending: false }),
      supabase.from('projects').select('id, name'),
      supabase.from('import_containers').select('id, container_number'),
      supabase.from('team_members').select('id, name'),
    ]);
    const pm: Record<string, string> = {};
    (projs || []).forEach((p: any) => { pm[p.id] = p.name; });
    const cm: Record<string, any> = {};
    (conts || []).forEach((c: any) => { cm[c.id] = c; });
    const tm: Record<string, string> = {};
    (members || []).forEach((m: any) => { tm[m.id] = m.name; });
    setProjects(pm); setContainers(cm); setTeam(tm);
    setRows(dels || []);

    // Signed production-order documents for these deliveries' deals.
    const orderIds = Array.from(new Set((dels || []).map((d: any) => d.import_order_id).filter(Boolean)));
    if (orderIds.length) {
      const { data: impOrders } = await supabase.from('import_orders').select('id, quote_id').in('id', orderIds);
      const quoteIds = Array.from(new Set((impOrders || []).map((o: any) => o.quote_id).filter(Boolean)));
      if (quoteIds.length) {
        const { data: prodOrders } = await supabase.from('orders').select('id, quote_id').in('quote_id', quoteIds);
        const prodIds = (prodOrders || []).map((o: any) => o.id);
        if (prodIds.length) {
          const { data: docs } = await supabase.from('order_documents').select('order_id, file_path, doc_type').in('order_id', prodIds).eq('doc_type', 'signed_order');
          const byQuote: Record<string, string> = {};
          (docs || []).forEach((doc: any) => {
            const po = (prodOrders || []).find((o: any) => o.id === doc.order_id);
            if (po?.quote_id) byQuote[po.quote_id] = doc.file_path;
          });
          const byDelivery: Record<string, string> = {};
          (dels || []).forEach((d: any) => {
            const io = (impOrders || []).find((o: any) => o.id === d.import_order_id);
            if (io?.quote_id && byQuote[io.quote_id]) byDelivery[d.id] = byQuote[io.quote_id];
          });
          setSignedOrderDocs(byDelivery);
        }
      }
    }
    setLoading(false);
  }
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const filtered = useMemo(() => rows.filter((d) => {
    if (filter === 'awaiting_signature') return !d.signed;
    if (filter === 'awaiting_invoice') return d.sent_to_accounting && !d.invoice_issued;
    if (filter === 'awaiting_payment') return d.invoice_issued && !d.paid;
    if (filter === 'done') return d.invoice_issued && d.paid;
    return true;
  }), [rows, filter]);

  const counts = useMemo(() => ({
    all: rows.length,
    awaiting_signature: rows.filter((d) => !d.signed).length,
    awaiting_invoice: rows.filter((d) => d.sent_to_accounting && !d.invoice_issued).length,
    awaiting_payment: rows.filter((d) => d.invoice_issued && !d.paid).length,
    done: rows.filter((d) => d.invoice_issued && d.paid).length,
  }), [rows]);

  async function openFile(path: string) {
    const w = window.open('about:blank', '_blank');
    const { data: s } = await supabase.storage.from('project-files').createSignedUrl(path, 300);
    if (s?.signedUrl) { if (w) w.location.href = s.signedUrl; else window.location.href = s.signedUrl; }
    else w?.close();
  }

  // ---------- "חשבונית הופקה" — creates a real customer_invoices row (כספים) ----------
  const [invFor, setInvFor] = useState<any | null>(null);
  const [invForm, setInvForm] = useState({ invoice_number: '', amount: '', vat_amount: '', payment_terms: '', payment_due_date: '' });
  const [invSaving, setInvSaving] = useState(false);
  const [invError, setInvError] = useState<string | null>(null);

  async function openInvoice(d: any) {
    setInvError(null);
    // Payment terms come from the deal's quote (e.g. "שוטף+60") — editable before save.
    let terms = '';
    if (d.import_order_id) {
      const { data: io } = await supabase.from('import_orders').select('quote_id').eq('id', d.import_order_id).single();
      if (io?.quote_id) {
        const { data: q } = await supabase.from('quotes').select('payment_terms').eq('id', io.quote_id).single();
        terms = q?.payment_terms || '';
      }
    }
    setInvForm({ invoice_number: '', amount: '', vat_amount: '', payment_terms: terms, payment_due_date: paymentDueDate(terms || null) });
    setInvFor(d);
  }

  async function saveInvoice() {
    if (!invFor) return;
    if (!invForm.invoice_number.trim()) { setInvError('יש להזין מספר חשבונית'); return; }
    setInvSaving(true); setInvError(null);
    const { data: { user } } = await supabase.auth.getUser();
    // Customer link comes from the project's winning customer (may be null).
    let customerId: string | null = null;
    if (invFor.project_id) {
      const { data: p } = await supabase.from('projects').select('customer_id').eq('id', invFor.project_id).single();
      customerId = p?.customer_id || null;
    }
    const { data: inv, error: invErr } = await supabase.from('customer_invoices').insert({
      invoice_number: invForm.invoice_number.trim(),
      customer_id: customerId,
      project_id: invFor.project_id || null,
      invoice_type: 'delivery',
      amount: Number(invForm.amount) || 0,
      vat_amount: Number(invForm.vat_amount) || 0,
      issued_at: todayYmd(),
      payment_terms: invForm.payment_terms.trim() || null,
      payment_due_date: invForm.payment_due_date || null,
      created_by: user?.id || null,
    }).select('id').single();
    if (invErr || !inv) { setInvSaving(false); setInvError(invErr?.message || 'שגיאה ביצירת החשבונית'); return; }
    const { error: dErr } = await supabase.from('import_customer_deliveries')
      .update({
        invoice_issued: true, invoice_number: invForm.invoice_number.trim(), invoice_issued_at: new Date().toISOString(),
        payment_due_date: invForm.payment_due_date || null, customer_invoice_id: inv.id,
      })
      .eq('id', invFor.id);
    setInvSaving(false);
    if (dErr) { setInvError(dErr.message); return; }
    setInvFor(null);
    load();
  }

  const FILTERS: { key: Filter; label: string }[] = [
    { key: 'awaiting_invoice', label: `ממתין לחשבונית (${counts.awaiting_invoice})` },
    { key: 'awaiting_payment', label: `בגבייה (${counts.awaiting_payment})` },
    { key: 'awaiting_signature', label: `ממתין לחתימה (${counts.awaiting_signature})` },
    { key: 'done', label: `הושלם (${counts.done})` },
    { key: 'all', label: `הכל (${counts.all})` },
  ];

  return (
    <div className="p-6 max-w-5xl mx-auto" dir="rtl">
      <SectionTabs tabs={LOGISTICS_TABS} />
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-content-strong"><Icon name="invoice" size={24} /> תעודות משלוח</h1>
        <p className="text-sm text-content-muted mt-1">מעקב אספקות ללקוח: חתימה ← הוראת חיוב להנה"ח ← חשבונית</p>
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
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-line-subtle p-12 text-center">
          <p className="mb-3 text-neutral-300"><Icon name="empty" size={40} /></p>
          <p className="text-content-muted">אין תעודות בסינון הזה</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((d) => {
            const overdue = d.sent_to_accounting && !d.invoice_issued && daysSince(d.sent_to_accounting_at) > 7;
            return (
              <div key={d.id} className={`bg-white rounded-xl border p-4 ${overdue ? 'border-danger' : 'border-line-subtle'}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2 text-sm">
                      <span className="font-bold text-content-strong" dir="ltr">{d.delivery_note_number || '—'}</span>
                      <span className="text-content-muted">{fmtDate(d.delivery_date)}</span>
                      {d.project_id && projects[d.project_id] && (
                        <a href={`/projects/${d.project_id}`} className="text-primary hover:underline">{projects[d.project_id]}</a>
                      )}
                      {d.customer_name && <span className="text-content-muted">· {d.customer_name}</span>}
                    </div>
                    <div className="text-[12px] text-neutral-400 mt-0.5" dir="ltr">
                      {d.container_id && containers[d.container_id] ? `📦 ${containers[d.container_id].container_number}` : d.quantity_summary || ''}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                    {d.signed
                      ? <span className="px-2 py-0.5 rounded-full bg-success-soft text-success font-semibold"><Icon name="confirm" size={11} /> חתומה{d.signer_name ? ` · ${d.signer_name}` : ''}</span>
                      : <span className="px-2 py-0.5 rounded-full bg-warning-soft text-warning font-semibold">ממתינה לחתימה</span>}
                    {d.sent_to_accounting && !d.invoice_issued && (
                      <span className={`px-2 py-0.5 rounded-full font-semibold ${overdue ? 'bg-danger-soft text-danger' : 'bg-azure-100 text-azure-600'}`}>
                        אצל הנה"ח {daysSince(d.sent_to_accounting_at)} ימים{d.accounting_assignee && team[d.accounting_assignee] ? ` · ${team[d.accounting_assignee]}` : ''}
                      </span>
                    )}
                    {d.invoice_issued && <span className="px-2 py-0.5 rounded-full bg-success-soft text-success font-semibold" dir="ltr">חשבונית {d.invoice_number}</span>}
                    {d.invoice_issued && !d.paid && d.payment_due_date && (
                      <span className={`px-2 py-0.5 rounded-full font-semibold ${new Date(d.payment_due_date) < new Date(new Date().toDateString()) ? 'bg-danger-soft text-danger' : 'bg-warning-soft text-warning'}`}>
                        לגבייה עד {fmtDate(d.payment_due_date)}
                      </span>
                    )}
                    {d.paid && <span className="px-2 py-0.5 rounded-full bg-success-soft text-success font-semibold"><Icon name="payment" size={11} /> שולם</span>}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3 mt-2 text-[12px]">
                  {d.signed_file_path && <button onClick={() => openFile(d.signed_file_path)} className="text-primary hover:underline"><Icon name="attach" size={12} /> תעודה חתומה</button>}
                  {d.signature_file_path && <button onClick={() => openFile(d.signature_file_path)} className="text-primary hover:underline"><Icon name="edit" size={12} /> חתימה דיגיטלית</button>}
                  {signedOrderDocs[d.id] && <button onClick={() => openFile(signedOrderDocs[d.id])} className="text-primary hover:underline"><Icon name="file" size={12} /> הזמנה חתומה</button>}
                  {canEdit && d.sent_to_accounting && !d.invoice_issued && (
                    <button onClick={() => openInvoice(d)} className="font-semibold text-success hover:underline"><Icon name="confirm" size={12} /> חשבונית הופקה</button>
                  )}
                  {d.invoice_issued && !d.paid && (
                    <a href="/finance/collections" className="font-semibold text-azure-600 hover:underline no-underline"><Icon name="payment" size={12} /> מעקב גבייה בכספים ←</a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* חשבונית הופקה — נרשמת גם כחשבונית לקוח במודול הכספים */}
      <Modal open={!!invFor} onClose={() => setInvFor(null)} size="md"
        title={`חשבונית הופקה — תעודה ${invFor?.delivery_note_number || ''}`}
        footer={<>
          <Button variant="secondary" size="sm" onClick={() => setInvFor(null)} disabled={invSaving}>סגור</Button>
          <Button size="sm" onClick={saveInvoice} disabled={invSaving}>{invSaving ? 'שומר…' : 'שמור'}</Button>
        </>}>
        {invFor && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4" dir="rtl">
            <div className="sm:col-span-2 text-[13px] text-content-muted">
              החשבונית תיפתח למעקב גבייה במסך <a href="/finance/collections" className="text-primary hover:underline">כספים ← חשבוניות וגבייה</a>.
            </div>
            <Field label="מספר חשבונית" required>
              <Input dir="ltr" value={invForm.invoice_number} onChange={(e) => setInvForm({ ...invForm, invoice_number: e.target.value })} />
            </Field>
            <Field label="סכום לפני מע״מ (₪)">
              <Input dir="ltr" type="number" min="0" step="0.01" value={invForm.amount}
                onChange={(e) => setInvForm({ ...invForm, amount: e.target.value, vat_amount: e.target.value === '' ? '' : String(Math.round(Number(e.target.value) * VAT_RATE * 100) / 100) })} />
            </Field>
            <Field label="מע״מ (₪)" hint="מחושב אוטומטית — ניתן לעריכה">
              <Input dir="ltr" type="number" min="0" step="0.01" value={invForm.vat_amount} onChange={(e) => setInvForm({ ...invForm, vat_amount: e.target.value })} />
            </Field>
            <Field label="תנאי תשלום">
              <Input value={invForm.payment_terms}
                onChange={(e) => setInvForm({ ...invForm, payment_terms: e.target.value, payment_due_date: paymentDueDate(e.target.value || null) })} />
            </Field>
            <Field label="מועד תשלום (לגבייה)">
              <Input dir="ltr" type="date" value={invForm.payment_due_date} onChange={(e) => setInvForm({ ...invForm, payment_due_date: e.target.value })} />
            </Field>
            {invError && <p className="sm:col-span-2 text-sm text-danger">{invError}</p>}
          </div>
        )}
      </Modal>
    </div>
  );
}
