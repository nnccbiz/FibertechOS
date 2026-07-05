'use client';

import { useState, useEffect } from 'react';
import CompanyAutocomplete from '@/components/projects/CompanyAutocomplete';
import SearchableSelect from '@/components/ui/SearchableSelect';
import Icon from '@/components/ui/Icon';

export interface ProjectContact {
  role: string;
  name: string;
  company: string;
  phone: string;
  email: string;
}

interface ContactsInputProps {
  contacts: ProjectContact[];
  onChange: (contacts: ProjectContact[]) => void;
  customerOptions?: string[];
}

const ROLES = [
  'מזמין הפרויקט',
  'מלווה מטעם המזמין',
  'קבלן/נציג',
  'רכש',
  'מנהל הפרויקט',
  'מפקח',
  'מתכנן',
  'משרד מתכנן',
];

export default function ContactsInput({ contacts, onChange, customerOptions = [] }: ContactsInputProps) {
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
    onChange([...contacts, { role: '', name: '', company: '', phone: '', email: '' }]);
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
        company: '',
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
            <div key={i} className="border border-line-subtle rounded-lg p-2 space-y-2">
              <div className="flex gap-2 items-center">
                <SearchableSelect
                  value={contact.role}
                  onChange={(v) => updateContact(i, 'role', v)}
                  className="w-36 border border-line-subtle rounded-lg px-2 py-2 text-sm"
                  placeholder="תפקיד"
                  options={[{ value: '', label: 'תפקיד' }, ...ROLES.map((r) => ({ value: r, label: r }))]}
                />
                <input
                  type="text"
                  value={contact.name}
                  onChange={(e) => updateContact(i, 'name', e.target.value)}
                  placeholder="שם איש הקשר"
                  autoComplete="name"
                  className="flex-1 min-w-0 border border-line-subtle rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary"
                />
                <button
                  type="button"
                  onClick={() => removeContact(i)}
                  className="text-danger hover:text-danger text-lg text-center flex-shrink-0"
                >
                  <Icon name="close" size={18} />
                </button>
              </div>
              <div className="flex gap-2 items-start">
                <CompanyAutocomplete
                  value={contact.company}
                  onChange={(v) => updateContact(i, 'company', v)}
                  options={customerOptions}
                  className="w-full border border-line-subtle rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary"
                />
                <input
                  type="tel"
                  value={contact.phone}
                  onChange={(e) => updateContact(i, 'phone', e.target.value)}
                  placeholder="טלפון"
                  autoComplete="tel"
                  className="w-40 border border-line-subtle rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary"
                  dir="ltr"
                />
                <input
                  type="email"
                  value={contact.email}
                  onChange={(e) => updateContact(i, 'email', e.target.value)}
                  placeholder="מייל"
                  autoComplete="email"
                  className="flex-1 min-w-0 border border-line-subtle rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary"
                  dir="ltr"
                />
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={addContact}
          className="text-sm text-primary hover:underline"
        >
          + הוסף איש קשר
        </button>
        {pickerSupported && (
          <button
            type="button"
            onClick={pickFromPhone}
            className="text-sm text-primary bg-primary-50 hover:bg-primary-100 px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors"
          >
            <Icon name="mobile" size={16} /> בחר מאנשי הקשר
          </button>
        )}
      </div>
    </div>
  );
}
