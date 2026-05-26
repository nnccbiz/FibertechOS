'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

interface DrawingRow {
  id: string;
  project_id: string;
  file_name: string;
  file_url: string;
  drawing_number: string | null;
  project_name: string;
  project_number: number | null;
  created_at: string;
}

export default function DrawingsPage() {
  const router = useRouter();
  const supabase = createClient();
  const [rows, setRows] = useState<DrawingRow[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [{ data: atts }, { data: projs }, { data: dets }] = await Promise.all([
        supabase.from('attachments').select('id, project_id, file_name, file_url, drawing_number, created_at').eq('entity_type', 'project').order('created_at', { ascending: false }),
        supabase.from('projects').select('id, name'),
        supabase.from('project_details').select('project_id, project_number'),
      ]);
      const nameById: Record<string, string> = {};
      (projs || []).forEach((p: any) => { nameById[p.id] = p.name; });
      const numById: Record<string, number> = {};
      (dets || []).forEach((d: any) => { if (d.project_number != null) numById[d.project_id] = d.project_number; });
      setRows((atts || []).map((a: any) => ({
        ...a,
        project_name: nameById[a.project_id] || '—',
        project_number: numById[a.project_id] ?? null,
      })));
      setLoading(false);
    }
    load();
  }, []);

  async function openDrawing(path: string) {
    if (/^https?:/.test(path)) { window.open(path, '_blank'); return; }
    const { data } = await supabase.storage.from('project-files').createSignedUrl(path, 3600);
    if (data?.signedUrl) window.open(data.signedUrl, '_blank');
  }

  const q = search.trim().toLowerCase();
  const filtered = rows.filter((r) => {
    if (!q) return true;
    const ref = `${r.project_number ?? ''}/${r.drawing_number ?? ''}`;
    return [r.drawing_number, r.project_name, String(r.project_number ?? ''), ref, r.file_name]
      .some((f) => (f || '').toLowerCase().includes(q));
  });

  return (
    <div className="max-w-5xl mx-auto px-4 py-6" dir="rtl">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-2xl font-bold text-gray-900">📐 שרטוטים</h1>
        <span className="text-sm text-gray-400">{filtered.length} שרטוטים</span>
      </div>

      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="חיפוש לפי מספר שרטוט, שם פרויקט או מספר פרויקט…"
        className="w-full border border-[#e2e8f0] rounded-lg px-4 py-2.5 text-sm mb-5 focus:outline-none focus:ring-2 focus:ring-[#1a56db]/20"
      />

      {loading ? (
        <p className="text-center text-gray-400 py-10">טוען…</p>
      ) : filtered.length === 0 ? (
        <p className="text-center text-gray-400 py-10">לא נמצאו שרטוטים.</p>
      ) : (
        <div className="bg-white border border-[#e2e8f0] rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-[#e2e8f0] text-[12px] text-gray-500">
                <th className="text-right font-semibold px-4 py-2.5">מס׳ שרטוט</th>
                <th className="text-right font-semibold px-4 py-2.5">קובץ</th>
                <th className="text-right font-semibold px-4 py-2.5">פרויקט</th>
                <th className="text-right font-semibold px-4 py-2.5">תאריך</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="border-b border-gray-50 hover:bg-blue-50/40 transition-colors">
                  <td className="px-4 py-3">
                    <span className="text-[12px] font-bold text-[#003d77] bg-blue-50 px-2 py-1 rounded whitespace-nowrap" dir="ltr">
                      {(r.project_number ?? '—')}/{r.drawing_number || '?'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => openDrawing(r.file_url)} className="text-[#1a56db] hover:underline">
                      {r.file_name.endsWith('.pdf') ? '📄' : '🖼️'} {r.file_name}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => router.push(`/projects/${r.project_id}`)} className="text-gray-700 hover:text-[#1a56db]">{r.project_name}</button>
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-[12px]">{new Date(r.created_at).toLocaleDateString('he-IL')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
