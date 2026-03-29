'use client';

import { useState } from 'react';
import SignaturePad from '../ui/SignaturePad';
import PhotoUpload from '../ui/PhotoUpload';

/** B-165 — טופס ביצוע פיילוט לצנרת דחיקה */
export default function FormB165() {
  const [form, setForm] = useState({
    report_number: '',
    report_date: new Date().toISOString().slice(0, 10),
    project_id: '',
    contractor_name: '',
    pipe_type: 'צנרת דחיקה',
    dn_size: '',
    pilot_length_m: '',
    trench_depth_m: '',
    trench_width_m: '',
    bedding_material: '',
    backfill_material: '',
    // Checklist
    trench_prep_ok: false,
    bedding_ok: false,
    pipe_lowering_ok: false,
    connection_method_ok: false,
    backfill_ok: false,
    alignment_ok: false,
    // Results
    pilot_passed: null as boolean | null,
    defects_found: '',
    corrective_actions: '',
    notes: '',
  });

  const [photos, setPhotos] = useState<File[]>([]);
  const [contractorSig, setContractorSig] = useState('');
  const [fibertechSig, setFibertechSig] = useState('');

  function set<K extends keyof typeof form>(key: K, val: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: val }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    console.log({ form, photos, contractorSig, fibertechSig });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl mx-auto p-4" dir="rtl">
      <h2 className="text-xl font-bold">B-165 — טופס ביצוע פיילוט</h2>

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
          <label className="block text-sm font-medium text-gray-700">קוטר (DN)</label>
          <input type="text" value={form.dn_size} onChange={(e) => set('dn_size', e.target.value)} placeholder="DN900" className="mt-1 block w-full rounded border-gray-300 shadow-sm" />
        </div>
      </div>

      {/* Measurements */}
      <fieldset className="border rounded-lg p-4 space-y-3">
        <legend className="text-sm font-semibold px-2">מידות</legend>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-gray-600">אורך פיילוט (מ׳)</label>
            <input type="number" step="0.1" value={form.pilot_length_m} onChange={(e) => set('pilot_length_m', e.target.value)} className="mt-1 block w-full rounded border-gray-300 shadow-sm" />
          </div>
          <div>
            <label className="block text-sm text-gray-600">עומק תעלה (מ׳)</label>
            <input type="number" step="0.1" value={form.trench_depth_m} onChange={(e) => set('trench_depth_m', e.target.value)} className="mt-1 block w-full rounded border-gray-300 shadow-sm" />
          </div>
          <div>
            <label className="block text-sm text-gray-600">רוחב תעלה (מ׳)</label>
            <input type="number" step="0.1" value={form.trench_width_m} onChange={(e) => set('trench_width_m', e.target.value)} className="mt-1 block w-full rounded border-gray-300 shadow-sm" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-gray-600">חומר מצע</label>
            <input type="text" value={form.bedding_material} onChange={(e) => set('bedding_material', e.target.value)} className="mt-1 block w-full rounded border-gray-300 shadow-sm" />
          </div>
          <div>
            <label className="block text-sm text-gray-600">חומר מילוי חוזר</label>
            <input type="text" value={form.backfill_material} onChange={(e) => set('backfill_material', e.target.value)} className="mt-1 block w-full rounded border-gray-300 shadow-sm" />
          </div>
        </div>
      </fieldset>

      {/* Checklist */}
      <fieldset className="border rounded-lg p-4 space-y-2">
        <legend className="text-sm font-semibold px-2">צ׳קליסט פיילוט</legend>
        {[
          { key: 'trench_prep_ok' as const, label: 'הכנת תעלה תקינה' },
          { key: 'bedding_ok' as const, label: 'מצע תקין' },
          { key: 'pipe_lowering_ok' as const, label: 'הורדת צנרת תקינה' },
          { key: 'connection_method_ok' as const, label: 'שיטת חיבור תקינה' },
          { key: 'backfill_ok' as const, label: 'מילוי חוזר תקין' },
          { key: 'alignment_ok' as const, label: 'יישור צנרת תקין' },
        ].map(({ key, label }) => (
          <label key={key} className="flex items-center gap-3 text-sm">
            <input type="checkbox" checked={form[key]} onChange={(e) => set(key, e.target.checked)} className="h-5 w-5 rounded" />
            {label}
          </label>
        ))}
      </fieldset>

      {/* Results */}
      <fieldset className="border rounded-lg p-4 space-y-3">
        <legend className="text-sm font-semibold px-2">תוצאות פיילוט</legend>
        <div className="flex gap-4">
          <label className="flex items-center gap-2">
            <input type="radio" name="pilot_passed" checked={form.pilot_passed === true} onChange={() => set('pilot_passed', true)} />
            <span className="text-green-700 font-medium">עבר</span>
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name="pilot_passed" checked={form.pilot_passed === false} onChange={() => set('pilot_passed', false)} />
            <span className="text-red-700 font-medium">נכשל</span>
          </label>
        </div>
        <div>
          <label className="block text-sm text-gray-600">ליקויים שנמצאו</label>
          <textarea value={form.defects_found} onChange={(e) => set('defects_found', e.target.value)} rows={2} className="mt-1 block w-full rounded border-gray-300 shadow-sm" />
        </div>
        <div>
          <label className="block text-sm text-gray-600">פעולות מתקנות</label>
          <textarea value={form.corrective_actions} onChange={(e) => set('corrective_actions', e.target.value)} rows={2} className="mt-1 block w-full rounded border-gray-300 shadow-sm" />
        </div>
      </fieldset>

      <PhotoUpload label="תמונות מהפיילוט" onUpload={setPhotos} />

      <div>
        <label className="block text-sm font-medium text-gray-700">הערות</label>
        <textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} rows={3} className="mt-1 block w-full rounded border-gray-300 shadow-sm" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <SignaturePad label="חתימת קבלן" onSave={setContractorSig} />
        <SignaturePad label="חתימת פיברטק" onSave={setFibertechSig} />
      </div>

      <button type="submit" className="w-full py-3 bg-blue-600 text-white rounded-lg text-lg font-semibold hover:bg-blue-700">
        שלח דו״ח B-165
      </button>
    </form>
  );
}
