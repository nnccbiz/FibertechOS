'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { formatILS, MONTH_NAMES } from '@/lib/revenue';

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

interface MonthlyData {
  project_id: string;
  year: number;
  month: number;
  amount: number;
  is_actual: boolean;
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
  const [monthlyData, setMonthlyData] = useState<MonthlyData[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

  async function fetchData() {
    try {
      setLoading(true);
      const [projRes, monthlyRes] = await Promise.all([
        supabase.from('projects').select('*').order('serial_number', { ascending: true }),
        supabase.from('project_monthly_revenue').select('*').eq('year', selectedYear),
      ]);

      if (projRes.data) setProjects(projRes.data);
      if (monthlyRes.data) setMonthlyData(monthlyRes.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchData();
  }, [selectedYear]);

  const filtered = projects.filter((p) => {
    if (filter !== 'all' && p.realization_status !== filter) return false;
    if (search && !p.name?.includes(search) && !p.developer_name?.includes(search)) return false;
    return true;
  });

  const totalValue = filtered.reduce((sum, p) => sum + (p.order_value || 0), 0);

  // Get monthly totals for filtered projects
  function getMonthAmount(projectId: string, month: number): number {
    const entry = monthlyData.find(
      (m) => m.project_id === projectId && m.month === month
    );
    return entry?.amount || 0;
  }

  function getMonthTotal(month: number): number {
    return filtered.reduce((sum, p) => sum + getMonthAmount(p.id, month), 0);
  }

  const yearTotal = Array.from({ length: 12 }, (_, i) => getMonthTotal(i + 1)).reduce((a, b) => a + b, 0);

  function handleAiData(data: any) {
    // Refresh data after AI action
    fetchData();
  }

  return (
    <div className="min-h-screen bg-[#f0f4f8]" dir="rtl">
      <div className="flex-1">
        {/* Header */}
        <header className="bg-white border-b border-[#e2e8f0] px-5 py-4 sticky top-0 z-30">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-lg font-bold text-gray-800">📋 פרויקטים</h1>
              <p className="text-[11px] text-gray-400">{filtered.length} פרויקטים | סה"כ {formatILS(totalValue)}</p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => router.push('/')}
                className="text-xs text-gray-500 hover:text-gray-700 px-3 py-2"
              >
                ← דשבורד
              </button>
              <button
                onClick={() => router.push('/projects/new')}
                className="text-xs bg-[#1a56db] text-white px-4 py-2.5 rounded-lg hover:bg-blue-700 transition-colors font-medium"
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
              className="border border-[#e2e8f0] rounded-lg px-3 py-2 text-xs w-48 focus:outline-none focus:ring-2 focus:ring-[#1a56db]/20 focus:border-[#1a56db]"
            />
            <div className="flex gap-1">
              <button
                onClick={() => setFilter('all')}
                className={`text-[11px] px-3 py-1.5 rounded-lg transition-colors ${
                  filter === 'all' ? 'bg-[#1a56db] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                הכל
              </button>
              {STATUS_OPTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => setFilter(s)}
                  className={`text-[11px] px-3 py-1.5 rounded-lg transition-colors ${
                    filter === s ? 'bg-[#1a56db] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
            <div className="mr-auto flex items-center gap-2">
              <button
                onClick={() => setSelectedYear((y) => y - 1)}
                className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1"
              >
                ←
              </button>
              <span className="text-sm font-bold text-gray-700">{selectedYear}</span>
              <button
                onClick={() => setSelectedYear((y) => y + 1)}
                className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1"
              >
                →
              </button>
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
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50 border-b border-[#e2e8f0]">
                      <th className="text-right text-[10px] text-gray-500 font-medium py-2.5 px-2 whitespace-nowrap sticky right-0 bg-gray-50 z-10">#</th>
                      <th className="text-right text-[10px] text-gray-500 font-medium py-2.5 px-2 whitespace-nowrap">עדכון</th>
                      <th className="text-right text-[10px] text-gray-500 font-medium py-2.5 px-2 whitespace-nowrap">יזם</th>
                      <th className="text-right text-[10px] text-gray-500 font-medium py-2.5 px-2 whitespace-nowrap">משרד תכנון</th>
                      <th className="text-right text-[10px] text-gray-500 font-medium py-2.5 px-2 whitespace-nowrap min-w-[140px]">שם פרויקט</th>
                      <th className="text-right text-[10px] text-gray-500 font-medium py-2.5 px-2 whitespace-nowrap">תיאור</th>
                      <th className="text-center text-[10px] text-gray-500 font-medium py-2.5 px-2 whitespace-nowrap">הסתברות</th>
                      <th className="text-right text-[10px] text-gray-500 font-medium py-2.5 px-2 whitespace-nowrap">סך הפרויקט</th>
                      <th className="text-center text-[10px] text-gray-500 font-medium py-2.5 px-2 whitespace-nowrap">אספקה</th>
                      <th className="text-center text-[10px] text-gray-500 font-medium py-2.5 px-2 whitespace-nowrap">מועד הזמנה</th>
                      <th className="text-center text-[10px] text-gray-500 font-medium py-2.5 px-2 whitespace-nowrap">סטטוס</th>
                      {Array.from({ length: 12 }, (_, i) => (
                        <th key={i} className="text-center text-[10px] text-gray-500 font-medium py-2.5 px-1.5 whitespace-nowrap min-w-[65px]">
                          {MONTH_NAMES[i + 1]}
                        </th>
                      ))}
                      <th className="text-center text-[10px] text-gray-500 font-bold py-2.5 px-2 whitespace-nowrap bg-blue-50">מצטבר</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((project, idx) => {
                      const projectYearTotal = Array.from({ length: 12 }, (_, i) =>
                        getMonthAmount(project.id, i + 1)
                      ).reduce((a, b) => a + b, 0);

                      return (
                        <tr
                          key={project.id}
                          onClick={() => router.push(`/projects/${project.id}`)}
                          className="border-b border-gray-50 hover:bg-blue-50/30 cursor-pointer transition-colors"
                        >
                          <td className="py-2 px-2 text-gray-400 sticky right-0 bg-white z-10">{project.serial_number || idx + 1}</td>
                          <td className="py-2 px-2 text-[10px] text-gray-400 whitespace-nowrap">
                            {project.last_updated_at
                              ? new Date(project.last_updated_at).toLocaleDateString('he-IL')
                              : '—'}
                          </td>
                          <td className="py-2 px-2 text-gray-700 whitespace-nowrap">{project.developer_name || '—'}</td>
                          <td className="py-2 px-2 text-gray-600 whitespace-nowrap">{project.planning_office || '—'}</td>
                          <td className="py-2 px-2 font-semibold text-gray-800">{project.name}</td>
                          <td className="py-2 px-2 text-gray-500 max-w-[150px] truncate">{project.description || '—'}</td>
                          <td className="py-2 px-2 text-center">
                            <span className="text-[11px] font-bold text-gray-700">
                              {project.probability_percent != null ? `${project.probability_percent}%` : '—'}
                            </span>
                          </td>
                          <td className="py-2 px-2 font-semibold text-gray-800 whitespace-nowrap">
                            {formatILS(project.order_value)}
                          </td>
                          <td className="py-2 px-2 text-center text-gray-600">
                            {project.delivery_months ? `${project.delivery_months} חודשים` : '—'}
                          </td>
                          <td className="py-2 px-2 text-center text-gray-600 whitespace-nowrap">
                            {project.order_execution_date
                              ? new Date(project.order_execution_date).toLocaleDateString('he-IL')
                              : '—'}
                          </td>
                          <td className="py-2 px-2 text-center">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                              STATUS_COLORS[project.realization_status] || 'bg-gray-100 text-gray-600'
                            }`}>
                              {project.realization_status || '—'}
                            </span>
                          </td>
                          {Array.from({ length: 12 }, (_, i) => {
                            const amount = getMonthAmount(project.id, i + 1);
                            const isActual = monthlyData.find(
                              (m) => m.project_id === project.id && m.month === i + 1
                            )?.is_actual;
                            return (
                              <td key={i} className={`py-2 px-1.5 text-center text-[10px] whitespace-nowrap ${
                                isActual ? 'text-green-700 font-bold bg-green-50/50' : 'text-gray-500'
                              }`}>
                                {amount > 0 ? formatILS(amount) : '—'}
                              </td>
                            );
                          })}
                          <td className="py-2 px-2 text-center text-[10px] font-bold text-[#1a56db] bg-blue-50/50 whitespace-nowrap">
                            {projectYearTotal > 0 ? formatILS(projectYearTotal) : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  {/* Totals row */}
                  <tfoot>
                    <tr className="bg-gray-50 border-t-2 border-[#e2e8f0]">
                      <td colSpan={11} className="py-2.5 px-2 text-xs font-bold text-gray-700 sticky right-0 bg-gray-50 z-10">
                        סה"כ
                      </td>
                      {Array.from({ length: 12 }, (_, i) => {
                        const monthTotal = getMonthTotal(i + 1);
                        return (
                          <td key={i} className="py-2.5 px-1.5 text-center text-[10px] font-bold text-gray-700 whitespace-nowrap">
                            {monthTotal > 0 ? formatILS(monthTotal) : '—'}
                          </td>
                        );
                      })}
                      <td className="py-2.5 px-2 text-center text-[11px] font-bold text-[#1a56db] bg-blue-50 whitespace-nowrap">
                        {formatILS(yearTotal)}
                      </td>
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
