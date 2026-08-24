'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import SearchableSelect from '@/components/ui/SearchableSelect';
import { formatILS } from '@/lib/revenue';
import CustomerForm from '@/components/customers/CustomerForm';
import Icon from '@/components/ui/Icon';

interface Customer {
  id: string; name: string; type: string | null; company: string | null;
  contact_person: string | null; phone: string | null; email: string | null;
  city: string | null; notes: string | null; tax_id: string | null; address: string | null;
}
interface Contact { id: string; name: string; role: string | null; phone: string | null; email: string | null; }
interface QuoteRow {
  id: string; quote_number: string | null; status: string; valid_until: string | null;
  created_at: string; total_amount: number | null; disclaimer_type: string | null;
  project_id: string | null; contact_id: string | null;
}
interface Item { quote_id: string; product_name: string; dn_size: string | null; }

const INSTALL_LABEL: Record<string, string> = {
  grp_pipe: 'צנרת הטמנה',
  grp_push: 'צנרת דחיקה',
  grp_sleeve: 'צנרת השחלה',
  accessories: 'אביזרים',
  lubricants: 'חומרי סיכה',
};

// Pipe vs accessory by Hebrew product name (short pipes/rokers count as accessories).
function isPipe(name: string): boolean {
  const n = (name || '').trim();
  if (n.includes('רוקר') || n.includes('קצר')) return false;
  return n.includes('צנרת') || n.includes('צינור');
}

function buildBackground(disclaimerType: string | null, items: Item[]): string {
  const parts: string[] = [];
  const pipes = items.filter((i) => isPipe(i.product_name));
  const accessories = items.filter((i) => !isPipe(i.product_name));
  const dns = pipes
    .map((i) => parseInt(String(i.dn_size || '').replace(/\D/g, ''), 10))
    .filter((n) => !isNaN(n) && n > 0)
    .sort((a, b) => a - b);
  const installLabel = (disclaimerType && INSTALL_LABEL[disclaimerType]) || (pipes.length ? 'צנרת' : '');
  if (pipes.length && installLabel) {
    const min = dns[0], max = dns[dns.length - 1];
    const range = dns.length ? ` DN${min}${max !== min ? `–${max}` : ''}` : '';
    parts.push(`${installLabel}${range}`);
  } else if (installLabel) {
    parts.push(installLabel);
  }
  if (accessories.length) parts.push(`${accessories.length} אביזרים`);
  return parts.join(' · ') || '—';
}

function statusStyle(q: QuoteRow): { cls: string; label: string } {
  // valid_until is a DATE (UTC midnight); compare date-only against local today
  // so a quote isn't flagged "פג תוקף" from 03:00 on its own last valid day.
  const expired = (() => {
    if (!q.valid_until || q.status === 'signed') return false;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const vu = new Date(String(q.valid_until).slice(0, 10) + 'T00:00:00');
    return vu < today;
  })();
  if (q.status === 'signed') return { cls: 'bg-success-soft text-success border-success', label: 'אושר' };
  if (q.status === 'rejected') return { cls: 'bg-danger-soft text-danger border-danger', label: 'נדחה' };
  if (expired) return { cls: 'bg-danger-soft text-danger border-danger', label: 'פג תוקף' };
  if (q.status === 'sent') return { cls: 'bg-warning-soft text-warning border-warning', label: 'נשלח · ממתין' };
  return { cls: 'bg-warning-soft text-warning border-warning', label: 'טיוטה' };
}

