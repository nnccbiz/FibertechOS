'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import KpiCard from '@/components/dashboard/KpiCard';
import AlertsList from '@/components/dashboard/AlertsList';
import ProjectsTable from '@/components/dashboard/ProjectsTable';
import Pipeline from '@/components/dashboard/Pipeline';
import TeamStatus from '@/components/dashboard/TeamStatus';
import InventoryWidget from '@/components/dashboard/InventoryWidget';
import ActivityLog from '@/components/ai/ActivityLog';

interface DashboardData {
  projects: any[];
  alerts: any[];
  leads: any[];
  teamMembers: any[];
  kpi: {
    activeProjects: number;
    monthlyRevenue: number;
    openAlerts: number;
    clientIssues: number;
    supplierIssues: number;
    shipmentsEnRoute: number;
  };
}

export default function DashboardPage() {
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showQuickUpdate, setShowQuickUpdate] = useState(false);
  const [allProjects, setAllProjects] = useState<any[]>([]);
  const [projectSearch, setProjectSearch] = useState('');
  const [selectedProject, setSelectedProject] = useState<any>(null);
  const [quickUpdate, setQuickUpdate] = useState({ update_date: new Date().toISOString().substring(0, 10), people: '', title: '', description: '', tasks: '' });
  const [savingUpdate, setSavingUpdate] = useState(false);

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        setError(null);

        const [projectsRes, alertsRes, leadsRes, teamRes] = await Promise.all([
          supabase.from('projects').select('*'),
          supabase.from('alerts').select('*'),
          supabase.from('leads').select('*'),
          supabase.from('team_members').select('*'),
        ]);

        if (projectsRes.error) throw projectsRes.error;
        if (alertsRes.error) throw alertsRes.error;
        if (leadsRes.error) throw leadsRes.error;
        if (teamRes.error) throw teamRes.error;

        const projects = projectsRes.data || [];
        const alerts = alertsRes.data || [];
        const leads = leadsRes.data || [];
        const teamMembers = teamRes.data || [];

        const activeProjects = projects.filter((p) => p.status === 'active');
        const openAlerts = alerts.filter((a) => !a.is_resolved);
        const clientAlerts = openAlerts.filter((a) => a.type === 'client');
        const supplierAlerts = openAlerts.filter((a) => a.type === 'supplier');
        const shipmentAlerts = openAlerts.filter((a) => a.type === 'shipment');

        const monthlyRevenue = activeProjects.reduce(
          (sum, p) => sum + (p.order_value || 0),
          0
        );

        setData({
          projects,
          alerts,
          leads,
          teamMembers,
          kpi: {
            activeProjects: activeProjects.length,
            monthlyRevenue,
            openAlerts: openAlerts.length,
            clientIssues: clientAlerts.length,
            supplierIssues: supplierAlerts.length,
            shipmentsEnRoute: shipmentAlerts.length,
          },
        });
      } catch (err: any) {
        console.error('Error fetching dashboard data:', err);
        setError(err.message || 'שגיאה בטעינת נתונים');
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  async function openQuickUpdate() {
    setShowQuickUpdate(true);
    setSelectedProject(null);
    setProjectSearch('');
    setQuickUpdate({ update_date: new Date().toISOString().substring(0, 10), people: '', title: '', description: '', tasks: '' });
    const { data: projs } = await supabase.from('projects').select('id, name, developer_name, planning_office, last_updated_at').order('last_updated_at', { ascending: false });
    setAllProjects(projs || []);
  }

  async function saveQuickUpdate() {
    if (!selectedProject || !quickUpdate.title.trim()) return;
    setSavingUpdate(true);
    await supabase.from('project_updates').insert({
      project_id: selectedProject.id,
      update_date: quickUpdate.update_date,
      people: quickUpdate.people,
      title: quickUpdate.title,
      description: quickUpdate.description,
      tasks: quickUpdate.tasks,
    });
    setSavingUpdate(false);
    setShowQuickUpdate(false);
  }

  const filteredProjects = allProjects.filter((p) => {
    if (!projectSearch) return true;
    const q = projectSearch.toLowerCase();
    return (p.name || '').toLowerCase().includes(q) ||
      (p.developer_name || '').toLowerCase().includes(q) ||
      (p.planning_office || '').toLowerCase().includes(q);
  });

  const kpiCards = [
    {
      title: 'פרויקטים פעילים',
      value: data?.kpi.activeProjects ?? '—',
      icon: '📋',
      color: '#1a56db',
    },
    {
      title: 'הכנסה החודש',
      value: data
        ? new Intl.NumberFormat('he-IL', {
            style: 'currency',
            currency: 'ILS',
            maximumFractionDigits: 0,
          }).format(data.kpi.monthlyRevenue)
        : '—',
      icon: '💰',
      color: '#059669',
    },
    {
      title: 'התראות פתוחות',
      value: data?.kpi.openAlerts ?? '—',
      icon: '⚠️',
      color: '#dc2626',
    },
    {
      title: 'נושאים פתוחים — לקוחות',
      value: data?.kpi.clientIssues ?? '—',
      icon: '👤',
      color: '#7c3aed',
    },
    {
      title: 'נושאים פתוחים — ספקים',
      value: data?.kpi.supplierIssues ?? '—',
      icon: '🏭',
      color: '#d97706',
    },
    {
      title: 'משלוחים בדרך',
      value: data?.kpi.shipmentsEnRoute ?? '—',
      icon: '🚢',
      color: '#0891b2',
    },
  ];

  return (
    <div className="min-h-screen" dir="rtl">
        {/* Header */}
        <header className="bg-white border-b border-[#e2e8f0] px-5 py-4 sticky top-0 z-30">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-800">לוח בקרה</h1>
              <p className="text-[13px] text-gray-400">
                {new Date().toLocaleDateString('he-IL', {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </p>
            </div>
            <div className="md:hidden">
              <span className="text-2xl font-bold text-[#1a56db]">FibertechOS</span>
            </div>
          </div>
        </header>

        <div className="max-w-7xl mx-auto px-4 md:px-6 pt-5">
          {/* Error banner */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-5 flex items-center gap-3">
              <span className="text-2xl">❌</span>
              <div>
                <p className="text-lg font-semibold text-red-700">שגיאת חיבור</p>
                <p className="text-sm text-red-500">{error}</p>
              </div>
              <button
                onClick={() => window.location.reload()}
                className="mr-auto text-sm bg-red-100 text-red-600 px-3 py-1 rounded-lg hover:bg-red-200 transition-colors"
              >
                נסה שוב
              </button>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-3 mb-5 animate-fade-in-up">
            <button
              onClick={() => router.push('/projects/new')}
              className="flex items-center gap-2 bg-[#1a56db] text-white text-lg font-medium px-4 py-2.5 rounded-lg hover:bg-blue-700 transition-colors"
            >
              <span>➕</span>
              <span>פרויקט חדש</span>
            </button>
            <button
              onClick={openQuickUpdate}
              className="flex items-center gap-2 bg-white border border-[#e2e8f0] text-gray-700 text-lg font-medium px-4 py-2.5 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <span>📝</span>
              <span>עדכון פרויקט</span>
            </button>
            <button className="flex items-center gap-2 bg-white border border-[#e2e8f0] text-gray-700 text-lg font-medium px-4 py-2.5 rounded-lg hover:bg-gray-50 transition-colors">
              <span>📈</span>
              <span>יצירת דוחות</span>
            </button>
          </div>

          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-5 animate-fade-in-up">
            {kpiCards.map((card) => (
              <KpiCard key={card.title} {...card} loading={loading} />
            ))}
          </div>

          {/* Main body — two columns */}
          <div className="flex flex-col lg:flex-row gap-5">
            {/* Left column — wide */}
            <div className="flex-1 space-y-5 min-w-0">
              <div className="animate-fade-in-up-delay-1">
                <AlertsList alerts={data?.alerts || []} loading={loading} />
              </div>
              <div className="animate-fade-in-up-delay-2">
                <ProjectsTable projects={data?.projects || []} loading={loading} />
              </div>
              <div className="animate-fade-in-up-delay-3">
                <Pipeline leads={data?.leads || []} loading={loading} />
              </div>
            </div>

            {/* Right column — narrow (320px) */}
            <div className="w-full lg:w-[320px] flex-shrink-0 space-y-5">
              {/* AI Activity Log */}
              <div className="animate-fade-in-up-delay-1">
                <ActivityLog refreshTrigger={0} />
              </div>

              {/* Shipments en route */}
              <div className="animate-fade-in-up-delay-2">
                <div className="bg-white rounded-xl border border-[#e2e8f0] p-5">
                  <h3 className="text-lg font-bold text-gray-700 mb-3">🚢 משלוחים בדרך</h3>
                  {loading ? (
                    <div className="space-y-2">
                      {[1, 2].map((i) => (
                        <div key={i} className="skeleton h-10 w-full" />
                      ))}
                    </div>
                  ) : (data?.kpi.shipmentsEnRoute ?? 0) > 0 ? (
                    <div className="space-y-2">
                      {(data?.alerts || [])
                        .filter((a) => a.type === 'shipment' && !a.is_resolved)
                        .map((shipment) => (
                          <div
                            key={shipment.id}
                            className="bg-cyan-50 border border-cyan-100 rounded-lg px-3 py-2"
                          >
                            <p className="text-sm font-medium text-gray-700">{shipment.message}</p>
                          </div>
                        ))}
                    </div>
                  ) : (
                    <p className="text-lg text-gray-400 text-center py-3">אין משלוחים פעילים</p>
                  )}
                </div>
              </div>

              {/* Inventory — above team */}
              <div className="animate-fade-in-up-delay-3">
                <InventoryWidget />
              </div>

              {/* Team status */}
              <div className="animate-fade-in-up-delay-4">
                <TeamStatus members={data?.teamMembers || []} loading={loading} />
              </div>
            </div>
          </div>
        </div>

        {/* Quick update modal */}
        {showQuickUpdate && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowQuickUpdate(false)}>
            <div className="bg-white rounded-2xl shadow-2xl w-[90vw] max-w-[520px] max-h-[85vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
              <div className="px-5 py-4 border-b border-[#e2e8f0] flex items-center justify-between flex-shrink-0">
                <h3 className="text-lg font-bold text-gray-700">📝 עדכון מהיר לפרויקט</h3>
                <button onClick={() => setShowQuickUpdate(false)} className="text-gray-400 hover:text-gray-600">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                </button>
              </div>

              <div className="px-5 py-4 space-y-4 overflow-y-auto flex-1">
                {/* Project selector */}
                {!selectedProject ? (
                  <div className="space-y-3">
                    <input
                      type="text"
                      placeholder="חפש פרויקט, יזם או מתכנן..."
                      value={projectSearch}
                      onChange={(e) => setProjectSearch(e.target.value)}
                      className="w-full border border-[#e2e8f0] rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a56db]/20 focus:border-[#1a56db]"
                      autoFocus
                    />
                    <div className="max-h-[300px] overflow-y-auto space-y-1">
                      {filteredProjects.slice(0, 20).map((p) => (
                        <button
                          key={p.id}
                          onClick={() => setSelectedProject(p)}
                          className="w-full text-right px-3 py-2.5 rounded-lg hover:bg-blue-50 transition-colors flex items-center justify-between group"
                        >
                          <div>
                            <p className="text-sm font-medium text-gray-800">{p.name}</p>
                            <p className="text-[12px] text-gray-400">
                              {p.developer_name || '—'}{p.planning_office ? ` · ${p.planning_office}` : ''}
                            </p>
                          </div>
                          {p.last_updated_at && (
                            <span className="text-[11px] text-gray-300 group-hover:text-gray-400">
                              {new Date(p.last_updated_at).toLocaleDateString('he-IL')}
                            </span>
                          )}
                        </button>
                      ))}
                      {filteredProjects.length === 0 && (
                        <p className="text-sm text-gray-400 text-center py-4">לא נמצאו פרויקטים</p>
                      )}
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Selected project header */}
                    <div className="flex items-center justify-between bg-blue-50 rounded-lg px-3 py-2">
                      <div>
                        <p className="text-sm font-bold text-[#1a56db]">{selectedProject.name}</p>
                        <p className="text-[12px] text-[#1a56db]/60">{selectedProject.developer_name || ''}</p>
                      </div>
                      <button onClick={() => setSelectedProject(null)} className="text-[12px] text-[#1a56db] hover:underline">
                        שנה פרויקט
                      </button>
                    </div>

                    {/* Update form */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[12px] font-semibold text-gray-500 mb-1">תאריך</label>
                        <input type="date" value={quickUpdate.update_date} onChange={(e) => setQuickUpdate({ ...quickUpdate, update_date: e.target.value })} className="w-full border border-[#e2e8f0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a56db]/20" />
                      </div>
                      <div>
                        <label className="block text-[12px] font-semibold text-gray-500 mb-1">אנשים נוגעים בעניין</label>
                        <input type="text" placeholder="שמות, מופרדים בפסיק" value={quickUpdate.people} onChange={(e) => setQuickUpdate({ ...quickUpdate, people: e.target.value })} className="w-full border border-[#e2e8f0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a56db]/20" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[12px] font-semibold text-gray-500 mb-1">כותרת</label>
                      <input type="text" placeholder="למשל: פגישה עם מנהל הפרויקט" value={quickUpdate.title} onChange={(e) => setQuickUpdate({ ...quickUpdate, title: e.target.value })} className="w-full border border-[#e2e8f0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a56db]/20" />
                    </div>
                    <div>
                      <label className="block text-[12px] font-semibold text-gray-500 mb-1">תיאור מלא</label>
                      <textarea placeholder="פירוט הפגישה / העדכון..." value={quickUpdate.description} onChange={(e) => setQuickUpdate({ ...quickUpdate, description: e.target.value })} className="w-full border border-[#e2e8f0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a56db]/20 min-h-[80px]" />
                    </div>
                    <div>
                      <label className="block text-[12px] font-semibold text-gray-500 mb-1">משימות לביצוע</label>
                      <textarea placeholder="משימה 1, משימה 2..." value={quickUpdate.tasks} onChange={(e) => setQuickUpdate({ ...quickUpdate, tasks: e.target.value })} className="w-full border border-[#e2e8f0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a56db]/20 min-h-[50px]" />
                    </div>
                    <button
                      onClick={saveQuickUpdate}
                      disabled={savingUpdate || !quickUpdate.title.trim()}
                      className="w-full bg-[#1a56db] text-white text-sm font-semibold py-2.5 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                    >
                      {savingUpdate ? 'שומר...' : 'שמור עדכון'}
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
    </div>
  );
}
