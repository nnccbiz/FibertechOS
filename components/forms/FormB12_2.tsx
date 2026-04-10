'use client';

import { useState } from 'react';
import SignaturePad from '../ui/SignaturePad';
import PhotoUpload from '../ui/PhotoUpload';

/** B-12-2 — ארוע חריג / תקלות בשטח */
export default function FormB12_2() {
  const [form, setForm] = useState({
    report_number: '',
    report_date: new Date().toISOString().slice(0, 10),
    project_id: '',
    incident_type: 'defect' as string,
    // Reporter
    reporter_name: '',
    reporter_phone: '',
    related_field_report: '',
    // Defect details
    defect_description: '',
    defect_location_text: '',
    // Investigation & repair
    cause_assessment: '',
    repair_responsible: '',
    repair_executor: '',
    repair_actions: '',
    factory_actions: '',
    field_service_report: '',
    // History & warranty
    previous_incidents: '',
    warranty_period: '',
    repair_warranty: '',
    preventive_actions: '',
    // Timeline
    target_repair_date: '',
    actual_repair_date: '',
    approved_by: '',
    // Distribution
    sent_to_complainant: false,
    sent_to_planner: false,
    sent_to_developer: false,
    sent_to_inspector: false,
    sent_to_contractor: false,
    sent_to_marketing: false,
  });

  const [photos, setPhotos] = useState<File[]>([]);
  const [approverSig, setApproverSig] = useState('');

  function set<K extends keyof typeof form>(key: K, val: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: val }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    console.log({ form, photos, approverSig });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl mx-auto p-4" dir="rtl">
      <h2 className="text-2xl font-bold text-red-700">B-12-2 — דו״ח אירוע חריג / תקלות בשטח</h2>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-lg font-medium text-gray-700">מספר דו״ח</label>
          <input type="text" value={form.report_number} onChange={(e) => set('report_number', e.target.value)} required className="mt-1 block w-full rounded border-gray-300 shadow-sm" />
        </div>
        <div>
          <label className="block text-lg font-medium text-gray-700">תאריך דיווח</label>
          <input type="date" value={form.report_date} onChange={(e) => set('report_date', e.target.value)} required className="mt-1 block w-full rounded border-gray-300 shadow-sm" />
        </div>
      </div>

      <div>
        <label className="block text-lg font-medium text-gray-700">סוג אירוע</label>
        <select value={form.incident_type} onChange={(e) => set('incident_type', e.target.value)} className="mt-1 block w-full rounded border-gray-300 shadow-sm">
          <option value="partial_report">דיווח חלקי</option>
          <option value="investigation">ברור</option>
          <option value="defect">תקלה</option>
          <option value="repair_report">דו״ח תיקון</option>
          <option value="interim_report">דו״ח ביניים</option>
          <option value="summary_report">דו״ח מסכם</option>
        </select>
      </div>

      {/* Reporter */}
      <fieldset className="border rounded-lg p-4 space-y-3">
        <legend className="text-lg font-semibold px-2">פרטי המדווח</legend>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-lg text-gray-600">שם איש קשר</label>
            <input type="text" value={form.reporter_name} onChange={(e) => set('reporter_name', e.target.value)} className="mt-1 block w-full rounded border-gray-300 shadow-sm" />
          </div>
          <div>
            <label className="block text-lg text-gray-600">טלפון</label>
            <input type="tel" value={form.reporter_phone} onChange={(e) => set('reporter_phone', e.target.value)} className="mt-1 block w-full rounded border-gray-300 shadow-sm" />
          </div>
        </div>
        <div>
          <label className="block text-lg text-gray-600">מס׳ דוח שירות שדה קשור</label>
          <input type="text" value={form.related_field_report} onChange={(e) => set('related_field_report', e.target.value)} className="mt-1 block w-full rounded border-gray-300 shadow-sm" />
        </div>
      </fieldset>

      {/* Defect description */}
      <fieldset className="border border-red-200 rounded-lg p-4 space-y-3 bg-red-50">
        <legend className="text-lg font-semibold px-2 text-red-700">תיאור התקלה</legend>
        <textarea
          value={form.defect_description}
          onChange={(e) => set('defect_description', e.target.value)}
          rows={4}
          required
          placeholder="תאר את התקלה בפירוט..."
          className="block w-full rounded border-gray-300 shadow-sm"
        />
        <div>
          <label className="block text-lg text-gray-600">מיקום התקלה</label>
          <input type="text" value={form.defect_location_text} onChange={(e) => set('defect_location_text', e.target.value)} placeholder="תיאור מיקום / כתובת" className="mt-1 block w-full rounded border-gray-300 shadow-sm" />
        </div>
        <PhotoUpload label="תמונות התקלה" maxFiles={5} onUpload={setPhotos} />
      </fieldset>

      {/* Investigation & Repair */}
      <fieldset className="border rounded-lg p-4 space-y-3">
        <legend className="text-lg font-semibold px-2">חקירה ותיקון</legend>
        <div>
          <label className="block text-lg text-gray-600">חקירת סיבת התקלה</label>
          <textarea value={form.cause_assessment} onChange={(e) => set('cause_assessment', e.target.value)} rows={2} className="mt-1 block w-full rounded border-gray-300 shadow-sm" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-lg text-gray-600">אחריות לביצוע התיקון</label>
            <input type="text" value={form.repair_responsible} onChange={(e) => set('repair_responsible', e.target.value)} className="mt-1 block w-full rounded border-gray-300 shadow-sm" />
          </div>
          <div>
            <label className="block text-lg text-gray-600">הגורם המבצע בפועל</label>
            <input type="text" value={form.repair_executor} onChange={(e) => set('repair_executor', e.target.value)} className="mt-1 block w-full rounded border-gray-300 shadow-sm" />
          </div>
        </div>
        <div>
          <label className="block text-lg text-gray-600">פעולות שבוצעו / יבוצעו בשטח</label>
          <textarea value={form.repair_actions} onChange={(e) => set('repair_actions', e.target.value)} rows={3} className="mt-1 block w-full rounded border-gray-300 shadow-sm" />
        </div>
        <div>
          <label className="block text-lg text-gray-600">פעולות במפעל</label>
          <textarea value={form.factory_actions} onChange={(e) => set('factory_actions', e.target.value)} rows={2} className="mt-1 block w-full rounded border-gray-300 shadow-sm" />
        </div>
      </fieldset>

      {/* History & Warranty */}
      <fieldset className="border rounded-lg p-4 space-y-3">
        <legend className="text-lg font-semibold px-2">היסטוריה ואחריות</legend>
        <div>
          <label className="block text-lg text-gray-600">היסטוריית תקלות במקום</label>
          <textarea value={form.previous_incidents} onChange={(e) => set('previous_incidents', e.target.value)} rows={2} className="mt-1 block w-full rounded border-gray-300 shadow-sm" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-lg text-gray-600">תקופת אחריות לקו</label>
            <input type="text" value={form.warranty_period} onChange={(e) => set('warranty_period', e.target.value)} className="mt-1 block w-full rounded border-gray-300 shadow-sm" />
          </div>
          <div>
            <label className="block text-lg text-gray-600">אחריות למבצע התיקון</label>
            <input type="text" value={form.repair_warranty} onChange={(e) => set('repair_warranty', e.target.value)} className="mt-1 block w-full rounded border-gray-300 shadow-sm" />
          </div>
        </div>
        <div>
          <label className="block text-lg text-gray-600">המלצות למניעת תקלות בעתיד</label>
          <textarea value={form.preventive_actions} onChange={(e) => set('preventive_actions', e.target.value)} rows={2} className="mt-1 block w-full rounded border-gray-300 shadow-sm" />
        </div>
      </fieldset>

      {/* Timeline */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-lg font-medium text-gray-700">תאריך יעד לתיקון</label>
          <input type="date" value={form.target_repair_date} onChange={(e) => set('target_repair_date', e.target.value)} className="mt-1 block w-full rounded border-gray-300 shadow-sm" />
        </div>
        <div>
          <label className="block text-lg font-medium text-gray-700">תאריך סיום תיקון</label>
          <input type="date" value={form.actual_repair_date} onChange={(e) => set('actual_repair_date', e.target.value)} className="mt-1 block w-full rounded border-gray-300 shadow-sm" />
        </div>
      </div>

      {/* Distribution */}
      <fieldset className="border rounded-lg p-4 space-y-2">
        <legend className="text-lg font-semibold px-2">תפוצה</legend>
        {[
          { key: 'sent_to_complainant' as const, label: 'למתלונן' },
          { key: 'sent_to_planner' as const, label: 'למתכנן' },
          { key: 'sent_to_developer' as const, label: 'ליזם' },
          { key: 'sent_to_inspector' as const, label: 'למפקח' },
          { key: 'sent_to_contractor' as const, label: 'לקבלן' },
          { key: 'sent_to_marketing' as const, label: 'למנהל השיווק' },
        ].map(({ key, label }) => (
          <label key={key} className="flex items-center gap-3 text-lg">
            <input type="checkbox" checked={form[key]} onChange={(e) => set(key, e.target.checked)} className="h-4 w-4 rounded" />
            {label}
          </label>
        ))}
      </fieldset>

      <div>
        <label className="block text-lg font-medium text-gray-700">אושר פנימית ע״י</label>
        <input type="text" value={form.approved_by} onChange={(e) => set('approved_by', e.target.value)} className="mt-1 block w-full rounded border-gray-300 shadow-sm" />
      </div>

      <SignaturePad label="חתימת מאשר" onSave={setApproverSig} />

      <button type="submit" className="w-full py-3 bg-red-600 text-white rounded-lg text-2xl font-semibold hover:bg-red-700">
        שלח דו״ח B-12-2
      </button>
    </form>
  );
}
