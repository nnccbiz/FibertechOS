'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { formatILS } from '@/lib/revenue';
import CustomerForm from '@/components/customers/CustomerForm';

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
  const expired = q.valid_until && new Date(q.valid_until) < new Date() && q.status !== 'signed';
  if (q.status === 'signed') return { cls: 'bg-green-50 text-green-700 border-green-200', label: 'אושר' };
  if (q.status === 'rejected') return { cls: 'bg-red-50 text-red-400 border-red-100', label: 'נדחה' };
  if (expired) return { cls: 'bg-red-50 text-red-400 border-red-100', label: 'פג תוקף' };
  if (q.status === 'sent') return { cls: 'bg-orange-50 text-orange-700 border-orange-200', label: 'נשלח · ממתין' };
  return { cls: 'bg-orange-50 text-orange-700 border-orange-200', label: 'טיוטה' };
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
  const [loading, setLoading] = useState(true);
  const [showEdit, setShowEdit] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

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

      const cnMap: Record<string, string> = {};
      (quoteContactsRes.data || []).forEach((c: any) => { cnMap[c.id] = c.name; });
      setQuoteContactNames(cnMap);

      setLoading(false);
    }
    load();
  }, [customerId, reloadKey]);

  if (loading) return <div className="max-w-5xl mx-auto px-4 py-10 text-center text-gray-400" dir="rtl">טוען…</div>;
  if (!customer) return <div className="max-w-5xl mx-auto px-4 py-10 text-center text-red-500" dir="rtl">לקוח לא נמצא.</div>;

  return (
    <div className="max-w-5xl mx-auto px-4 py-6" dir="rtl">
      <div className="flex items-center justify-between mb-4">
        <button onClick={() => router.push('/customers')} className="text-sm text-gray-500 hover:text-gray-700">← חזרה ללקוחות</button>
        <button onClick={() => setShowEdit(true)} className="text-sm bg-blue-50 text-[#1a56db] px-4 py-2 rounded-lg hover:bg-blue-100">✏️ ערוך כרטיס</button>
      </div>

      {showEdit && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center overflow-y-auto p-4" onClick={() => setShowEdit(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl mt-10 p-6" onClick={(e) => e.stopPropagation()}>
            <CustomerForm customerId={customerId} onCancel={() => setShowEdit(false)} onSaved={() => { setShowEdit(false); setReloadKey((k) => k + 1); }} />
          </div>
        </div>
      )}

      {/* Customer header */}
      <div className="bg-white border border-[#e2e8f0] rounded-xl p-5 mb-5">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{customer.name}</h1>
            {customer.tax_id && <p className="text-sm text-gray-500 mt-1" style={{ unicodeBidi: 'plaintext' }}>ח.פ. {customer.tax_id}</p>}
            {(customer.address || customer.city) && <p className="text-sm text-gray-500 mt-1">📍 {[customer.address, customer.city].filter(Boolean).join(', ')}</p>}
          </div>
          <div className="text-sm text-gray-600 text-left">
            {customer.phone && <p style={{ unicodeBidi: 'plaintext' }}>📞 {customer.phone}</p>}
            {customer.email && <p style={{ unicodeBidi: 'plaintext' }}>✉️ {customer.email}</p>}
          </div>
        </div>
        {customer.notes && <p className="text-sm text-gray-500 mt-3 whitespace-pre-line">{customer.notes}</p>}

        {contacts.length > 0 && (
          <div className="mt-4 pt-3 border-t border-gray-100">
            <h3 className="text-[12px] font-semibold text-gray-400 mb-2">אנשי קשר</h3>
            <div className="flex flex-wrap gap-3">
              {contacts.map((ct) => (
                <div key={ct.id} className="text-sm bg-gray-50 rounded-lg px-3 py-2">
                  <span className="font-medium text-gray-700">{ct.name}</span>
                  {ct.role && <span className="text-gray-400"> · {ct.role}</span>}
                  {ct.phone && <span className="text-gray-500 block text-[12px]" style={{ unicodeBidi: 'plaintext' }}>{ct.phone}</span>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Quote history */}
      <h2 className="text-lg font-bold text-gray-800 mb-2">היסטוריית הצעות מחיר</h2>
      <div className="flex items-center gap-3 text-[12px] text-gray-500 mb-3">
        <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded bg-green-200" /> אושר</span>
        <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded bg-orange-200" /> ממתין</span>
        <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-100" /> ישן / נדחה</span>
      </div>

      {quotes.length === 0 ? (
        <p className="text-gray-400 text-sm bg-white border border-[#e2e8f0] rounded-xl p-5 mb-6">אין הצעות מחיר ללקוח זה עדיין.</p>
      ) : (
        <div className="bg-white border border-[#e2e8f0] rounded-xl overflow-hidden mb-6">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-[#e2e8f0] text-[12px] text-gray-500">
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
                    className={`border-b border-gray-50 cursor-pointer transition-colors ${st.cls.split(' ')[0]} hover:brightness-95`}
                  >
                    <td className="px-4 py-3 font-medium text-gray-800">
                      {projName}
                      <span className="block text-[11px] text-gray-400 font-normal">
                        {q.quote_number} · {new Date(q.created_at).toLocaleDateString('he-IL')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{contactName}</td>
                    <td className="px-4 py-3 text-gray-600">{bg}</td>
                    <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{formatILS(q.total_amount || 0)}</td>
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
      <h2 className="text-lg font-bold text-gray-800 mb-2">פרויקטים</h2>
      {projects.length === 0 ? (
        <p className="text-gray-400 text-sm bg-white border border-[#e2e8f0] rounded-xl p-5">אין פרויקטים מקושרים ללקוח זה.</p>
      ) : (
        <div className="bg-white border border-[#e2e8f0] rounded-xl overflow-hidden">
          {projects.map((p) => (
            <div
              key={p.id}
              onClick={() => router.push(`/projects/${p.id}`)}
              className="flex items-center justify-between px-4 py-3 border-b border-gray-50 hover:bg-blue-50/40 cursor-pointer transition-colors"
            >
              <span className="font-medium text-gray-800">{p.name}</span>
              {p.status && <span className="text-[12px] text-gray-400">{p.status}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
