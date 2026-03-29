'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import Sidebar from '@/components/ui/Sidebar';
import BottomNav from '@/components/ui/BottomNav';
import KpiCard from '@/components/dashboard/KpiCard';
import AlertsList from '@/components/dashboard/AlertsList';
import ProjectsTable from '@/components/dashboard/ProjectsTable';
import Pipeline from '@/components/dashboard/Pipeline';
import TeamStatus from '@/components/dashboard/TeamStatus';
import InventoryWidget from '@/components/dashboard/InventoryWidget';

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
  const [activeNav, setActiveNav] = useState('dashboard');
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
      <Sidebar activeKey={activeNav} onNavigate={setActiveNav} />
      <BottomNav activeKey={activeNav} onNavigate={setActiveNav} />

      {/* Main content area */}
      <main className="md:mr-[220px] pb-20 md:pb-6">
        {/* Header */}
        <header className="bg-white border-b border-[#e2e8f0] px-5 py-4 sticky top-0 z-30">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div>
              <h1 className="text-lg font-bold text-gray-800">לוח בקרה</h1>
              <p className="text-[11px] text-gray-400">
                {new Date().toLocaleDateString('he-IL', {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </p>
            </div>
            <div className="md:hidden">
              <span className="text-lg font-bold text-[#1a56db]">FibertechOS</span>
            </div>
          </div>
        </header>

        <div className="max-w-7xl mx-auto px-4 md:px-6 pt-5">
          {/* Error banner */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-5 flex items-center gap-3">
              <span className="text-lg">❌</span>
              <div>
                <p className="text-sm font-semibold text-red-700">שגיאת חיבור</p>
                <p className="text-xs text-red-500">{error}</p>
              </div>
              <button
                onClick={() => window.location.reload()}
                className="mr-auto text-xs bg-red-100 text-red-600 px-3 py-1 rounded-lg hover:bg-red-200 transition-colors"
              >
                נסה שוב
              </button>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-3 mb-5 animate-fade-in-up">
            <button className="flex items-center gap-2 bg-[#1a56db] text-white text-sm font-medium px-4 py-2.5 rounded-lg hover:bg-blue-700 transition-colors">
              <span>➕</span>
              <span>פרויקט חדש</span>
            </button>
            <button className="flex items-center gap-2 bg-white border border-[#e2e8f0] text-gray-700 text-sm font-medium px-4 py-2.5 rounded-lg hover:bg-gray-50 transition-colors">
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
              {/* Shipments en route */}
              <div className="animate-fade-in-up-delay-2">
                <div className="bg-white rounded-xl border border-[#e2e8f0] p-5">
                  <h3 className="text-sm font-bold text-gray-700 mb-3">🚢 משלוחים בדרך</h3>
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
                            <p className="text-xs font-medium text-gray-700">{shipment.message}</p>
                          </div>
                        ))}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-400 text-center py-3">אין משלוחים פעילים</p>
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
      </main>
    </div>
  );
}
