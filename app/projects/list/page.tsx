'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { formatILS, MONTH_NAMES } from '@/lib/revenue';

interface ProjectDetail {
  project_id: string;
  delivery_months_list: string | null;
}

interface Project {
  id: string;
  serial_number: number | null;
  name: string;
  developer_name: string | null;
  planning_office: string | null;
  description: string | null;
  probability_percent: number;
  realization_status: string;
  order_value: number;
  delivery_months: number | null;
  order_execution_date: string | null;
  status: string;
  last_updated_at: string;
}

const STATUS_COLORS: Record<string, string> = {
  'הזמנה': 'bg-green-100 text-green-700',
  'גבוהה': 'bg-blue-100 text-blue-700',
  'בינוני': 'bg-yellow-100 text-yellow-700',
  'נמוך': 'bg-red-100 text-red-700',
};

const STATUS_OPTIONS = ['הזמנה', 'גבוהה', 'בינוני', 'נמוך'];

export default function ProjectsListPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectDetails, setProjectDetails] = useState<ProjectDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [monthPickerOpen, setMonthPickerOpen] = useState<string | null>(null);

  async function fetchData() {
    try {
      setLoading(true);
      const [projRes, detRes] = await Promise.all([
        supabase.from('projects').select('*').order('serial_number', { ascending: true }),
        supabase.from('project_details').select('project_id, delivery_months_list'),
      ]);

      if (projRes.data) setProjects(projRes.data);
      if (detRes.data) setProjectDetails(detRes.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (!monthPickerOpen) return;
    function handleClick() { setMonthPickerOpen(null); }
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [monthPickerOpen]);

  const filtered = projects.filter((p) => {
    if (filter !== 'all' && p.realization_status !== filter) return false;
    if (search && !p.name?.includes(search) && !p.developer_name?.includes(search)) return false;
    return true;
  });

  const totalValue = filtered.reduce((sum, p) => sum + (p.order_value || 0), 0);

  const currentYear = new Date().getFullYear();

  function getAllDeliveryEntries(projectId: string): string[] {
    const det = projectDetails.find((d) => d.project_id === projectId);
    if (!det?.delivery_months_list) return [];
    return det.delivery_months_list.split(',').filter(Boolean);
  }

  function getDeliveryMonthsForYear(projectId: string, year: number): number[] {
    return getAllDeliveryEntries(projectId)
      .filter((e) => e.startsWith(`${year}-`))
      .map((e) => parseInt(e.split('-')[1]));
  }

  function hasEntry(projectId: string, year: number, month: number): boolean {
    return getAllDeliveryEntries(projectId).includes(`${year}-${month}`);
  }

  async function toggleMonth(projectId: string, year: number, month: number) {
    const entries = getAllDeliveryEntries(projectId);
    const key = `${year}-${month}`;
    const next = entries.includes(key)
      ? entries.filter((e) => e !== key)
      : [...entries, key].sort();
    const value = next.join(',') || null;

    setProjectDetails((prev) => {
      const exists = prev.find((d) => d.project_id === projectId);
      if (exists) {
        return prev.map((d) => d.project_id === projectId ? { ...d, delivery_months_list: value } : d);
      }
      return [...prev, { project_id: projectId, delivery_months_list: value }];
    });

    const { data: existing } = await supabase.from('project_details').select('id').eq('project_id', projectId).maybeSingle();
    if (existing) {
      await supabase.from('project_details').update({ delivery_months_list: value }).eq('project_id', projectId);
    } else {
      await supabase.from('project_details').insert({ project_id: projectId, delivery_months_list: value });
    }
  }

  return (
    <div className="min-h-screen bg-[#f0f4f8]" dir="rtl">
      <div className="flex-1">
        {/* Header */}
        <header className="bg-white border-b border-[#e2e8f0] px-5 py-4 sticky top-0 z-30">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-800">📋 פרויקטים</h1>
              <p className="text-[13px] text-gray-400">{filtered.length} פרויקטים | סה"כ {formatILS(totalValue)}</p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => router.push('/')}
                className="text-sm text-gray-500 hover:text-gray-700 px-3 py-2"
              >
                ← דשבורד
              </button>
              <button
                onClick={() => router.push('/projects/new')}
                className="text-sm bg-[#1a56db] text-white px-4 py-2.5 rounded-lg hover:bg-blue-700 transition-colors font-medium"
              >
                + פרויקט חדש
              </button>
            </div>
          </div>
        </header>

        <div className="px-4 md:px-6 py-5">
          {/* Filters row */}
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="חיפוש פרויקט או יזם..."
              className="border border-[#e2e8f0] rounded-lg px-3 py-2 text-sm w-48 focus:outline-none focus:ring-2 focus:ring-[#1a56db]/20 focus:border-[#1a56db]"
            />
            <div className="flex gap-1">
              <button
                onClick={() => setFilter('all')}
                className={`text-[13px] px-3 py-1.5 rounded-lg transition-colors ${
                  filter === 'all' ? 'bg-[#1a56db] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                הכל
              </button>
              {STATUS_OPTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => setFilter(s)}
                  className={`text-[13px] px-3 py-1.5 rounded-lg transition-colors ${
                    filter === s ? 'bg-[#1a56db] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Table */}
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="skeleton h-10 w-full" />
              ))}
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-[#e2e8f0] overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-[#e2e8f0]">
                      <th className="text-right text-[12px] text-gray-500 font-medium py-2.5 px-2 whitespace-nowrap sticky right-0 bg-gray-50 z-10">#</th>
                      <th className="text-right text-[12px] text-gray-500 font-medium py-2.5 px-2 whitespace-nowrap">עדכון</th>
                      <th className="text-right text-[12px] text-gray-500 font-medium py-2.5 px-2 whitespace-nowrap">יזם</th>
                      <th className="text-right text-[12px] text-gray-500 font-medium py-2.5 px-2 whitespace-nowrap">משרד תכנון</th>
                      <th className="text-right text-[12px] text-gray-500 font-medium py-2.5 px-2 whitespace-nowrap min-w-[140px]">שם פרויקט</th>
                      <th className="text-right text-[12px] text-gray-500 font-medium py-2.5 px-2 whitespace-nowrap">תיאור</th>
                      <th className="text-center text-[12px] text-gray-500 font-medium py-2.5 px-2 whitespace-nowrap">הסתברות</th>
                      <th className="text-right text-[12px] text-gray-500 font-medium py-2.5 px-2 whitespace-nowrap">סך הפרויקט</th>
                      <th className="text-center text-[12px] text-gray-500 font-medium py-2.5 px-2 whitespace-nowrap">מועד הזמנה</th>
                      <th className="text-center text-[12px] text-gray-500 font-medium py-2.5 px-2 whitespace-nowrap">סטטוס</th>
                      <th className="text-right text-[12px] text-gray-500 font-medium py-2.5 px-2 whitespace-nowrap">חודשי אספקה</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((project, idx) => {
                      const currentYearMonths = getDeliveryMonthsForYear(project.id, currentYear);

                      return (
                        <tr
                          key={project.id}
                          onClick={() => router.push(`/projects/${project.id}`)}
                          className="border-b border-gray-50 hover:bg-blue-50/30 cursor-pointer transition-colors"
                        >
                          <td className="py-2 px-2 text-gray-400 sticky right-0 bg-white z-10">{project.serial_number || idx + 1}</td>
                          <td className="py-2 px-2 text-[12px] text-gray-400 whitespace-nowrap">
                            {project.last_updated_at
                              ? new Date(project.last_updated_at).toLocaleDateString('he-IL')
                              : '—'}
                          </td>
                          <td className="py-2 px-2 text-gray-700 whitespace-nowrap">{project.developer_name || '—'}</td>
                          <td className="py-2 px-2 text-gray-600 whitespace-nowrap">{project.planning_office || '—'}</td>
                          <td className="py-2 px-2 font-semibold text-gray-800">{project.name}</td>
                          <td className="py-2 px-2 text-gray-500 max-w-[150px] truncate">{project.description || '—'}</td>
                          <td className="py-2 px-2 text-center">
                            <span className="text-[13px] font-bold text-gray-700">
                              {project.probability_percent != null ? `${project.probability_percent}%` : '—'}
                            </span>
                          </td>
                          <td className="py-2 px-2 font-semibold text-gray-800 whitespace-nowrap">
                            {formatILS(project.order_value)}
                          </td>
                          <td className="py-2 px-2 text-center text-gray-600 whitespace-nowrap">
                            {project.order_execution_date
                              ? new Date(project.order_execution_date).toLocaleDateString('he-IL')
                              : '—'}
                          </td>
                          <td className="py-2 px-2 text-center">
                            <span className={`text-[12px] font-bold px-2 py-0.5 rounded-full ${
                              STATUS_COLORS[project.realization_status] || 'bg-gray-100 text-gray-600'
                            }`}>
                              {project.realization_status || '—'}
                            </span>
                          </td>
                          <td className="py-2 px-2 relative" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={() => setMonthPickerOpen(monthPickerOpen === project.id ? null : project.id)}
                              className="w-full text-right"
                            >
                              {currentYearMonths.length > 0 ? (
                                <div className="flex flex-wrap gap-1 flex-row-reverse justify-end">
                                  {currentYearMonths.map((m) => (
                                    <span key={m} className="text-[11px] bg-blue-50 text-[#1a56db] px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap">
                                      {MONTH_NAMES[m]}
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-[12px] text-gray-400 hover:text-[#1a56db]">+ בחר חודשים</span>
                              )}
                            </button>
                            {monthPickerOpen === project.id && (
                              <div className="absolute top-full left-0 z-40 bg-white border border-[#e2e8f0] rounded-xl shadow-lg p-3 mt-1 w-[220px] space-y-3">
                                {[currentYear, currentYear + 1].map((year) => (
                                  <div key={year}>
                                    <p className="text-[12px] font-bold text-gray-500 mb-1.5 text-center">{year}</p>
                                    <div className="grid grid-cols-3 gap-1">
                                      {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                                        <button
                                          key={m}
                                          onClick={() => toggleMonth(project.id, year, m)}
                                          className={`text-[12px] px-2 py-1.5 rounded-lg transition-colors ${
                                            hasEntry(project.id, year, m)
                                              ? 'bg-[#1a56db] text-white'
                                              : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                                          }`}
                                        >
                                          {MONTH_NAMES[m]}
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-gray-50 border-t-2 border-[#e2e8f0]">
                      <td colSpan={10} className="py-2.5 px-2 text-sm font-bold text-gray-700 sticky right-0 bg-gray-50 z-10">
                        סה"כ: {formatILS(totalValue)}
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
