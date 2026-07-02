'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import CustomerForm from '@/components/customers/CustomerForm';
import { isSimilarName } from '@/components/projects/CompanyAutocomplete';

interface Customer {
  id: string;
  name: string;
  type: string | null;
  company: string | null;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
}

interface Contact {
  id: string;
  client_id: string;
  name: string;
  role: string | null;
  phone: string | null;
  email: string | null;
}

export default function CustomersPage() {
  const router = useRouter();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [quoteCounts, setQuoteCounts] = useState<Record<string, number>>({});
  const [projectCounts, setProjectCounts] = useState<Record<string, number>>({});
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const [{ data: cls }, { data: cnts }, { data: qts }] = await Promise.all([
        supabase.from('clients').select('id, name, type, company, contact_person, phone, email, city').order('name'),
        supabase.from('client_contacts').select('id, client_id, name, role, phone, email'),
        supabase.from('quotes').select('customer_id, project_id'),
      ]);
      setCustomers(cls || []);
      setContacts(cnts || []);
      const qc: Record<string, number> = {};
      const projSets: Record<string, Set<string>> = {};
      (qts || []).forEach((q: any) => {
        if (!q.customer_id) return;
        qc[q.customer_id] = (qc[q.customer_id] || 0) + 1;
        if (q.project_id) {
          (projSets[q.customer_id] ||= new Set()).add(q.project_id);
        }
      });
      const pc: Record<string, number> = {};
      Object.entries(projSets).forEach(([k, set]) => { pc[k] = set.size; });
      setQuoteCounts(qc);
      setProjectCounts(pc);
      setLoading(false);
    }
    load();
  }, []);

  const q = search.trim().toLowerCase();
  const contactsByClient: Record<string, Contact[]> = {};
  contacts.forEach((c) => { (contactsByClient[c.client_id] ||= []).push(c); });

  const filtered = customers.filter((c) => {
    if (!q) return true;
    const ownFields = [c.name, c.company, c.contact_person, c.phone, c.email, c.city];
    const contactFields = (contactsByClient[c.id] || []).flatMap((ct) => [ct.name, ct.phone, ct.email]);
    return [...ownFields, ...contactFields].some((f) => (f || '').toLowerCase().includes(q));
  });

  const dupPairs: [Customer, Customer][] = [];
  for (let i = 0; i < customers.length; i++)
    for (let j = i + 1; j < customers.length; j++)
      if (isSimilarName(customers[i].name, customers[j].name)) dupPairs.push([customers[i], customers[j]]);

  return (
    <div className="max-w-5xl mx-auto px-4 py-6" dir="rtl">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-2xl font-bold text-gray-900">👥 לקוחות</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-400">{filtered.length} לקוחות</span>
          <button onClick={() => setShowForm(true)} className="text-sm bg-[#1a56db] text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors">+ לקוח חדש</button>
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center overflow-y-auto p-4" onClick={() => setShowForm(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl mt-10 p-6" onClick={(e) => e.stopPropagation()}>
            <CustomerForm onCancel={() => setShowForm(false)} onSaved={(id) => router.push(`/customers/${id}`)} />
          </div>
        </div>
      )}

      {dupPairs.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-5">
          <p className="text-sm font-semibold text-amber-800 mb-2">⚠️ כפילויות אפשריות ({dupPairs.length})</p>
          <div className="space-y-1">
            {dupPairs.map(([a, b], idx) => (
              <div key={idx} className="text-[13px] text-amber-800 flex items-center gap-2 flex-wrap">
                <button onClick={() => router.push(`/customers/${a.id}`)} className="font-medium hover:underline">{a.name}</button>
                <span className="text-amber-400">↔</span>
                <button onClick={() => router.push(`/customers/${b.id}`)} className="font-medium hover:underline">{b.name}</button>
                <span className="text-[11px] text-amber-600">— היכנס לאחד מהם ולחץ &quot;מזג כפילות&quot;</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="חיפוש לפי שם חברה, איש קשר, טלפון או מייל…"
        className="w-full border border-[#e2e8f0] rounded-lg px-4 py-2.5 text-sm mb-5 focus:outline-none focus:ring-2 focus:ring-[#1a56db]/20"
      />

      {loading ? (
        <p className="text-center text-gray-400 py-10">טוען…</p>
      ) : filtered.length === 0 ? (
        <p className="text-center text-gray-400 py-10">לא נמצאו לקוחות.</p>
      ) : (
        <div className="bg-white border border-[#e2e8f0] rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-[#e2e8f0] text-[12px] text-gray-500">
                <th className="text-right font-semibold px-4 py-2.5">שם הלקוח</th>
                <th className="text-right font-semibold px-4 py-2.5">איש קשר</th>
                <th className="text-right font-semibold px-4 py-2.5">טלפון</th>
                <th className="text-right font-semibold px-4 py-2.5">מייל</th>
                <th className="text-center font-semibold px-4 py-2.5">הצעות</th>
                <th className="text-center font-semibold px-4 py-2.5">פרויקטים</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => {
                const primary = c.contact_person || (contactsByClient[c.id]?.[0]?.name) || '—';
                const phone = c.phone || contactsByClient[c.id]?.[0]?.phone || '—';
                const email = c.email || contactsByClient[c.id]?.[0]?.email || '—';
                return (
                  <tr
                    key={c.id}
                    onClick={() => router.push(`/customers/${c.id}`)}
                    className="border-b border-gray-50 hover:bg-blue-50/40 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3 font-medium text-gray-800">
                      {c.name}
                      {c.city && <span className="text-gray-400 font-normal"> · {c.city}</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{primary}</td>
                    <td className="px-4 py-3 text-gray-500"><span dir="ltr">{phone}</span></td>
                    <td className="px-4 py-3 text-gray-500" style={{ unicodeBidi: 'plaintext' }}>{email}</td>
                    <td className="px-4 py-3 text-center text-gray-700">{quoteCounts[c.id] || 0}</td>
                    <td className="px-4 py-3 text-center text-gray-700">{projectCounts[c.id] || 0}</td>
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
