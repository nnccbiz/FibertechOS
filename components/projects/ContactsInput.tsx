'use client';

import { useState, useEffect } from 'react';

export interface ProjectContact {
  role: string;
  name: string;
  phone: string;
  email: string;
}

interface ContactsInputProps {
  contacts: ProjectContact[];
  onChange: (contacts: ProjectContact[]) => void;
}

const ROLES = [
  'מזמין הפרויקט',
  'מלווה מטעם המזמין',
  'קבלן/נציג',
  'מנהל הפרויקט',
  'מפקח',
  'מתכנן',
  'משרד מתכנן',
];

export default function ContactsInput({ contacts, onChange }: ContactsInputProps) {
  const [pickerSupported, setPickerSupported] = useState(false);

  useEffect(() => {
    setPickerSupported(
      typeof navigator !== 'undefined' &&
      'contacts' in navigator &&
      // @ts-ignore
      typeof navigator.contacts?.select === 'function'
    );
  }, []);

  function updateContact(index: number, field: keyof ProjectContact, value: string) {
    const updated = [...contacts];
    updated[index] = { ...updated[index], [field]: value };
    onChange(updated);
  }

  function addContact() {
    onChange([...contacts, { role: '', name: '', phone: '', email: '' }]);
  }

  function removeContact(index: number) {
    onChange(contacts.filter((_, i) => i !== index));
  }

  async function pickFromPhone() {
    try {
      // @ts-ignore — Contact Picker API not yet in TS stdlib
      const results = await navigator.contacts.select(['name', 'tel', 'email'], { multiple: true });
      if (!results || results.length === 0) return;
      const newContacts: ProjectContact[] = results.map((c: any) => ({
        role: '',
        name: c.name?.[0] || '',
        phone: c.tel?.[0] || '',
        email: c.email?.[0] || '',
      }));
      onChange([...contacts, ...newContacts]);
    } catch {
      // ביטל בחירה
    }
  }

  return (
    <div>
      {contacts.length > 0 && (
        <div className="space-y-2 mb-3">
          {contacts.map((contact, i) => (
            <div key={i} className="grid grid-cols-12 gap-2 items-center">
              <select
                value={contact.role}
                onChange={(e) => updateContact(i, 'role', e.target.value)}
                className="col-span-3 border border-[#e2e8f0] rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a56db]/20 focus:border-[#1a56db] bg-white"
              >
                <option value="">תפקיד</option>
                {ROLES.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
              <input
                type="text"
                value={contact.name}
                onChange={(e) => updateContact(i, 'name', e.target.value)}
                placeholder="שם"
                autoComplete="name"
                className="col-span-3 border border-[#e2e8f0] rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a56db]/20 focus:border-[#1a56db]"
              />
              <input
                type="tel"
                value={contact.phone}
                onChange={(e) => updateContact(i, 'phone', e.target.value)}
                placeholder="טלפון"
                autoComplete="tel"
                className="col-span-2 border border-[#e2e8f0] rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a56db]/20 focus:border-[#1a56db]"
                dir="ltr"
              />
              <input
                type="email"
                value={contact.email}
                onChange={(e) => updateContact(i, 'email', e.target.value)}
                placeholder="מייל"
                autoComplete="email"
                className="col-span-3 border border-[#e2e8f0] rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a56db]/20 focus:border-[#1a56db]"
                dir="ltr"
              />
              <button
                type="button"
                onClick={() => removeContact(i)}
                className="col-span-1 text-red-400 hover:text-red-600 text-sm text-center"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={addContact}
          className="text-sm text-[#1a56db] hover:underline"
        >
          + הוסף איש קשר
        </button>
        {pickerSupported && (
          <button
            type="button"
            onClick={pickFromPhone}
            className="text-sm text-[#1a56db] bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors"
          >
            📱 בחר מאנשי הקשר
          </button>
        )}
      </div>
    </div>
  );
}
