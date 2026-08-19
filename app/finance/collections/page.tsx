'use client';

/**
 * חשבוניות וגבייה — the collections desk. Every customer invoice with its live
 * balance (customer_invoice_balances view), aged, grouped by customer, with a
 * follow-up log (collection_activities) and partial payments (customer_payments —
 * a DB trigger keeps invoice status in sync). Requires import:view; actions
 * need import:edit. Amounts are ILS incl. explicit VAT line.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import ProformaDocument, { type ProformaDocumentHandle } from '@/components/finance/ProformaDocument';
import { usePermissions } from '@/lib/auth/permissions-context';
import Icon from '@/components/ui/Icon';
import SectionTabs from '@/components/ui/SectionTabs';
import { FINANCE_TABS } from '@/lib/nav';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input, Textarea, Select } from '@/components/ui/Input';
import { Field } from '@/components/ui/Field';
import SearchableSelect from '@/components/ui/SearchableSelect';
import { paymentDueDate } from '@/lib/inventory';
import { safeExt } from '@/lib/dropped-files';

const VAT_RATE = 0.18;

const TYPE_LABELS: Record<string, string> = {
  delivery: 'אספקה', advance: 'מקדמה', milestone: 'אבן דרך', final: 'חשבון סופי', proforma: 'פרופורמה', other: 'אחר',
};
const METHOD_LABELS: Record<string, string> = {
  bank_transfer: 'העברה בנקאית', check: 'צ׳ק', credit: 'אשראי', cash: 'מזומן', other: 'אחר',
};
const ACTIVITY_LABELS: Record<string, string> = {
  call: 'שיחת טלפון', email: 'מייל', meeting: 'פגישה', promise: 'הבטחת תשלום', note: 'הערה',
};

function ils(n: number | string | null | undefined) {
  return new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(Number(n) || 0);
}
function fmtDate(d: string | null | undefined) {
  return d ? new Date(d).toLocaleDateString('he-IL') : '—';
}
function todayYmd() {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
}
/** Days past due (positive = overdue). Date-only compare, local time. */
function overdueDays(due: string | null | undefined) {
  if (!due) return 0;
  const d = new Date(due); d.setHours(0, 0, 0, 0);
  const now = new Date(); now.setHours(0, 0, 0, 0);
  return Math.floor((now.getTime() - d.getTime()) / 86400000);
}

type Filter = 'open' | 'overdue' | 'paid' | 'cancelled' | 'all';

const AGING_BUCKETS = [
  { key: 'current', label: 'שוטף' },
  { key: 'b30', label: '1–30' },
  { key: 'b60', label: '31–60' },
  { key: 'b90', label: '61–90' },
  { key: 'b90p', label: '90+' },
] as const;

function bucketOf(inv: any): typeof AGING_BUCKETS[number]['key'] {
  const days = overdueDays(inv.payment_due_date);
  if (days <= 0) return 'current';
  if (days <= 30) return 'b30';
  if (days <= 60) return 'b60';
  if (days <= 90) return 'b90';
  return 'b90p';
}

const emptyInvoiceForm = {
  id: null as string | null,
  invoice_number: '',
  invoice_type: 'delivery',
  customer_id: '',
  project_id: '',
  amount: '',
  vat_amount: '',
  issued_at: todayYmd(),
  payment_terms: '',
  payment_due_date: '',
  notes: '',
  lines: [] as { description: string; qty: string; unit: string; unit_price: string }[],
};

