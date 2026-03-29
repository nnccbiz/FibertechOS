'use client';

import { useState } from 'react';
import SignaturePad from '../ui/SignaturePad';
import PhotoUpload from '../ui/PhotoUpload';

/** B-244 — טופס תיוג להנעה והדרכה של צנרת דחיקה */
export default function FormB244() {
  const [form, setForm] = useState({
    report_number: '',
    report_date: new Date().toISOString().slice(0, 10),
    project_id: '',
    contractor_name: '',
    training_type: 'הנעה',
    pipe_type: 'צנרת דחיקה',
    dn_size: '',
    attendees: [{ name: '', role: '', phone: '' }],
    safety_briefing_done: false,
    handling_demo_done: false,
    connection_demo_done: false,
    sealing_demo_done: false,
    labeling_done: false,
    notes: '',
  });

  const [photos, setPhotos] = useState<File[]>([]);
  const [contractorSig, setContractorSig] = useState('');
  const [fibertechSig, setFibertechSig] = useState('');

  function set<K extends keyof typeof form>(key: K, val: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: val }));
  }

  function addAttendee() {
    setForm((prev) => ({
      ...prev,
      attendees: [...prev.attendees, { name: '', role: '', phone: '' }],
    }));
  }

  function updateAttendee(index: number, field: string, value: string) {
    setForm((prev) => ({
      ...prev,
      attendees: prev.attendees.map((a, i) => (i === index ? { ...a, [field]: value } : a)),
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // TODO: submit to Supabase
    console.log({ form, photos, contractorSig, fibertechSig });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl mx-auto p-4" dir="rtl">
      <h2 className="text-xl font-bold">B-244 — טופס תיוג להנעה והדרכה</h2>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">מספר דו״ח</label>
          <input type="text" value={form.report_number} onChange={(e) => set('report_number', e.target.value)} required className="mt-1 block w-full rounded border-gray-300 shadow-sm" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">תאריך</label>
          <input type="date" value={form.report_date} onChange={(e) => set('report_date', e.target.value)} required className="mt-1 block w-full rounded border-gray-300 shadow-sm" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">שם קבלן</label>
          <input type="text" value={form.contractor_name} onChange={(e) => set('contractor_name', e.target.value)} className="mt-1 block w-full rounded border-gray-300 shadow-sm" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">סוג הדרכה</label>
          <select value={form.training_type} onChange={(e) => set('training_type', e.target.value)} className="mt-1 block w-full rounded border-gray-300 shadow-sm">
            <option value="הנעה">הנעה</option>
            <option value="הדרכה">הדרכה</option>
          </select>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">קוטר (DN)</label>
        <input type="text" value={form.dn_size} onChange={(e) => set('dn_size', e.target.value)} placeholder="e.g. DN900" className="mt-1 block w-full rounded border-gray-300 shadow-sm" />
      </div>

      {/* Attendees */}
      <fieldset className="border rounded-lg p-4 space-y-3">
        <legend className="text-sm font-semibold px-2">משתתפים</legend>
        {form.attendees.map((a, i) => (
          <div key={i} className="grid grid-cols-3 gap-2">
            <input type="text" placeholder="שם" value={a.name} onChange={(e) => updateAttendee(i, 'name', e.target.value)} className="rounded border-gray-300 shadow-sm" />
            <input type="text" placeholder="תפקיד" value={a.role} onChange={(e) => updateAttendee(i, 'role', e.target.value)} className="rounded border-gray-300 shadow-sm" />
            <input type="tel" placeholder="טלפון" value={a.phone} onChange={(e) => updateAttendee(i, 'phone', e.target.value)} className="rounded border-gray-300 shadow-sm" />
          </div>
        ))}
        <button type="button" onClick={addAttendee} className="text-sm text-blue-600 hover:underline">+ הוסף משתתף</button>
      </fieldset>

      {/* Checklist */}
      <fieldset className="border rounded-lg p-4 space-y-2">
        <legend className="text-sm font-semibold px-2">צ׳קליסט הדרכה</legend>
        {[
          { key: 'safety_briefing_done' as const, label: 'תדרוך בטיחות בוצע' },
          { key: 'handling_demo_done' as const, label: 'הדגמת טיפול בצנרת' },
          { key: 'connection_demo_done' as const, label: 'הדגמת חיבור צנרת' },
          { key: 'sealing_demo_done' as const, label: 'הדגמת איטום' },
          { key: 'labeling_done' as const, label: 'תיוג צנרת בוצע' },
        ].map(({ key, label }) => (
          <label key={key} className="flex items-center gap-3 text-sm">
            <input type="checkbox" checked={form[key]} onChange={(e) => set(key, e.target.checked)} className="h-5 w-5 rounded" />
            {label}
          </label>
        ))}
      </fieldset>

      <PhotoUpload label="תמונות מההדרכה" onUpload={setPhotos} />

      <div>
        <label className="block text-sm font-medium text-gray-700">הערות</label>
        <textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} rows={3} className="mt-1 block w-full rounded border-gray-300 shadow-sm" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <SignaturePad label="חתימת קבלן" onSave={setContractorSig} />
        <SignaturePad label="חתימת פיברטק" onSave={setFibertechSig} />
      </div>

      <button type="submit" className="w-full py-3 bg-blue-600 text-white rounded-lg text-lg font-semibold hover:bg-blue-700">
        שלח דו״ח B-244
      </button>
    </form>
  );
}
