'use client';

import { useState } from 'react';
import SignaturePad from '../ui/SignaturePad';
import PhotoUpload from '../ui/PhotoUpload';

/** B-116 — דוח פיקוח שדה שוטף לצנרת דחיקה */
export default function FormB116() {
  const [form, setForm] = useState({
    report_number: '',
    inspection_date: new Date().toISOString().slice(0, 10),
    project_id: '',
    // Pipe specs
    pit_dimensions_m: '',
    segment_length_m: '',
    outer_diameter_mm: '',
    inner_diameter_mm: '',
    max_jacking_force_kn: '',
    max_jacking_force_ton: '',
    connector_type: 'GRP',
    max_machine_force_kn: '',
    max_pressure_bar: '',
    pressure_to_force: '',
    sleeve_width: '',
    calibration_width: '',
    plate_outer_dia: '',
    plate_inner_dia: '',
    plate_surface_ok: false,
    push_base_width: '',
    // Jacking data
    current_pipe_number: '',
    total_jacked_length_m: '',
    stage1_pressure_bar: '', stage1_force_kn: '', stage1_speed_mm_min: '',
    stage2_pressure_bar: '', stage2_force_kn: '', stage2_speed_mm_min: '',
    stage3_pressure_bar: '', stage3_force_kn: '', stage3_speed_mm_min: '',
    bentonite_flow_m3h: '',
    inlet_flow_m3h: '',
    outlet_flow_m3h: '',
    // Intermediate stations
    station1_length_m: '', station1_pressure_bar: '', station1_force_kn: '', station1_speed_mm_min: '',
    station2_length_m: '', station2_pressure_bar: '', station2_force_kn: '', station2_speed_mm_min: '',
    // Notes
    jacking_speed_ok: false,
    defects_during_push: '',
    special_requirements: '',
    general_notes: '',
    contractor_notes: '',
    site_manager_name: '',
  });

  const [screenPhoto, setScreenPhoto] = useState<File[]>([]);
  const [gaugePhoto, setGaugePhoto] = useState<File[]>([]);
  const [inspectorSig, setInspectorSig] = useState('');

  function set<K extends keyof typeof form>(key: K, val: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: val }));
  }

  function numInput(key: keyof typeof form, label: string, unit?: string) {
    return (
      <div>
        <label className="block text-lg text-gray-600">{label} {unit && <span className="text-gray-400">({unit})</span>}</label>
        <input type="number" step="any" value={form[key] as string} onChange={(e) => set(key, e.target.value as any)} className="mt-1 block w-full rounded border-gray-300 shadow-sm" />
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    console.log({ form, screenPhoto, gaugePhoto, inspectorSig });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl mx-auto p-4" dir="rtl">
      <h2 className="text-2xl font-bold">B-116 — דוח פיקוח שדה שוטף</h2>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-lg font-medium text-gray-700">מספר דו״ח</label>
          <input type="text" value={form.report_number} onChange={(e) => set('report_number', e.target.value)} required className="mt-1 block w-full rounded border-gray-300 shadow-sm" />
        </div>
        <div>
          <label className="block text-lg font-medium text-gray-700">תאריך פיקוח</label>
          <input type="date" value={form.inspection_date} onChange={(e) => set('inspection_date', e.target.value)} required className="mt-1 block w-full rounded border-gray-300 shadow-sm" />
        </div>
      </div>

      {/* Pipe Specs — ממצאי הפיקוח */}
      <fieldset className="border rounded-lg p-4 space-y-3">
        <legend className="text-lg font-semibold px-2">ממצאי הפיקוח — מפרט צנרת</legend>
        <div className="grid grid-cols-2 gap-3">
          {numInput('pit_dimensions_m', 'מידות פיר דחיקה', 'מ׳')}
          {numInput('segment_length_m', 'אורך סגמנט צינור', 'מ׳')}
          {numInput('outer_diameter_mm', 'קוטר חיצוני', 'מ״מ')}
          {numInput('inner_diameter_mm', 'קוטר פנימי', 'מ״מ')}
          {numInput('max_jacking_force_kn', 'כוח דחיקה מותר', 'KN')}
          {numInput('max_jacking_force_ton', 'כוח דחיקה מותר', 'טון')}
          <div>
            <label className="block text-lg text-gray-600">סוג מחבר (שרוול)</label>
            <select value={form.connector_type} onChange={(e) => set('connector_type', e.target.value)} className="mt-1 block w-full rounded border-gray-300 shadow-sm">
              <option value="GRP">GRP</option>
              <option value="נירוסטה">נירוסטה</option>
            </select>
          </div>
          {numInput('max_machine_force_kn', 'כוח מקסימלי מכונה', 'KN')}
          {numInput('max_pressure_bar', 'לחץ מקסימלי', 'Bar')}
          {numInput('pressure_to_force', 'יחס לחץ/כוח', 'KN = _ × Bar')}
          {numInput('sleeve_width', 'רוחב שרוול', 'מ״מ')}
          {numInput('calibration_width', 'רוחב קליברציה', 'מ״מ')}
          {numInput('plate_outer_dia', 'קוטר חוץ פלטת דחיקה', 'מ״מ')}
          {numInput('plate_inner_dia', 'קוטר פנים פלטת דחיקה', 'מ״מ')}
          <label className="flex items-center gap-2 col-span-2">
            <input type="checkbox" checked={form.plate_surface_ok} onChange={(e) => set('plate_surface_ok', e.target.checked)} className="h-5 w-5 rounded" />
            <span className="text-lg">פני שטח ישרים וחלקים</span>
          </label>
          {numInput('push_base_width', 'רוחב כן דחיקה', 'מ״מ')}
        </div>
      </fieldset>

      {/* 3-Stage Jacking Data */}
      <fieldset className="border rounded-lg p-4 space-y-3">
        <legend className="text-lg font-semibold px-2">נתוני דחיקה — 3 שלבים</legend>
        <div className="grid grid-cols-2 gap-3">
          {numInput('current_pipe_number', 'מס׳ צינור נוכחי', '')}
          {numInput('total_jacked_length_m', 'אורך קו שנדחק', 'מ׳')}
        </div>
        {[1, 2, 3].map((stage) => (
          <div key={stage} className="bg-gray-50 rounded p-3">
            <h4 className="text-lg font-medium mb-2">שלב {stage}</h4>
            <div className="grid grid-cols-3 gap-2">
              {numInput(`stage${stage}_pressure_bar` as any, 'לחץ', 'Bar')}
              {numInput(`stage${stage}_force_kn` as any, 'כוח', 'KN')}
              {numInput(`stage${stage}_speed_mm_min` as any, 'מהירות', 'מ״מ/דקה')}
            </div>
          </div>
        ))}
        <div className="grid grid-cols-3 gap-3">
          {numInput('bentonite_flow_m3h', 'סחרור בנטונייד', 'מ״ק/שעה')}
          {numInput('inlet_flow_m3h', 'ספיקה בכניסה', 'מ״ק/שעה')}
          {numInput('outlet_flow_m3h', 'ספיקה ביציאה', 'מ״ק/שעה')}
        </div>
      </fieldset>

      {/* Photos */}
      <PhotoUpload label="צילום מסך תצוגה" onUpload={setScreenPhoto} maxFiles={2} />
      <PhotoUpload label="צילום שעוני לחץ" onUpload={setGaugePhoto} maxFiles={2} />

      {/* Notes */}
      <div>
        <label className="block text-lg font-medium text-gray-700">תקלות בעת הדחיקה</label>
        <textarea value={form.defects_during_push} onChange={(e) => set('defects_during_push', e.target.value)} rows={2} className="mt-1 block w-full rounded border-gray-300 shadow-sm" />
      </div>
      <div>
        <label className="block text-lg font-medium text-gray-700">הערות לקבלן</label>
        <textarea value={form.contractor_notes} onChange={(e) => set('contractor_notes', e.target.value)} rows={2} className="mt-1 block w-full rounded border-gray-300 shadow-sm" />
      </div>
      <div>
        <label className="block text-lg font-medium text-gray-700">הערות כלליות</label>
        <textarea value={form.general_notes} onChange={(e) => set('general_notes', e.target.value)} rows={2} className="mt-1 block w-full rounded border-gray-300 shadow-sm" />
      </div>

      <div>
        <label className="block text-lg font-medium text-gray-700">שם מנהל עבודה</label>
        <input type="text" value={form.site_manager_name} onChange={(e) => set('site_manager_name', e.target.value)} className="mt-1 block w-full rounded border-gray-300 shadow-sm" />
      </div>

      <SignaturePad label="חתימת מפקח" onSave={setInspectorSig} />

      <button type="submit" className="w-full py-3 bg-blue-600 text-white rounded-lg text-2xl font-semibold hover:bg-blue-700">
        שלח דו״ח B-116
      </button>
    </form>
  );
}