export default function CollectionsPage() {
  const supabase = createClient();
  const { canAccess } = usePermissions();
  const canEdit = canAccess('import', 'edit');
  const canFull = canAccess('import', 'full');

  const [invoices, setInvoices] = useState<any[]>([]);
  const [activities, setActivities] = useState<any[]>([]);
  const [monthCollected, setMonthCollected] = useState(0);
  const [clients, setClients] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [team, setTeam] = useState<any[]>([]);
  const [filter, setFilter] = useState<Filter>('open');
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  // ?project=<id> filter (read from location to avoid a Suspense boundary).
  const [projectFilter, setProjectFilter] = useState<string | null>(null);
  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get('project');
    if (p) setProjectFilter(p);
  }, []);

  // Uploaded SAP invoice file + proforma document modal
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadFor, setUploadFor] = useState<any | null>(null);
  const [uploading, setUploading] = useState(false);
  const [docFor, setDocFor] = useState<any | null>(null);
  const proformaRef = useRef<ProformaDocumentHandle>(null);

  // Modals
  const [invoiceForm, setInvoiceForm] = useState<typeof emptyInvoiceForm | null>(null);
  const [payFor, setPayFor] = useState<any | null>(null);
  const [payForm, setPayForm] = useState({ amount: '', paid_at: todayYmd(), method: 'bank_transfer', reference: '', notes: '' });
  const [actFor, setActFor] = useState<any | null>(null);
  const [actForm, setActForm] = useState({ activity_type: 'call', summary: '', promised_date: '', next_action_date: '', assignee: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const monthStart = todayYmd().slice(0, 8) + '01';
    const [{ data: invs }, { data: acts }, { data: pays }, { data: cls }, { data: projs }, { data: members }] = await Promise.all([
      supabase.from('customer_invoice_balances').select('*').order('payment_due_date', { ascending: true, nullsFirst: false }),
      supabase.from('collection_activities').select('*').order('created_at', { ascending: false }),
      supabase.from('customer_payments').select('amount, paid_at').gte('paid_at', monthStart),
      supabase.from('clients').select('id, name').order('name'),
      supabase.from('projects').select('id, name').order('name'),
      supabase.from('team_members').select('id, name'),
    ]);
    setInvoices(invs || []);
    setActivities(acts || []);
    setMonthCollected((pays || []).reduce((s: number, p: any) => s + (Number(p.amount) || 0), 0));
    setClients(cls || []);
    setProjects(projs || []);
    setTeam(members || []);
    setLoading(false);
  }
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const clientName = useMemo(() => {
    const m: Record<string, string> = {};
    clients.forEach((c) => { m[c.id] = c.name; });
    return m;
  }, [clients]);
  const projectName = useMemo(() => {
    const m: Record<string, string> = {};
    projects.forEach((p) => { m[p.id] = p.name; });
    return m;
  }, [projects]);
  const teamName = useMemo(() => {
    const m: Record<string, string> = {};
    team.forEach((t) => { m[t.id] = t.name; });
    return m;
  }, [team]);
  const actsByInvoice = useMemo(() => {
    const m: Record<string, any[]> = {};
    activities.forEach((a) => { (m[a.invoice_id] = m[a.invoice_id] || []).push(a); });
    return m;
  }, [activities]);

  const isOpen = (i: any) => i.status === 'open' || i.status === 'partially_paid';
  const openInvoices = useMemo(() => invoices.filter(isOpen), [invoices]);
  const totalOpen = useMemo(() => openInvoices.reduce((s, i) => s + (Number(i.balance) || 0), 0), [openInvoices]);
  const totalOverdue = useMemo(
    () => openInvoices.filter((i) => overdueDays(i.payment_due_date) > 0).reduce((s, i) => s + (Number(i.balance) || 0), 0),
    [openInvoices]);
  const missingAmount = useMemo(() => openInvoices.filter((i) => !Number(i.total_amount)).length, [openInvoices]);

  const aging = useMemo(() => {
    const m: Record<string, number> = { current: 0, b30: 0, b60: 0, b90: 0, b90p: 0 };
    openInvoices.forEach((i) => { m[bucketOf(i)] += Number(i.balance) || 0; });
    return m;
  }, [openInvoices]);

  const filtered = useMemo(() => invoices.filter((i) => {
    if (projectFilter && i.project_id !== projectFilter) return false;
    if (filter === 'open') return isOpen(i);
    if (filter === 'overdue') return isOpen(i) && overdueDays(i.payment_due_date) > 0;
    if (filter === 'paid') return i.status === 'paid';
    if (filter === 'cancelled') return i.status === 'cancelled';
    return true;
  }), [invoices, filter, projectFilter]);

  // Group by customer (fallback: project's name as a pseudo-group, then "ללא שיוך").
  const groups = useMemo(() => {
    const m: Record<string, { label: string; rows: any[] }> = {};
    filtered.forEach((i) => {
      const key = i.customer_id || (i.project_id ? `p:${i.project_id}` : 'none');
      const label = i.customer_id
        ? clientName[i.customer_id] || 'לקוח'
        : i.project_id ? projectName[i.project_id] || 'פרויקט' : 'ללא שיוך לקוח';
      (m[key] = m[key] || { label, rows: [] }).rows.push(i);
    });
    return Object.entries(m)
      .map(([key, g]) => ({ key, ...g, balance: g.rows.reduce((s, r) => s + (isOpen(r) ? Number(r.balance) || 0 : 0), 0) }))
      .sort((a, b) => b.balance - a.balance);
  }, [filtered, clientName, projectName]);

  const counts = useMemo(() => ({
    open: invoices.filter(isOpen).length,
    overdue: invoices.filter((i) => isOpen(i) && overdueDays(i.payment_due_date) > 0).length,
    paid: invoices.filter((i) => i.status === 'paid').length,
    cancelled: invoices.filter((i) => i.status === 'cancelled').length,
    all: invoices.length,
  }), [invoices]);

  // ---------- invoice create / edit ----------
  function openNewInvoice() {
    setError(null);
    setInvoiceForm({ ...emptyInvoiceForm });
  }
  function openEditInvoice(i: any) {
    setError(null);
    setInvoiceForm({
      id: i.id,
      invoice_number: i.invoice_number || '',
      invoice_type: i.invoice_type || 'delivery',
      customer_id: i.customer_id || '',
      project_id: i.project_id || '',
      amount: String(i.amount ?? ''),
      vat_amount: String(i.vat_amount ?? ''),
      issued_at: i.issued_at || todayYmd(),
      payment_terms: i.payment_terms || '',
      payment_due_date: i.payment_due_date || '',
      notes: i.notes || '',
      lines: Array.isArray(i.lines)
        ? i.lines.map((l: any) => ({ description: l.description || '', qty: String(l.qty ?? ''), unit: l.unit || '', unit_price: String(l.unit_price ?? '') }))
        : [],
    });
  }
  function sumLines(lines: { qty: string; unit_price: string }[]) {
    return Math.round(lines.reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.unit_price) || 0), 0) * 100) / 100;
  }
  function setAmountWithVat(v: string) {
    setInvoiceForm((f) => f && ({ ...f, amount: v, vat_amount: v === '' ? '' : String(Math.round(Number(v) * VAT_RATE * 100) / 100) }));
  }
  async function saveInvoice() {
    if (!invoiceForm) return;
    setSaving(true); setError(null);
    const { data: { user } } = await supabase.auth.getUser();
    // Proforma gets an automatic PF-YYYY-NNN number on creation.
    let invoiceNumber = invoiceForm.invoice_number.trim();
    if (!invoiceForm.id && invoiceForm.invoice_type === 'proforma' && !invoiceNumber) {
      const { data: num } = await supabase.rpc('next_doc_number', { p_kind: 'PF' });
      if (num) invoiceNumber = String(num);
    }
    const cleanLines = invoiceForm.lines
      .filter((l) => l.description.trim() || Number(l.qty) || Number(l.unit_price))
      .map((l) => ({ description: l.description.trim(), qty: Number(l.qty) || 0, unit: l.unit.trim(), unit_price: Number(l.unit_price) || 0 }));
    const payload: any = {
      invoice_number: invoiceNumber || null,
      invoice_type: invoiceForm.invoice_type,
      customer_id: invoiceForm.customer_id || null,
      project_id: invoiceForm.project_id || null,
      amount: Number(invoiceForm.amount) || 0,
      vat_amount: Number(invoiceForm.vat_amount) || 0,
      issued_at: invoiceForm.issued_at || null,
      payment_terms: invoiceForm.payment_terms.trim() || null,
      payment_due_date: invoiceForm.payment_due_date || null,
      notes: invoiceForm.notes.trim() || null,
      lines: cleanLines.length ? cleanLines : null,
    };
    let err;
    if (invoiceForm.id) {
      ({ error: err } = await supabase.from('customer_invoices').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', invoiceForm.id));
    } else {
      ({ error: err } = await supabase.from('customer_invoices').insert({ ...payload, created_by: user?.id || null }));
    }
    setSaving(false);
    if (err) { setError(err.message); return; }
    setInvoiceForm(null);
    load();
  }
  async function cancelInvoice() {
    if (!invoiceForm?.id) return;
    if (!window.confirm('לבטל את החשבונית? היא תוצג בסינון "בוטלו" ותצא ממעקב הגבייה.')) return;
    setSaving(true);
    const { error: err } = await supabase.from('customer_invoices')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() }).eq('id', invoiceForm.id);
    setSaving(false);
    if (err) { setError(err.message); return; }
    setInvoiceForm(null);
    load();
  }

  // ---------- payment ----------
  function openPayment(i: any) {
    setError(null);
    setPayFor(i);
    setPayForm({ amount: String(Number(i.balance) > 0 ? Number(i.balance) : ''), paid_at: todayYmd(), method: 'bank_transfer', reference: '', notes: '' });
  }
  async function savePayment() {
    if (!payFor) return;
    const amt = Number(payForm.amount);
    if (!amt || amt <= 0) { setError('יש להזין סכום תקבול'); return; }
    setSaving(true); setError(null);
    const { data: { user } } = await supabase.auth.getUser();
    const { error: err } = await supabase.from('customer_payments').insert({
      invoice_id: payFor.id, amount: amt, paid_at: payForm.paid_at || todayYmd(),
      method: payForm.method, reference: payForm.reference.trim() || null,
      notes: payForm.notes.trim() || null, created_by: user?.id || null,
    });
    if (err) { setSaving(false); setError(err.message); return; }
    // The DB trigger updated the invoice status; if fully paid, stamp linked deliveries too.
    const { data: inv } = await supabase.from('customer_invoices').select('status').eq('id', payFor.id).single();
    if (inv?.status === 'paid') {
      await supabase.from('import_customer_deliveries')
        .update({ paid: true, paid_at: new Date().toISOString(), paid_by: user?.id || null })
        .eq('customer_invoice_id', payFor.id).eq('paid', false);
    }
    setSaving(false);
    setPayFor(null);
    load();
  }

  // ---------- activity ----------
  function openActivity(i: any) {
    setError(null);
    setActFor(i);
    setActForm({ activity_type: 'call', summary: '', promised_date: '', next_action_date: '', assignee: '' });
  }
  async function saveActivity() {
    if (!actFor) return;
    if (!actForm.summary.trim()) { setError('יש לתאר את הפעילות'); return; }
    setSaving(true); setError(null);
    const { data: { user } } = await supabase.auth.getUser();
    const { error: err } = await supabase.from('collection_activities').insert({
      invoice_id: actFor.id,
      activity_type: actForm.activity_type,
      summary: actForm.summary.trim(),
      promised_date: actForm.promised_date || null,
      next_action_date: actForm.next_action_date || null,
      assignee: actForm.assignee || null,
      created_by: user?.id || null,
    });
    setSaving(false);
    if (err) { setError(err.message); return; }
    setActFor(null);
    load();
  }

  // ---------- uploaded SAP invoice file ----------
  function startUpload(i: any) {
    setUploadFor(i);
    fileInputRef.current?.click();
  }
  async function handleFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] || null; // snapshot BEFORE clearing (FileList trap)
    e.target.value = '';
    if (!file || !uploadFor) return;
    setUploading(true);
    const ext = safeExt(file);
    const path = `finance/${uploadFor.id}/${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from('project-files').upload(path, file, { contentType: file.type || 'application/octet-stream' });
    if (upErr) { setUploading(false); alert(`העלאת הקובץ נכשלה: ${upErr.message}`); return; }
    await supabase.from('customer_invoices')
      .update({ file_path: path, updated_at: new Date().toISOString() })
      .eq('id', uploadFor.id);
    setUploading(false);
    setUploadFor(null);
    load();
  }
  // Safari-safe: open the tab synchronously, set the signed URL after await.
  async function openFile(path: string) {
    const w = window.open('about:blank', '_blank');
    const { data: s } = await supabase.storage.from('project-files').createSignedUrl(path, 300);
    if (s?.signedUrl) { if (w) w.location.href = s.signedUrl; else window.location.href = s.signedUrl; }
    else w?.close();
  }

  const FILTERS: { key: Filter; label: string }[] = [
    { key: 'open', label: `פתוחות (${counts.open})` },
    { key: 'overdue', label: `בפיגור (${counts.overdue})` },
    { key: 'paid', label: `שולמו (${counts.paid})` },
    { key: 'cancelled', label: `בוטלו (${counts.cancelled})` },
    { key: 'all', label: `הכל (${counts.all})` },
  ];

  return (
    <div className="p-6 max-w-6xl mx-auto" dir="rtl">
      <SectionTabs tabs={FINANCE_TABS} />
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-content-strong"><Icon name="money" size={24} /> חשבוניות וגבייה</h1>
          <p className="text-sm text-content-muted mt-1">כל חשבוניות הלקוח, יתרות פתוחות, גיול חובות ויומן מעקב גבייה</p>
        </div>
        {canEdit && (
          <Button size="sm" onClick={openNewInvoice}><Icon name="add" size={14} /> חשבונית חדשה</Button>
        )}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <div className="bg-white rounded-xl border border-line-subtle p-4">
          <p className="text-[12px] text-content-muted">חוב פתוח</p>
          <p className="text-xl font-bold text-content-strong ft-figure" dir="ltr">{ils(totalOpen)}</p>
        </div>
        <div className={`bg-white rounded-xl border p-4 ${totalOverdue > 0 ? 'border-danger' : 'border-line-subtle'}`}>
          <p className="text-[12px] text-content-muted">מזה בפיגור</p>
          <p className={`text-xl font-bold ft-figure ${totalOverdue > 0 ? 'text-danger' : 'text-content-strong'}`} dir="ltr">{ils(totalOverdue)}</p>
        </div>
        <div className="bg-white rounded-xl border border-line-subtle p-4">
          <p className="text-[12px] text-content-muted">נגבה החודש</p>
          <p className="text-xl font-bold text-success ft-figure" dir="ltr">{ils(monthCollected)}</p>
        </div>
      </div>

      {/* Aging strip */}
      <div className="bg-white rounded-xl border border-line-subtle p-4 mb-4">
        <p className="text-[12px] text-content-muted mb-2">גיול חוב פתוח (ימי פיגור)</p>
        <div className="grid grid-cols-5 gap-2">
          {AGING_BUCKETS.map((b, idx) => (
            <div key={b.key} className="text-center">
              <p className={`text-sm font-bold ft-figure ${idx === 0 ? 'text-content-strong' : aging[b.key] > 0 ? (idx >= 3 ? 'text-danger' : 'text-warning') : 'text-neutral-300'}`} dir="ltr">
                {ils(aging[b.key])}
              </p>
              <p className="text-[11px] text-content-muted">{b.label}</p>
            </div>
          ))}
        </div>
      </div>

      {missingAmount > 0 && (
        <div className="bg-warning-soft border border-warning rounded-lg px-4 py-2.5 mb-4 text-[13px] text-content-body">
          <Icon name="warning" size={14} /> {missingAmount} חשבוניות פתוחות ללא סכום (הוסבו מתעודות משלוח) — פתח כל אחת ב"עריכה" והשלם את הסכום כדי שהגיול יהיה מדויק.
        </div>
      )}

      <div className="flex flex-wrap gap-2 mb-4 items-center">
        {FILTERS.map((f) => (
          <button key={f.key} onClick={() => setFilter(f.key)}
            className={`text-[12px] px-3 py-1.5 rounded-full border ${filter === f.key ? 'bg-primary text-white border-primary' : 'bg-white text-content-body border-line-subtle hover:bg-neutral-50'}`}>
            {f.label}
          </button>
        ))}
        {projectFilter && (
          <span className="text-[12px] px-3 py-1.5 rounded-full bg-azure-100 text-azure-600 font-semibold flex items-center gap-1.5">
            פרויקט: {projectName[projectFilter] || '—'}
            <button onClick={() => { setProjectFilter(null); window.history.replaceState(null, '', '/finance/collections'); }} className="hover:opacity-70" title="נקה סינון">✕</button>
          </span>
        )}
      </div>

      {loading ? (
        <p className="text-neutral-400 text-center py-12">טוען…</p>
      ) : groups.length === 0 ? (
        <div className="bg-white rounded-xl border border-line-subtle p-12 text-center">
          <p className="mb-3 text-neutral-300"><Icon name="empty" size={40} /></p>
          <p className="text-content-muted">אין חשבוניות בסינון הזה</p>
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map((g) => (
            <div key={g.key} className="bg-white rounded-xl border border-line-subtle overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 bg-neutral-50 border-b border-line-subtle">
                <p className="font-bold text-content-strong text-sm"><Icon name="customers" size={15} /> {g.label}</p>
                {g.balance > 0 && <p className="text-sm font-bold text-content-strong ft-figure" dir="ltr">{ils(g.balance)}</p>}
              </div>
              <div className="divide-y divide-line-subtle">
                {g.rows.map((i) => {
                  const days = overdueDays(i.payment_due_date);
                  const open = isOpen(i);
                  const acts = actsByInvoice[i.id] || [];
                  const lastAct = acts[0];
                  const nextAction = acts.find((a) => a.next_action_date);
                  const isExpanded = expanded === i.id;
                  return (
                    <div key={i.id} className="px-4 py-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2 text-sm">
                          <button onClick={() => setExpanded(isExpanded ? null : i.id)} className="font-bold text-content-strong hover:text-primary" dir="ltr">
                            {i.invoice_number || 'ללא מספר'}
                          </button>
                          <span className="text-[11px] px-1.5 py-0.5 rounded bg-neutral-100 text-content-muted">{TYPE_LABELS[i.invoice_type] || i.invoice_type}</span>
                          {i.project_id && projectName[i.project_id] && (
                            <a href={`/projects/${i.project_id}`} className="text-primary hover:underline text-[13px]">{projectName[i.project_id]}</a>
                          )}
                          <span className="text-[12px] text-content-muted">הופקה {fmtDate(i.issued_at)}</span>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                          {!Number(i.total_amount) && open && (
                            <span className="px-2 py-0.5 rounded-full bg-warning-soft text-warning font-semibold">חסר סכום</span>
                          )}
                          {open && i.payment_due_date && (
                            days > 0
                              ? <span className="px-2 py-0.5 rounded-full bg-danger-soft text-danger font-semibold">בפיגור {days} ימים</span>
                              : <span className="px-2 py-0.5 rounded-full bg-warning-soft text-warning font-semibold">לתשלום עד {fmtDate(i.payment_due_date)}</span>
                          )}
                          {i.status === 'partially_paid' && <span className="px-2 py-0.5 rounded-full bg-azure-100 text-azure-600 font-semibold">שולם חלקית</span>}
                          {i.status === 'paid' && <span className="px-2 py-0.5 rounded-full bg-success-soft text-success font-semibold"><Icon name="confirm" size={11} /> שולם {fmtDate(i.paid_at)}</span>}
                          {i.status === 'cancelled' && <span className="px-2 py-0.5 rounded-full bg-neutral-100 text-content-muted font-semibold">בוטלה</span>}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-2 mt-1.5">
                        <div className="flex flex-wrap items-center gap-3 text-[12px] text-content-muted">
                          <span dir="ltr" className="ft-figure">סה"כ {ils(i.total_amount)}</span>
                          {Number(i.paid_total) > 0 && <span dir="ltr" className="ft-figure text-success">שולם {ils(i.paid_total)}</span>}
                          {open && <span dir="ltr" className="ft-figure font-bold text-content-strong">יתרה {ils(i.balance)}</span>}
                          {lastAct && (
                            <span className="text-neutral-400">
                              <Icon name="chat" size={12} /> {ACTIVITY_LABELS[lastAct.activity_type]}: {lastAct.summary.slice(0, 60)}{lastAct.summary.length > 60 ? '…' : ''}
                            </span>
                          )}
                          {nextAction && open && (
                            <span className={overdueDays(nextAction.next_action_date) >= 0 ? 'text-danger font-semibold' : ''}>
                              <Icon name="calendar" size={12} /> פעולה הבאה: {fmtDate(nextAction.next_action_date)}{nextAction.assignee && teamName[nextAction.assignee] ? ` · ${teamName[nextAction.assignee]}` : ''}
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-3 text-[12px]">
                          {canEdit && open && <button onClick={() => openPayment(i)} className="font-semibold text-success hover:underline"><Icon name="payment" size={12} /> רישום תקבול</button>}
                          {canEdit && open && <button onClick={() => openActivity(i)} className="font-semibold text-azure-600 hover:underline"><Icon name="chat" size={12} /> תיעוד גבייה</button>}
                          {i.invoice_type === 'proforma' && (
                            <button onClick={() => setDocFor(i)} className="font-semibold text-primary hover:underline"><Icon name="file" size={12} /> מסמך פרופורמה</button>
                          )}
                          {i.file_path && <button onClick={() => openFile(i.file_path)} className="text-primary hover:underline"><Icon name="attach" size={12} /> צפה בחשבונית</button>}
                          {canEdit && (
                            <button onClick={() => startUpload(i)} disabled={uploading} className="text-content-muted hover:text-primary hover:underline">
                              <Icon name="attach" size={12} /> {uploading && uploadFor?.id === i.id ? 'מעלה…' : i.file_path ? 'החלף קובץ' : 'העלה קובץ חשבונית'}
                            </button>
                          )}
                          {canEdit && <button onClick={() => openEditInvoice(i)} className="text-primary hover:underline"><Icon name="edit" size={12} /> עריכה</button>}
                        </div>
                      </div>
                      {isExpanded && acts.length > 0 && (
                        <div className="mt-3 bg-neutral-50 rounded-lg p-3 space-y-2">
                          <p className="text-[11px] font-bold text-content-muted">יומן גבייה</p>
                          {acts.map((a) => (
                            <div key={a.id} className="text-[12px] text-content-body">
                              <span className="text-content-muted">{fmtDate(a.created_at)}</span>
                              {' · '}<span className="font-semibold">{ACTIVITY_LABELS[a.activity_type] || a.activity_type}</span>
                              {a.assignee && teamName[a.assignee] ? ` · ${teamName[a.assignee]}` : ''}
                              {' — '}{a.summary}
                              {a.promised_date && <span className="text-success"> (הבטחת תשלום ל-{fmtDate(a.promised_date)})</span>}
                              {a.next_action_date && <span className="text-content-muted"> · לחזור ב-{fmtDate(a.next_action_date)}</span>}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ---------- invoice modal ---------- */}
      <Modal open={!!invoiceForm} onClose={() => setInvoiceForm(null)} size="lg"
        title={invoiceForm?.id ? 'עריכת חשבונית' : 'חשבונית חדשה'}
        footer={<>
          {invoiceForm?.id && canFull && (
            <Button variant="danger" size="sm" onClick={cancelInvoice} disabled={saving}>בטל חשבונית</Button>
          )}
          <Button variant="secondary" size="sm" onClick={() => setInvoiceForm(null)} disabled={saving}>סגור</Button>
          <Button size="sm" onClick={saveInvoice} disabled={saving}>{saving ? 'שומר…' : 'שמור'}</Button>
        </>}>
        {invoiceForm && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4" dir="rtl">
            <Field label="מספר חשבונית">
              <Input dir="ltr" value={invoiceForm.invoice_number} onChange={(e) => setInvoiceForm({ ...invoiceForm, invoice_number: e.target.value })} />
            </Field>
            <Field label="סוג">
              <Select value={invoiceForm.invoice_type} onChange={(e) => setInvoiceForm({ ...invoiceForm, invoice_type: e.target.value })}>
                {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </Field>
            <Field label="לקוח">
              <SearchableSelect
                value={invoiceForm.customer_id}
                onChange={(v) => setInvoiceForm({ ...invoiceForm, customer_id: v })}
                options={[{ value: '', label: '— ללא —' }, ...clients.map((c) => ({ value: c.id, label: c.name }))]}
                placeholder="בחר לקוח" />
            </Field>
            <Field label="פרויקט">
              <SearchableSelect
                value={invoiceForm.project_id}
                onChange={(v) => setInvoiceForm({ ...invoiceForm, project_id: v })}
                options={[{ value: '', label: '— ללא —' }, ...projects.map((p) => ({ value: p.id, label: p.name }))]}
                placeholder="בחר פרויקט" />
            </Field>
            <Field label="סכום לפני מע״מ (₪)">
              <Input dir="ltr" type="number" min="0" step="0.01" value={invoiceForm.amount} onChange={(e) => setAmountWithVat(e.target.value)} />
            </Field>
            <Field label="מע״מ (₪)" hint={`מחושב אוטומטית ${VAT_RATE * 100}% — ניתן לעריכה`}>
              <Input dir="ltr" type="number" min="0" step="0.01" value={invoiceForm.vat_amount} onChange={(e) => setInvoiceForm({ ...invoiceForm, vat_amount: e.target.value })} />
            </Field>
            <Field label="תאריך הפקה">
              <Input dir="ltr" type="date" value={invoiceForm.issued_at} onChange={(e) => setInvoiceForm({ ...invoiceForm, issued_at: e.target.value })} />
            </Field>
            <Field label="תנאי תשלום" hint='למשל "שוטף+60"'>
              <div className="flex gap-2">
                <Input value={invoiceForm.payment_terms} onChange={(e) => setInvoiceForm({ ...invoiceForm, payment_terms: e.target.value })} />
                <Button variant="secondary" size="sm" type="button" onClick={() => setInvoiceForm({
                  ...invoiceForm,
                  payment_due_date: paymentDueDate(invoiceForm.payment_terms, invoiceForm.issued_at ? new Date(invoiceForm.issued_at) : new Date()),
                })}>חשב מועד</Button>
              </div>
            </Field>
            <Field label="מועד תשלום (לגבייה)">
              <Input dir="ltr" type="date" value={invoiceForm.payment_due_date} onChange={(e) => setInvoiceForm({ ...invoiceForm, payment_due_date: e.target.value })} />
            </Field>
            {/* Line detail — feeds the proforma A4 document; optional for other types */}
            <div className="sm:col-span-2">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                <span className="text-sm font-medium text-content-body">פירוט שורות{invoiceForm.invoice_type === 'proforma' ? ' (יוצג במסמך הפרופורמה)' : ''}</span>
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" type="button"
                    onClick={() => setInvoiceForm({ ...invoiceForm, lines: [...invoiceForm.lines, { description: '', qty: '', unit: 'מטר', unit_price: '' }] })}>
                    + שורה
                  </Button>
                  {invoiceForm.lines.length > 0 && (
                    <Button variant="secondary" size="sm" type="button"
                      onClick={() => {
                        const amt = sumLines(invoiceForm.lines);
                        setInvoiceForm({ ...invoiceForm, amount: String(amt), vat_amount: String(Math.round(amt * VAT_RATE * 100) / 100) });
                      }}>
                      סכם שורות ← סכום
                    </Button>
                  )}
                </div>
              </div>
              {invoiceForm.lines.length > 0 && (
                <div className="space-y-1">
                  <div className="grid grid-cols-[1fr_70px_70px_95px_24px] gap-1 text-[11px] text-content-muted px-1">
                    <span>תיאור</span><span>כמות</span><span>יח׳</span><span>מחיר יח׳ ₪</span><span></span>
                  </div>
                  {invoiceForm.lines.map((l, idx) => (
                    <div key={idx} className="grid grid-cols-[1fr_70px_70px_95px_24px] gap-1 items-center">
                      <input value={l.description} onChange={(e) => setInvoiceForm({ ...invoiceForm, lines: invoiceForm.lines.map((x, i2) => i2 === idx ? { ...x, description: e.target.value } : x) })}
                        className="border border-line-subtle rounded px-2 py-1 text-[12px]" dir="ltr" />
                      <input type="number" value={l.qty} onChange={(e) => setInvoiceForm({ ...invoiceForm, lines: invoiceForm.lines.map((x, i2) => i2 === idx ? { ...x, qty: e.target.value } : x) })}
                        className="border border-line-subtle rounded px-2 py-1 text-[12px]" dir="ltr" />
                      <input value={l.unit} onChange={(e) => setInvoiceForm({ ...invoiceForm, lines: invoiceForm.lines.map((x, i2) => i2 === idx ? { ...x, unit: e.target.value } : x) })}
                        className="border border-line-subtle rounded px-2 py-1 text-[12px]" />
                      <input type="number" value={l.unit_price} onChange={(e) => setInvoiceForm({ ...invoiceForm, lines: invoiceForm.lines.map((x, i2) => i2 === idx ? { ...x, unit_price: e.target.value } : x) })}
                        className="border border-line-subtle rounded px-2 py-1 text-[12px]" dir="ltr" />
                      <button onClick={() => setInvoiceForm({ ...invoiceForm, lines: invoiceForm.lines.filter((_, i2) => i2 !== idx) })}
                        className="text-danger text-lg" title="מחק שורה">×</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="sm:col-span-2">
              <Field label="הערות">
                <Textarea rows={2} value={invoiceForm.notes} onChange={(e) => setInvoiceForm({ ...invoiceForm, notes: e.target.value })} />
              </Field>
            </div>
            {error && <p className="sm:col-span-2 text-sm text-danger">{error}</p>}
          </div>
        )}
      </Modal>

      {/* ---------- payment modal ---------- */}
      <Modal open={!!payFor} onClose={() => setPayFor(null)} size="md"
        title={`רישום תקבול — חשבונית ${payFor?.invoice_number || ''}`}
        footer={<>
          <Button variant="secondary" size="sm" onClick={() => setPayFor(null)} disabled={saving}>סגור</Button>
          <Button size="sm" onClick={savePayment} disabled={saving}>{saving ? 'שומר…' : 'שמור תקבול'}</Button>
        </>}>
        {payFor && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4" dir="rtl">
            <div className="sm:col-span-2 text-[13px] text-content-muted">
              יתרה פתוחה: <span className="font-bold text-content-strong ft-figure" dir="ltr">{ils(payFor.balance)}</span>
              {' · '}תקבול חלקי יסמן את החשבונית "שולם חלקית"
            </div>
            <Field label="סכום התקבול (₪)" required>
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
            <Field label="אסמכתא / מס׳ צ׳ק">
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

      {/* ---------- activity modal ---------- */}
      <Modal open={!!actFor} onClose={() => setActFor(null)} size="md"
        title={`תיעוד גבייה — חשבונית ${actFor?.invoice_number || ''}`}
        footer={<>
          <Button variant="secondary" size="sm" onClick={() => setActFor(null)} disabled={saving}>סגור</Button>
          <Button size="sm" onClick={saveActivity} disabled={saving}>{saving ? 'שומר…' : 'שמור'}</Button>
        </>}>
        {actFor && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4" dir="rtl">
            <Field label="סוג פעילות">
              <Select value={actForm.activity_type} onChange={(e) => setActForm({ ...actForm, activity_type: e.target.value })}>
                {Object.entries(ACTIVITY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </Field>
            <Field label="אחראי מעקב">
              <Select value={actForm.assignee} onChange={(e) => setActForm({ ...actForm, assignee: e.target.value })}>
                <option value="">— ללא —</option>
                {team.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </Select>
            </Field>
            <div className="sm:col-span-2">
              <Field label="מה סוכם / מה קרה" required>
                <Textarea rows={3} value={actForm.summary} onChange={(e) => setActForm({ ...actForm, summary: e.target.value })}
                  placeholder='למשל: "דיברתי עם הנה״ח של הלקוח, הצ׳ק יישלח עד סוף החודש"' />
              </Field>
            </div>
            {actForm.activity_type === 'promise' && (
              <Field label="תאריך תשלום מובטח">
                <Input dir="ltr" type="date" value={actForm.promised_date} onChange={(e) => setActForm({ ...actForm, promised_date: e.target.value })} />
              </Field>
            )}
            <Field label="לחזור על זה בתאריך" hint="ייווצר תזכורת אוטומטית ביום הזה">
              <Input dir="ltr" type="date" value={actForm.next_action_date} onChange={(e) => setActForm({ ...actForm, next_action_date: e.target.value })} />
            </Field>
            {error && <p className="sm:col-span-2 text-sm text-danger">{error}</p>}
          </div>
        )}
      </Modal>

      {/* hidden picker for the SAP invoice file */}
      <input ref={fileInputRef} type="file" accept=".pdf,.png,.jpg,.jpeg" className="hidden" onChange={handleFileChosen} />

      {/* proforma A4 document */}
      <Modal open={!!docFor} onClose={() => setDocFor(null)} size="xl"
        title={`חשבונית פרופורמה ${docFor?.invoice_number || ''}`}
        footer={<>
          <Button variant="secondary" size="sm" onClick={() => setDocFor(null)}>סגור</Button>
          <Button size="sm" onClick={() => proformaRef.current?.downloadPdf()}><Icon name="file" size={14} /> הורד PDF</Button>
        </>}>
        {docFor && (
          <ProformaDocument
            ref={proformaRef}
            invoice={docFor}
            customerName={docFor.customer_id ? clientName[docFor.customer_id] : null}
            projectName={docFor.project_id ? projectName[docFor.project_id] : null}
          />
        )}
      </Modal>
    </div>
  );
}