export default function CustomerDetailPage() {
  const params = useParams();
  const router = useRouter();
  const customerId = params.id as string;
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [quotes, setQuotes] = useState<QuoteRow[]>([]);
  const [itemsByQuote, setItemsByQuote] = useState<Record<string, Item[]>>({});
  const [projectNames, setProjectNames] = useState<Record<string, string>>({});
  const [quoteContactNames, setQuoteContactNames] = useState<Record<string, string>>({});
  const [projects, setProjects] = useState<{ id: string; name: string; status: string | null }[]>([]);
  const [openBalance, setOpenBalance] = useState<{ open: number; overdue: number; count: number } | null>(null);
  const [projectContacts, setProjectContacts] = useState<{ id: string; project: string; role: string | null; name: string; company: string | null; phone: string | null; email: string | null; client_contact_id: string | null }[]>([]);
  const [loading, setLoading] = useState(true);
  const [showEdit, setShowEdit] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [allCustomers, setAllCustomers] = useState<{ id: string; name: string }[]>([]);
  const [showMerge, setShowMerge] = useState(false);
  const [mergeTarget, setMergeTarget] = useState('');
  const [merging, setMerging] = useState(false);

  useEffect(() => {
    createClient().from('clients').select('id, name').order('name').then(({ data }) => {
      setAllCustomers((data || []).filter((c: any) => c.id !== customerId));
    });
  }, [customerId, reloadKey]);

  async function mergeCustomer() {
    if (!mergeTarget) return;
    const removeId = mergeTarget;
    const removeName = allCustomers.find((c) => c.id === removeId)?.name || '';
    if (!confirm(`למזג את "${removeName}" לתוך "${customer?.name}"?\nכל ההצעות, הפרויקטים ואנשי הקשר של "${removeName}" יועברו, והכפיל יימחק. הפעולה אינה הפיכה.`)) return;
    setMerging(true);
    try {
      const supabase = createClient();
      await supabase.from('quotes').update({ customer_id: customerId }).eq('customer_id', removeId);
      await supabase.from('projects').update({ customer_id: customerId }).eq('customer_id', removeId);
      await supabase.from('client_contacts').update({ client_id: customerId }).eq('client_id', removeId);
      await supabase.from('clients').delete().eq('id', removeId);
      setShowMerge(false);
      setMergeTarget('');
      setReloadKey((k) => k + 1);
    } catch (err: any) {
      alert(`שגיאה במיזוג: ${err.message}`);
    } finally {
      setMerging(false);
    }
  }

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const [{ data: cust }, { data: cnts }, { data: qts }] = await Promise.all([
        supabase.from('clients').select('*').eq('id', customerId).single(),
        supabase.from('client_contacts').select('id, name, role, phone, email').eq('client_id', customerId).order('created_at'),
        supabase.from('quotes').select('id, quote_number, status, valid_until, created_at, total_amount, disclaimer_type, project_id, contact_id').eq('customer_id', customerId).order('created_at', { ascending: false }),
      ]);
      setCustomer(cust);
      setContacts(cnts || []);
      const quoteList = qts || [];
      setQuotes(quoteList);

      const quoteIds = quoteList.map((q: QuoteRow) => q.id);
      const projectIds = Array.from(new Set(quoteList.map((q: QuoteRow) => q.project_id).filter(Boolean))) as string[];
      const contactIds = Array.from(new Set(quoteList.map((q: QuoteRow) => q.contact_id).filter(Boolean))) as string[];

      const [itemsRes, projViaQuotes, projViaCustomer, quoteContactsRes] = await Promise.all([
        quoteIds.length ? supabase.from('quote_items').select('quote_id, product_name, dn_size').in('quote_id', quoteIds) : Promise.resolve({ data: [] }),
        projectIds.length ? supabase.from('projects').select('id, name, status').in('id', projectIds) : Promise.resolve({ data: [] }),
        supabase.from('projects').select('id, name, status').eq('customer_id', customerId),
        contactIds.length ? supabase.from('project_contacts').select('id, name').in('id', contactIds) : Promise.resolve({ data: [] }),
      ]);

      const grouped: Record<string, Item[]> = {};
      (itemsRes.data || []).forEach((it: any) => { (grouped[it.quote_id] ||= []).push(it); });
      setItemsByQuote(grouped);

      const projMap: Record<string, string> = {};
      const allProjects: Record<string, { id: string; name: string; status: string | null }> = {};
      [...(projViaQuotes.data || []), ...(projViaCustomer.data || [])].forEach((p: any) => {
        projMap[p.id] = p.name;
        allProjects[p.id] = { id: p.id, name: p.name, status: p.status };
      });
      setProjectNames(projMap);
      setProjects(Object.values(allProjects));

      // Project contacts from the customer's linked projects, scoped to people
      // who actually belong to this customer — match on client_contact_id when
      // available (preferred, set by the picker), else fall back to a company
      // name match for older rows that pre-date the cc:/pc: link.
      const allProjectIds = Object.keys(allProjects);
      const clientContactIds = (cnts || []).map((c: any) => c.id);
      const customerName = (cust?.name || '').trim();
      if (allProjectIds.length > 0) {
        const { data: pcs } = await supabase
          .from('project_contacts')
          .select('id, project_id, role, name, company, phone, email, client_contact_id')
          .in('project_id', allProjectIds);
        const mine = (pcs || []).filter((pc: any) => {
          if (pc.client_contact_id && clientContactIds.includes(pc.client_contact_id)) return true;
          if (!pc.client_contact_id && customerName && (pc.company || '').trim() === customerName) return true;
          return false;
        });
        setProjectContacts(mine.map((pc: any) => ({
          id: pc.id, project: projMap[pc.project_id] || '', role: pc.role, name: pc.name,
          company: pc.company, phone: pc.phone, email: pc.email, client_contact_id: pc.client_contact_id || null,
        })));
      } else {
        setProjectContacts([]);
      }

      const cnMap: Record<string, string> = {};
      (quoteContactsRes.data || []).forEach((c: any) => { cnMap[c.id] = c.name; });
      setQuoteContactNames(cnMap);

      // Open collection balance — visible only to users with import:view
      // (RLS on customer_invoice_balances returns no rows otherwise).
      try {
        const { data: invs } = await supabase
          .from('customer_invoice_balances')
          .select('balance, payment_due_date')
          .eq('customer_id', customerId)
          .in('status', ['open', 'partially_paid']);
        if (invs && invs.length) {
          const today = new Date(); today.setHours(0, 0, 0, 0);
          let open = 0, overdue = 0;
          invs.forEach((r: any) => {
            const b = Number(r.balance) || 0;
            open += b;
            if (r.payment_due_date && new Date(r.payment_due_date) < today) overdue += b;
          });
          setOpenBalance({ open, overdue, count: invs.length });
        } else {
          setOpenBalance(null);
        }
      } catch { setOpenBalance(null); }

      setLoading(false);
    }
    load();
  }, [customerId, reloadKey]);

  if (loading) return <div className="max-w-5xl mx-auto px-4 py-10 text-center text-neutral-400" dir="rtl">טוען…</div>;
  if (!customer) return <div className="max-w-5xl mx-auto px-4 py-10 text-center text-danger" dir="rtl">לקוח לא נמצא.</div>;

  return (
    <div className="max-w-5xl mx-auto px-4 py-6" dir="rtl">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <button onClick={() => router.push('/customers')} className="text-sm text-content-muted hover:text-content-body">← חזרה ללקוחות</button>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowMerge((s) => !s)} className="text-sm bg-warning-soft text-warning px-4 py-2 rounded-lg hover:bg-warning-soft"><Icon name="merge" size={16} /> מזג כפילות</button>
          <button onClick={() => setShowEdit(true)} className="text-sm bg-primary-50 text-primary px-4 py-2 rounded-lg hover:bg-primary-100"><Icon name="edit" size={16} /> ערוך כרטיס</button>
        </div>
      </div>

      {showMerge && (
        <div className="bg-warning-soft border border-warning rounded-xl p-4 mb-4 flex items-center gap-2 flex-wrap" dir="rtl">
          <span className="text-sm text-warning">מזג לתוך לקוח זה את:</span>
          <SearchableSelect value={mergeTarget} onChange={(v) => setMergeTarget(v)} className="border border-warning rounded-lg px-3 py-1.5 text-sm min-w-[200px]" placeholder="— בחר לקוח לאיחוד —"
            options={[{ value: '', label: '— בחר לקוח לאיחוד —' }, ...allCustomers.map((c: any) => ({ value: c.id, label: c.name }))]} />
          <button onClick={mergeCustomer} disabled={!mergeTarget || merging} className="text-sm bg-warning text-white px-4 py-1.5 rounded-lg hover:bg-warning disabled:opacity-50">{merging ? 'ממזג…' : 'מזג'}</button>
          <button onClick={() => { setShowMerge(false); setMergeTarget(''); }} className="text-sm text-content-muted px-3 py-1.5">ביטול</button>
          <span className="text-[12px] text-warning w-full">כל ההצעות, הפרויקטים ואנשי הקשר של הלקוח שתבחר יועברו לכרטיס זה, והוא יימחק.</span>
        </div>
      )}

      {showEdit && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center overflow-y-auto p-4" onClick={() => setShowEdit(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl mt-10 p-6" onClick={(e) => e.stopPropagation()}>
            <CustomerForm customerId={customerId} onCancel={() => setShowEdit(false)} onSaved={() => { setShowEdit(false); setReloadKey((k) => k + 1); }} />
          </div>
        </div>
      )}

      {/* Customer header */}
      <div className="bg-white border border-line-subtle rounded-xl p-5 mb-5">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-content-strong">{customer.name}</h1>
            {customer.tax_id && <p className="text-sm text-content-muted mt-1" style={{ unicodeBidi: 'plaintext' }}>ח.פ. {customer.tax_id}</p>}
            {(customer.address || customer.city) && <p className="text-sm text-content-muted mt-1"><Icon name="location" size={14} /> {[customer.address, customer.city].filter(Boolean).join(', ')}</p>}
          </div>
          <div className="text-sm text-content-body text-left">
            {customer.phone && <p><Icon name="phone" size={14} /> <span dir="ltr">{customer.phone}</span></p>}
            {customer.email && <p style={{ unicodeBidi: 'plaintext' }}><Icon name="email" size={14} /> {customer.email}</p>}
          </div>
        </div>
        {customer.notes && <p className="text-sm text-content-muted mt-3 whitespace-pre-line">{customer.notes}</p>}

        {openBalance && openBalance.open > 0 && (
          <div className={`mt-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 ${openBalance.overdue > 0 ? 'border-danger bg-danger-soft' : 'border-warning bg-warning-soft'}`}>
            <p className="m-0 text-sm text-content-body">
              <Icon name="money" size={14} /> יתרת חוב פתוחה: <span className="font-bold ft-figure" dir="ltr">{new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(openBalance.open)}</span>
              <span className="text-content-muted"> ({openBalance.count} חשבוניות)</span>
              {openBalance.overdue > 0 && (
                <span className="text-danger font-semibold"> · מזה בפיגור <span dir="ltr" className="ft-figure">{new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(openBalance.overdue)}</span></span>
              )}
            </p>
            <a href="/finance/collections" className="text-[12px] text-primary hover:underline whitespace-nowrap">למעקב הגבייה ←</a>
          </div>
        )}

      </div>

      {/* One unified contacts card: every master contact (client_contacts),
          annotated with the projects it's attached to, plus legacy
          project-only contacts (company-matched, never linked). */}
      {(() => {
        const merged = [
          ...contacts.map((ct) => ({
            key: `cc-${ct.id}`, name: ct.name, role: ct.role, phone: ct.phone, email: ct.email,
            projects: Array.from(new Set(projectContacts.filter((pc) => pc.client_contact_id === ct.id).map((pc) => pc.project).filter(Boolean))),
          })),
          ...projectContacts
            .filter((pc) => !pc.client_contact_id && !contacts.some((c) => (c.name || '').trim() === (pc.name || '').trim()))
            .map((pc) => ({
              key: `pc-${pc.id}`, name: pc.name, role: pc.role, phone: pc.phone, email: pc.email,
              projects: pc.project ? [pc.project] : [],
            })),
        ];
        if (merged.length === 0) return null;
        return (
          <div className="bg-white border border-line-subtle rounded-xl p-5 mb-5">
            <h2 className="text-sm font-bold text-content-muted mb-3">אנשי קשר</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line-subtle text-[12px] text-content-muted">
                    <th className="text-right font-medium pb-2 pr-1">שם</th>
                    <th className="text-right font-medium pb-2">תפקיד</th>
                    <th className="text-right font-medium pb-2">טלפון</th>
                    <th className="text-right font-medium pb-2">מייל</th>
                    <th className="text-right font-medium pb-2">פרויקטים</th>
                  </tr>
                </thead>
                <tbody>
                  {merged.map((ct) => (
                    <tr key={ct.key} className="border-b border-line-subtle">
                      <td className="py-2 pr-1 font-medium text-content-strong">{ct.name}</td>
                      <td className="py-2 text-content-body">{ct.role || '—'}</td>
                      <td className="py-2 text-content-muted" dir="ltr">{ct.phone || '—'}</td>
                      <td className="py-2 text-content-muted" dir="ltr">{ct.email || '—'}</td>
                      <td className="py-2 text-neutral-400">{ct.projects.length ? ct.projects.join(', ') : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })()}

      {/* Quote history */}
      <h2 className="text-lg font-bold text-content-strong mb-2">היסטוריית הצעות מחיר</h2>
      <div className="flex items-center gap-3 text-[12px] text-content-muted mb-3">
        <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded bg-success" /> אושר</span>
        <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded bg-warning" /> ממתין</span>
        <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded bg-danger" /> ישן / נדחה</span>
      </div>

      {quotes.length === 0 ? (
        <p className="text-neutral-400 text-sm bg-white border border-line-subtle rounded-xl p-5 mb-6">אין הצעות מחיר ללקוח זה עדיין.</p>
      ) : (
        <div className="bg-white border border-line-subtle rounded-xl overflow-hidden mb-6">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-neutral-50 border-b border-line-subtle text-[12px] text-content-muted">
                <th className="text-right font-semibold px-4 py-2.5">פרויקט</th>
                <th className="text-right font-semibold px-4 py-2.5">איש קשר</th>
                <th className="text-right font-semibold px-4 py-2.5">רקע</th>
                <th className="text-right font-semibold px-4 py-2.5">סכום</th>
                <th className="text-center font-semibold px-4 py-2.5">סטטוס</th>
              </tr>
            </thead>
            <tbody>
              {quotes.map((q) => {
                const st = statusStyle(q);
                const bg = buildBackground(q.disclaimer_type, itemsByQuote[q.id] || []);
                const projName = (q.project_id && projectNames[q.project_id]) || '—';
                const contactName = (q.contact_id && quoteContactNames[q.contact_id]) || '—';
                return (
                  <tr
                    key={q.id}
                    onClick={() => q.project_id && router.push(`/projects/${q.project_id}/quote/${q.id}`)}
                    className={`border-b border-line-subtle cursor-pointer transition-colors ${st.cls.split(' ')[0]} hover:brightness-95`}
                  >
                    <td className="px-4 py-3 font-medium text-content-strong">
                      {projName}
                      <span className="block text-[11px] text-neutral-400 font-normal">
                        {q.quote_number} · {new Date(q.created_at).toLocaleDateString('he-IL')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-content-body">{contactName}</td>
                    <td className="px-4 py-3 text-content-body">{bg}</td>
                    <td className="px-4 py-3 text-content-body whitespace-nowrap">{formatILS(q.total_amount || 0)}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-[11px] px-2 py-1 rounded-full border ${st.cls}`}>{st.label}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Projects */}
      <h2 className="text-lg font-bold text-content-strong mb-2">פרויקטים</h2>
      {projects.length === 0 ? (
        <p className="text-neutral-400 text-sm bg-white border border-line-subtle rounded-xl p-5">אין פרויקטים מקושרים ללקוח זה.</p>
      ) : (
        <div className="bg-white border border-line-subtle rounded-xl overflow-hidden">
          {projects.map((p) => (
            <div
              key={p.id}
              onClick={() => router.push(`/projects/${p.id}`)}
              className="flex items-center justify-between px-4 py-3 border-b border-line-subtle hover:bg-azure-100 cursor-pointer transition-colors"
            >
              <span className="font-medium text-content-strong">{p.name}</span>
              {p.status && <span className="text-[12px] text-neutral-400">{p.status}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
