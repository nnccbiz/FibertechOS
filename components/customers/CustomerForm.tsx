'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

interface ContactRow {
  id?: string;
  name: string;
  role: string;
  phone: string;
  email: string;
}

interface Props {
  customerId?: string;            // edit mode when provided
  onSaved: (customerId: string) => void;
  onCancel: () => void;
}

const EMPTY_CONTACT: ContactRow = { name: '', role: '', phone: '', email: '' };

export default function CustomerForm({ customerId, onSaved, onCancel }: Props) {
  const supabase = createClient();
  const isEdit = !!customerId;
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', tax_id: '', address: '', city: '', phone: '', email: '', notes: '' });
  const [contacts, setContacts] = useState<ContactRow[]>([{ ...EMPTY_CONTACT }]);

  useEffect(() => {
    if (!customerId) return;
    async function load() {
      const [{ data: c }, { data: cnts }] = await Promise.all([
        supabase.from('clients').select('*').eq('id', customerId).single(),
        supabase.from('client_contacts').select('id, name, role, phone, email').eq('client_id', customerId).order('created_at'),
      ]);
      if (c) setForm({ name: c.name || '', tax_id: c.tax_id || '', address: c.address || '', city: c.city || '', phone: c.phone || '', email: c.email || '', notes: c.notes || '' });
      setContacts((cnts && cnts.length > 0) ? cnts.map((x: any) => ({ id: x.id, name: x.name || '', role: x.role || '', phone: x.phone || '', email: x.email || '' })) : [{ ...EMPTY_CONTACT }]);
      setLoading(false);
    }
    load();
  }, [customerId]);

  function updateContact(i: number, field: keyof ContactRow, val: string) {
    setContacts((prev) => prev.map((c, idx) => idx === i ? { ...c, [field]: val } : c));
  }

  async function handleSave() {
    if (!form.name.trim()) { alert('שם החברה הוא שדה חובה'); return; }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(), tax_id: form.tax_id.trim() || null, address: form.address.trim() || null,
        city: form.city.trim() || null, phone: form.phone.trim() || null, email: form.email.trim() || null,
        notes: form.notes.trim() || null,
      };
      let cid = customerId;
      if (isEdit) {
        await supabase.from('clients').update(payload).eq('id', customerId);
      } else {
        const { data, error } = await supabase.from('clients').insert({ ...payload, type: 'לקוח' }).select('id').single();
        if (error) throw error;
        cid = data.id;
      }

      // Replace the contact set (simple + reliable for small lists).
      const validContacts = contacts.filter((c) => c.name.trim() || c.phone.trim() || c.email.trim());
      if (isEdit) await supabase.from('client_contacts').delete().eq('client_id', cid);
      if (validContacts.length > 0) {
        await supabase.from('client_contacts').insert(validContacts.map((c) => ({
          client_id: cid, name: c.name.trim(), role: c.role.trim() || null, phone: c.phone.trim() || null, email: c.email.trim() || null,
        })));
      }
      onSaved(cid as string);
    } catch (err: any) {
      alert(`שגיאה בשמירה: ${err.message}`);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="text-center text-gray-400 py-6">טוען…</p>;

  const inputCls = 'w-full border border-[#e2e8f0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a56db]/20';

  return (
    <div dir="rtl">
      <h2 className="text-lg font-bold text-gray-900 mb-4">{isEdit ? 'עריכת כרטיס לקוח' : 'לקוח חדש'}</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
        <div className="md:col-span-2">
          <label className="block text-[12px] font-semibold text-gray-500 mb-1">שם החברה *</label>
          <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputCls} placeholder="שם החברה / הלקוח" autoFocus />
        </div>
        <div>
          <label className="block text-[12px] font-semibold text-gray-500 mb-1">ח.פ. / ע.מ.</label>
          <input type="text" value={form.tax_id} onChange={(e) => setForm({ ...form, tax_id: e.target.value })} className={inputCls} style={{ unicodeBidi: 'plaintext' }} />
        </div>
        <div>
          <label className="block text-[12px] font-semibold text-gray-500 mb-1">עיר</label>
          <input type="text" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} className={inputCls} />
        </div>
        <div className="md:col-span-2">
          <label className="block text-[12px] font-semibold text-gray-500 mb-1">כתובת</label>
          <input type="text" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className={inputCls} />
        </div>
        <div>
          <label className="block text-[12px] font-semibold text-gray-500 mb-1">טלפון (משרד)</label>
          <input type="text" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={inputCls} style={{ unicodeBidi: 'plaintext' }} />
        </div>
        <div>
          <label className="block text-[12px] font-semibold text-gray-500 mb-1">מייל (משרד)</label>
          <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={inputCls} style={{ unicodeBidi: 'plaintext' }} />
        </div>
      </div>

      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <label className="text-[12px] font-semibold text-gray-500">אנשי קשר</label>
          <button onClick={() => setContacts([...contacts, { ...EMPTY_CONTACT }])} className="text-[12px] text-[#1a56db] hover:underline">+ הוסף איש קשר</button>
        </div>
        <div className="space-y-2">
          {contacts.map((c, i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr_1fr_1fr_28px] gap-2 items-center">
              <input type="text" value={c.name} onChange={(e) => updateContact(i, 'name', e.target.value)} placeholder="שם" className="border border-[#e2e8f0] rounded px-2 py-1.5 text-sm" />
              <input type="text" value={c.role} onChange={(e) => updateContact(i, 'role', e.target.value)} placeholder="תפקיד" className="border border-[#e2e8f0] rounded px-2 py-1.5 text-sm" />
              <input type="text" value={c.phone} onChange={(e) => updateContact(i, 'phone', e.target.value)} placeholder="טלפון" className="border border-[#e2e8f0] rounded px-2 py-1.5 text-sm" style={{ unicodeBidi: 'plaintext' }} />
              <input type="email" value={c.email} onChange={(e) => updateContact(i, 'email', e.target.value)} placeholder="מייל" className="border border-[#e2e8f0] rounded px-2 py-1.5 text-sm" style={{ unicodeBidi: 'plaintext' }} />
              <button onClick={() => setContacts(contacts.length > 1 ? contacts.filter((_, idx) => idx !== i) : [{ ...EMPTY_CONTACT }])} className="text-red-400 hover:text-red-600 text-lg">×</button>
            </div>
          ))}
        </div>
      </div>

      <div className="mb-4">
        <label className="block text-[12px] font-semibold text-gray-500 mb-1">הערות</label>
        <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className={`${inputCls} min-h-[60px] resize-y`} />
      </div>

      <div className="flex items-center justify-end gap-2">
        <button onClick={onCancel} className="text-sm text-gray-500 px-4 py-2 rounded-lg hover:bg-gray-100">ביטול</button>
        <button onClick={handleSave} disabled={saving} className="text-sm bg-[#1a56db] text-white px-5 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50">{saving ? 'שומר…' : 'שמור'}</button>
      </div>
    </div>
  );
}
