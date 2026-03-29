'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import StatusTracker from '@/components/projects/StatusTracker';

function formatDate(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('he-IL');
}

function formatCurrency(v: number) {
  return new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(v);
}

export default function ProjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [project, setProject] = useState<any>(null);
  const [details, setDetails] = useState<any>(null);
  const [contacts, setContacts] = useState<any[]>([]);
  const [pipeSpecs, setPipeSpecs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const id = params.id as string;

        const [projRes, detRes, conRes, specRes] = await Promise.all([
          supabase.from('projects').select('*').eq('id', id).single(),
          supabase.from('project_details').select('*').eq('project_id', id).single(),
          supabase.from('project_contacts').select('*').eq('project_id', id),
          supabase.from('pipe_specs').select('*').eq('project_id', id),
        ]);

        if (projRes.data) setProject(projRes.data);
        if (detRes.data) setDetails(detRes.data);
        if (conRes.data) setContacts(conRes.data);
        if (specRes.data) setPipeSpecs(specRes.data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [params.id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f0f4f8] flex items-center justify-center" dir="rtl">
        <div className="text-center">
          <div className="skeleton h-8 w-48 mx-auto mb-3" />
          <div className="skeleton h-4 w-32 mx-auto" />
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="min-h-screen bg-[#f0f4f8] flex items-center justify-center" dir="rtl">
        <div className="text-center">
          <p className="text-gray-500">פרויקט לא נמצא</p>
          <button onClick={() => router.push('/')} className="text-sm text-[#1a56db] hover:underline mt-2">
            חזרה לדשבורד
          </button>
        </div>
      </div>
    );
  }

  const d = details || {};

  const infoRows = [
    { label: 'שם הפרויקט', value: project.name },
    { label: 'מיקום', value: d.location },
    { label: 'מספר פרויקט פיברטק', value: d.project_number },
    { label: 'מזמין הפרויקט', value: d.ordering_entity },
    { label: 'הגורם שהפרויקט באחריותו', value: d.responsible_party },
    { label: 'ערך הזמנה', value: project.order_value ? formatCurrency(project.order_value) : null },
  ];

  const dateRows = [
    { label: 'תאריך קבלת ההזמנה', value: formatDate(d.order_received_date) },
    { label: 'תאריך ההזמנה המאושרת', value: formatDate(d.approved_order_date) },
    { label: 'תאריך התחלת הנחת צנרת', value: formatDate(d.pipe_installation_start) },
    { label: 'מועד הגשת המכרז', value: formatDate(d.tender_submission_date) },
    { label: 'קבלן זוכה', value: d.winning_contractor },
    { label: 'תאריך הכרזה', value: formatDate(d.winning_date) },
  ];

  const projectRows = [
    { label: 'תיאור הפרויקט', value: d.description },
    { label: 'סוג פרויקט', value: d.project_type },
    { label: 'סוג התקנה', value: d.installation_type },
    { label: 'דרישות מיוחדות לצנרת', value: d.special_requirements },
    { label: 'פיקוח שרות שדה', value: d.field_supervision },
  ];

  const pushRows = d.installation_type === 'דחיקה' ? [
    { label: 'סוג הקרקע באתר הדחיקה', value: d.soil_type },
    { label: 'עומק הדחיקה', value: d.push_depth },
    { label: 'סוג השוחות', value: d.manhole_type },
    { label: 'אופן התחברות לשוחות', value: d.connection_method },
  ] : [];

  return (
    <div className="min-h-screen bg-[#f0f4f8]" dir="rtl">
      <header className="bg-white border-b border-[#e2e8f0] px-5 py-4 sticky top-0 z-30">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-gray-800">{project.name}</h1>
            <p className="text-[11px] text-gray-400">כרטיס פרויקט #{d.project_number || '—'}</p>
          </div>
          <button onClick={() => router.push('/')} className="text-xs text-gray-500 hover:text-gray-700 px-3 py-2">
            ← חזרה לדשבורד
          </button>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 md:px-6 py-6 space-y-5">
        {/* Status */}
        <section className="bg-white rounded-xl border border-[#e2e8f0] p-5">
          <h2 className="text-sm font-bold text-gray-700 mb-3">📌 סטטוס</h2>
          <StatusTracker currentStatus={d.project_status || 'תכנון כללי'} onChange={() => {}} />

          {/* Expected pipe order highlight */}
          {d.expected_pipe_order_date && (
            <div className="mt-4 bg-green-50 border border-green-200 rounded-lg p-3 flex items-center gap-2">
              <span className="text-lg">📦</span>
              <div>
                <p className="text-xs font-bold text-green-700">צפי מועד להזמנת צנרת</p>
                <p className="text-sm font-bold text-green-800">{formatDate(d.expected_pipe_order_date)}</p>
              </div>
            </div>
          )}
        </section>

        {/* Basic info */}
        <section className="bg-white rounded-xl border border-[#e2e8f0] p-5">
          <h2 className="text-sm font-bold text-gray-700 mb-4">🏗️ מידע בסיסי</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2">
            {infoRows.map((row) => (
              <div key={row.label} className="flex items-baseline gap-2 py-1.5 border-b border-gray-50">
                <span className="text-[11px] text-gray-500 w-40 flex-shrink-0">{row.label}</span>
                <span className="text-xs font-medium text-gray-800">{row.value || '—'}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Dates */}
        <section className="bg-white rounded-xl border border-[#e2e8f0] p-5">
          <h2 className="text-sm font-bold text-gray-700 mb-4">📅 תאריכים</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2">
            {dateRows.map((row) => (
              <div key={row.label} className="flex items-baseline gap-2 py-1.5 border-b border-gray-50">
                <span className="text-[11px] text-gray-500 w-40 flex-shrink-0">{row.label}</span>
                <span className="text-xs font-medium text-gray-800">{row.value || '—'}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Contacts */}
        {contacts.length > 0 && (
          <section className="bg-white rounded-xl border border-[#e2e8f0] p-5">
            <h2 className="text-sm font-bold text-gray-700 mb-4">👥 אנשי קשר</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[#e2e8f0]">
                    <th className="text-right text-gray-500 font-medium pb-2 pr-2">תפקיד</th>
                    <th className="text-right text-gray-500 font-medium pb-2">שם</th>
                    <th className="text-right text-gray-500 font-medium pb-2">טלפון</th>
                    <th className="text-right text-gray-500 font-medium pb-2">מייל</th>
                  </tr>
                </thead>
                <tbody>
                  {contacts.map((c) => (
                    <tr key={c.id} className="border-b border-gray-50">
                      <td className="py-2 pr-2 text-gray-600">{c.role}</td>
                      <td className="py-2 font-medium text-gray-800">{c.name}</td>
                      <td className="py-2 text-gray-600" dir="ltr">{c.phone || '—'}</td>
                      <td className="py-2 text-gray-600" dir="ltr">{c.email || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Project type & installation */}
        <section className="bg-white rounded-xl border border-[#e2e8f0] p-5">
          <h2 className="text-sm font-bold text-gray-700 mb-4">⚙️ סוג פרויקט והתקנה</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2">
            {projectRows.map((row) => (
              <div key={row.label} className="flex items-baseline gap-2 py-1.5 border-b border-gray-50">
                <span className="text-[11px] text-gray-500 w-40 flex-shrink-0">{row.label}</span>
                <span className="text-xs font-medium text-gray-800">{row.value || '—'}</span>
              </div>
            ))}
          </div>
          {pushRows.length > 0 && (
            <div className="border-t border-[#e2e8f0] mt-3 pt-3">
              <h3 className="text-xs font-bold text-gray-500 mb-2">פרטי דחיקה</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2">
                {pushRows.map((row) => (
                  <div key={row.label} className="flex items-baseline gap-2 py-1.5 border-b border-gray-50">
                    <span className="text-[11px] text-gray-500 w-40 flex-shrink-0">{row.label}</span>
                    <span className="text-xs font-medium text-gray-800">{row.value || '—'}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* Pipe specs */}
        {pipeSpecs.length > 0 && (
          <section className="bg-white rounded-xl border border-[#e2e8f0] p-5">
            <h2 className="text-sm font-bold text-gray-700 mb-4">🔧 מאפייני הצינור והשוחות</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[#e2e8f0]">
                    <th className="text-right text-gray-500 font-medium pb-2 pr-2">קוטר (מ"מ)</th>
                    <th className="text-right text-gray-500 font-medium pb-2">אורך קו (מ׳)</th>
                    <th className="text-right text-gray-500 font-medium pb-2">אורך יחידה (מ׳)</th>
                    <th className="text-right text-gray-500 font-medium pb-2">קשיחות (פסקל)</th>
                    <th className="text-right text-gray-500 font-medium pb-2">לחץ (בר)</th>
                    <th className="text-right text-gray-500 font-medium pb-2">הערות</th>
                  </tr>
                </thead>
                <tbody>
                  {pipeSpecs.map((spec) => (
                    <tr key={spec.id} className="border-b border-gray-50">
                      <td className="py-2 pr-2 font-semibold text-gray-800">{spec.diameter_mm}</td>
                      <td className="py-2 text-gray-600">{spec.line_length_m ?? '—'}</td>
                      <td className="py-2 text-gray-600">{spec.unit_length_m ?? '—'}</td>
                      <td className="py-2 text-gray-600">{spec.stiffness_pascal ?? '—'}</td>
                      <td className="py-2 text-gray-600">{spec.pressure_bar ?? '—'}</td>
                      <td className="py-2 text-gray-600">{spec.notes || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Story & intelligence */}
        {(d.project_story || d.competitors || d.assessments || d.politics) && (
          <section className="bg-white rounded-xl border border-[#e2e8f0] p-5">
            <h2 className="text-sm font-bold text-gray-700 mb-4">📖 סיפור הפרויקט ואינטליגנציה</h2>
            <div className="space-y-4">
              {d.project_story && (
                <div>
                  <h3 className="text-xs font-bold text-gray-500 mb-1">סיפור הפרויקט</h3>
                  <p className="text-xs text-gray-700 whitespace-pre-wrap">{d.project_story}</p>
                </div>
              )}
              {d.competitors && (
                <div>
                  <h3 className="text-xs font-bold text-gray-500 mb-1">מתחרים</h3>
                  <p className="text-xs text-gray-700 whitespace-pre-wrap">{d.competitors}</p>
                </div>
              )}
              {d.assessments && (
                <div>
                  <h3 className="text-xs font-bold text-gray-500 mb-1">הערכות</h3>
                  <p className="text-xs text-gray-700 whitespace-pre-wrap">{d.assessments}</p>
                </div>
              )}
              {d.politics && (
                <div>
                  <h3 className="text-xs font-bold text-gray-500 mb-1">פוליטיקה</h3>
                  <p className="text-xs text-gray-700 whitespace-pre-wrap">{d.politics}</p>
                </div>
              )}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
