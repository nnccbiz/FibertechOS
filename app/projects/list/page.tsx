'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import SearchableSelect from '@/components/ui/SearchableSelect';
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
  'הזמנה': 'bg-success-soft text-success',
  'גבוהה': 'bg-azure-100 text-azure-600',
  'בינוני': 'bg-warning-soft text-warning',
  'נמוך': 'bg-danger-soft text-danger',
};

const STATUS_OPTIONS = ['הזמנה', 'גבוהה', 'בינוני', 'נמוך'];

export default function ProjectsListPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectDetails, setProjectDetails] = useState<ProjectDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [monthPickerOpen, setMonthPickerOpen] = useState<string | null>(null);
  const [editingCell, setEditingCell] = useState<{ id: string; field: string } | null>(null);
  const [editValue, setEditValue] = useState('');
  const [sortField, setSortField] = useState<string>('last_updated_at');
  const [sortAsc, setSortAsc] = useState(false);
  const [probFilter, setProbFilter] = useState<Set<string>>(new Set());

  function toggleFilter(value: string) {
    setFilter((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  }

  function toggleProbFilter(value: string) {
    setProbFilter((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  }

  async function fetchData() {
    const supabase = createClient();
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

  function toggleSort(field: string) {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(field === 'name' || field === 'developer_name' || field === 'planning_office');
    }
  }

  const filtered = projects
    .filter((p) => {
      if (filter.size > 0 && !filter.has(p.realization_status)) return false;
      if (probFilter.size > 0) {
        const prob = p.probability_percent || 0;
        const is100 = prob === 100;
        if (!((probFilter.has('100') && is100) || (probFilter.has('under100') && !is100))) return false;
      }
      if (search && !p.name?.includes(search) && !p.developer_name?.includes(search)) return false;
      return true;
    })
    .sort((a, b) => {
      const f = sortField as keyof Project;
      let aVal = a[f] ?? '';
      let bVal = b[f] ?? '';
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortAsc ? aVal - bVal : bVal - aVal;
      }
      aVal = String(aVal);
      bVal = String(bVal);
      return sortAsc ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    });

  const currentYear = new Date().getFullYear();

  function getAllDeliveryEntries(projectId: string): string[] {
    const det = projectDetails.find((d) => d.project_id === projectId);
    if (!det?.delivery_months_list) return [];
    return det.delivery_months_list.split(',').filter(Boolean);
  }

  const totalValue = filtered.reduce((sum, p) => {
    const allEntries = getAllDeliveryEntries(p.id);
    const totalMonths = allEntries.length;
    const monthsThisYear = allEntries.filter((e) => e.startsWith(`${currentYear}-`)).length;
    if (totalMonths === 0 || monthsThisYear === 0) return sum;
    const perMonth = (p.order_value || 0) / totalMonths;
    const prob = (p.probability_percent || 0) / 100;
    return sum + perMonth * monthsThisYear * prob;
  }, 0);

  function getDeliveryMonthsForYear(projectId: string, year: number): number[] {
    return getAllDeliveryEntries(projectId)
      .filter((e) => e.startsWith(`${year}-`))
      .map((e) => parseInt(e.split('-')[1]));
  }

  function hasEntry(projectId: string, year: number, month: number): boolean {
    return getAllDeliveryEntries(projectId).includes(`${year}-${month}`);
  }

  async function toggleMonth(projectId: string, year: number, month: number) {
    const supabase = createClient();
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

  function startEdit(projectId: string, field: string, currentValue: string) {
    setEditingCell({ id: projectId, field });
    setEditValue(currentValue);
  }

  async function saveInlineEdit(projectId: string, field: string, value: string) {
    const supabase = createClient();
    setEditingCell(null);
    const updateData: any = {};
    if (field === 'probability_percent') {
      updateData.probability_percent = value ? parseInt(value) : null;
    } else if (field === 'order_value') {
      updateData.order_value = value ? parseFloat(value) : null;
    } else if (field === 'order_execution_date') {
      updateData.order_execution_date = value || null;
    } else if (field === 'realization_status') {
      updateData.realization_status = value;
    }
    updateData.last_updated_at = new Date().toISOString();
    setProjects((prev) => prev.map((p) => p.id === projectId ? { ...p, ...updateData } : p));
    await supabase.from('projects').update(updateData).eq('id', projectId);
  }

  return (
    <div className="min-h-screen bg-surface-page" dir="rtl">
      <div className="flex-1">
        {/* Header */}
        <header className="bg-white border-b border-line-subtle px-5 py-4 sticky top-0 z-30">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-content-strong">📋 פרויקטים</h1>
              <p className="text-[13px] text-neutral-400">{filtered.length} פרויקטים | סה"כ {formatILS(totalValue)}</p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => router.push('/')}
                className="text-sm text-content-muted hover:text-content-body px-3 py-2"
              >
                ← דשבורד
              </button>
              <button
                onClick={() => router.push('/projects/new')}
                className="text-sm bg-primary text-white px-4 py-2.5 rounded-lg hover:bg-primary-700 transition-colors font-medium"
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
              className="border border-line-subtle rounded-lg px-3 py-2 text-sm w-48 focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary"
            />
            <div className="flex gap-1 flex-wrap">
              <button
                onClick={() => { setFilter(new Set()); setProbFilter(new Set()); }}
                className={`text-[13px] px-3 py-1.5 rounded-lg transition-colors ${
                  filter.size === 0 && probFilter.size === 0 ? 'bg-primary text-white' : 'bg-neutral-100 text-content-body hover:bg-neutral-200'
                }`}
              >
                הכל
              </button>
              {STATUS_OPTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => toggleFilter(s)}
                  className={`text-[13px] px-3 py-1.5 rounded-lg transition-colors ${
                    filter.has(s) ? 'bg-primary text-white' : 'bg-neutral-100 text-content-body hover:bg-neutral-200'
                  }`}
                >
                  {s}
                </button>
              ))}
              <span className="w-px bg-neutral-300 mx-1" />
              <button
                onClick={() => toggleProbFilter('100')}
                className={`text-[13px] px-3 py-1.5 rounded-lg transition-colors ${
                  probFilter.has('100') ? 'bg-success text-white' : 'bg-neutral-100 text-content-body hover:bg-neutral-200'
                }`}
              >
                100%
              </button>
              <button
                onClick={() => toggleProbFilter('under100')}
                className={`text-[13px] px-3 py-1.5 rounded-lg transition-colors ${
                  probFilter.has('under100') ? 'bg-warning text-white' : 'bg-neutral-100 text-content-body hover:bg-neutral-200'
                }`}
              >
                0-99%
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
            <div className="bg-white rounded-xl border border-line-subtle overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-neutral-50 border-b border-line-subtle">
                      {[
                        { key: 'serial_number', label: '#', align: 'right', sticky: true },
                        { key: 'last_updated_at', label: 'עדכון', align: 'right' },
                        { key: 'developer_name', label: 'יזם', align: 'right' },
                        { key: 'planning_office', label: 'משרד תכנון', align: 'right' },
                        { key: 'name', label: 'שם פרויקט', align: 'right', minW: true },
                        { key: 'description', label: 'תיאור', align: 'right' },
                        { key: 'probability_percent', label: 'הסתברות', align: 'center' },
                        { key: 'order_value', label: 'סך הפרויקט', align: 'right' },
                        { key: 'order_execution_date', label: 'מועד הזמנה', align: 'center' },
                        { key: 'realization_status', label: 'סטטוס', align: 'center' },
                        { key: '', label: 'חודשי אספקה', align: 'right' },
                      ].map((col) => (
                        <th
                          key={col.label}
                          onClick={() => col.key && toggleSort(col.key)}
                          className={`text-${col.align} text-[12px] text-content-muted font-medium py-2.5 px-2 whitespace-nowrap ${col.sticky ? 'sticky right-0 bg-neutral-50 z-10' : ''} ${col.minW ? 'min-w-[140px]' : ''} ${col.key ? 'cursor-pointer hover:text-primary select-none' : ''}`}
                        >
                          {col.label}{sortField === col.key ? (sortAsc ? ' ▲' : ' ▼') : ''}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((project, idx) => {
                      const currentYearMonths = getDeliveryMonthsForYear(project.id, currentYear);

                      return (
                        <tr
                          key={project.id}
                          onClick={() => router.push(`/projects/${project.id}`)}
                          className="border-b border-line-subtle hover:bg-azure-100 cursor-pointer transition-colors"
                        >
                          <td className="py-2 px-2 text-neutral-400 sticky right-0 bg-white z-10">{project.serial_number || idx + 1}</td>
                          <td className="py-2 px-2 text-[12px] text-neutral-400 whitespace-nowrap">
                            {project.last_updated_at
                              ? new Date(project.last_updated_at).toLocaleDateString('he-IL')
                              : '—'}
                          </td>
                          <td className="py-2 px-2 text-content-body whitespace-nowrap">{project.developer_name || '—'}</td>
                          <td className="py-2 px-2 text-content-body whitespace-nowrap">{project.planning_office || '—'}</td>
                          <td className="py-2 px-2 font-semibold text-content-strong">{project.name}</td>
                          <td className="py-2 px-2 text-content-muted max-w-[150px] truncate">{project.description || '—'}</td>
                          <td className="py-2 px-2 text-center" onClick={(e) => e.stopPropagation()}>
                            {editingCell?.id === project.id && editingCell?.field === 'probability_percent' ? (
                              <input type="number" min="0" max="100" value={editValue} onChange={(e) => setEditValue(e.target.value)}
                                onBlur={() => saveInlineEdit(project.id, 'probability_percent', editValue)}
                                onKeyDown={(e) => e.key === 'Enter' && saveInlineEdit(project.id, 'probability_percent', editValue)}
                                className="w-16 text-center border border-primary rounded px-1 py-0.5 text-sm focus:outline-none" autoFocus dir="ltr" />
                            ) : (
                              <span className="text-[13px] font-bold text-content-body cursor-pointer hover:text-primary"
                                onClick={() => startEdit(project.id, 'probability_percent', String(project.probability_percent ?? ''))}>
                                {project.probability_percent != null ? `${project.probability_percent}%` : '—'}
                              </span>
                            )}
                          </td>
                          <td className="py-2 px-2 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                            {editingCell?.id === project.id && editingCell?.field === 'order_value' ? (
                              <input type="number" value={editValue} onChange={(e) => setEditValue(e.target.value)}
                                onBlur={() => saveInlineEdit(project.id, 'order_value', editValue)}
                                onKeyDown={(e) => e.key === 'Enter' && saveInlineEdit(project.id, 'order_value', editValue)}
                                className="w-24 border border-primary rounded px-1 py-0.5 text-sm focus:outline-none" autoFocus dir="ltr" />
                            ) : (
                              <span className="font-semibold text-content-strong cursor-pointer hover:text-primary"
                                onClick={() => startEdit(project.id, 'order_value', String(project.order_value || ''))}>
                                {formatILS(project.order_value)}
                              </span>
                            )}
                          </td>
                          <td className="py-2 px-2 text-center whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                            {editingCell?.id === project.id && editingCell?.field === 'order_execution_date' ? (
                              <input type="date" value={editValue} onChange={(e) => setEditValue(e.target.value)}
                                onBlur={() => saveInlineEdit(project.id, 'order_execution_date', editValue)}
                                onKeyDown={(e) => e.key === 'Enter' && saveInlineEdit(project.id, 'order_execution_date', editValue)}
                                className="border border-primary rounded px-1 py-0.5 text-sm focus:outline-none" autoFocus />
                            ) : (
                              <span className="text-content-body cursor-pointer hover:text-primary"
                                onClick={() => startEdit(project.id, 'order_execution_date', project.order_execution_date?.substring(0, 10) || '')}>
                                {project.order_execution_date ? new Date(project.order_execution_date).toLocaleDateString('he-IL') : '—'}
                              </span>
                            )}
                          </td>
                          <td className="py-2 px-2 text-center" onClick={(e) => e.stopPropagation()}>
                            {editingCell?.id === project.id && editingCell?.field === 'realization_status' ? (
                              <SearchableSelect value={editValue} autoOpen
                                onChange={(v) => { saveInlineEdit(project.id, 'realization_status', v); setEditingCell(null); }}
                                className="border border-primary rounded px-1 py-0.5 text-sm min-w-[120px]" placeholder="—"
                                options={[{ value: '', label: '—' }, ...STATUS_OPTIONS.map((s) => ({ value: s, label: s }))]} />
                            ) : (
                              <span className={`text-[12px] font-bold px-2 py-0.5 rounded-full cursor-pointer ${
                                STATUS_COLORS[project.realization_status] || 'bg-neutral-100 text-content-body'
                              }`} onClick={() => startEdit(project.id, 'realization_status', project.realization_status || '')}>
                                {project.realization_status || '—'}
                              </span>
                            )}
                          </td>
                          <td className="py-2 px-2 relative" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={() => setMonthPickerOpen(monthPickerOpen === project.id ? null : project.id)}
                              className="w-full text-right"
                            >
                              {currentYearMonths.length > 0 ? (
                                <div className="flex flex-wrap gap-1 flex-row-reverse justify-end">
                                  {currentYearMonths.map((m) => (
                                    <span key={m} className="text-[11px] bg-primary-50 text-primary px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap">
                                      {MONTH_NAMES[m]}
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-[12px] text-neutral-400 hover:text-primary">+ בחר חודשים</span>
                              )}
                            </button>
                            {monthPickerOpen === project.id && (
                              <div className="absolute top-full left-0 z-40 bg-white border border-line-subtle rounded-xl shadow-lg p-3 mt-1 w-[220px] space-y-3">
                                {[currentYear, currentYear + 1].map((year) => (
                                  <div key={year}>
                                    <p className="text-[12px] font-bold text-content-muted mb-1.5 text-center">{year}</p>
                                    <div className="grid grid-cols-3 gap-1">
                                      {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                                        <button
                                          key={m}
                                          onClick={() => toggleMonth(project.id, year, m)}
                                          className={`text-[12px] px-2 py-1.5 rounded-lg transition-colors ${
                                            hasEntry(project.id, year, m)
                                              ? 'bg-primary text-white'
                                              : 'bg-neutral-50 text-content-body hover:bg-neutral-100'
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
                    <tr className="bg-neutral-50 border-t-2 border-line-subtle">
                      <td colSpan={10} className="py-2.5 px-2 text-sm font-bold text-content-body sticky right-0 bg-neutral-50 z-10">
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
