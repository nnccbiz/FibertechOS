'use client';

import { createClient } from '@/lib/supabase/client';
import { useState } from 'react';

interface Alert {
  id: string;
  type: string;
  message: string;
  created_at: string;
  is_resolved: boolean;
  assigned_to: string | null;
  project_id: string | null;
}

interface AlertsListProps {
  alerts: Alert[];
  loading: boolean;
}

function timeAgo(dateStr: string) {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffDays > 0) return `לפני ${diffDays} ימים`;
  if (diffHours > 0) return `לפני ${diffHours} שעות`;
  if (diffMins > 0) return `לפני ${diffMins} דקות`;
  return 'עכשיו';
}

export default function AlertsList({ alerts, loading }: AlertsListProps) {
  const [resolvedIds, setResolvedIds] = useState<Set<string>>(new Set());

  async function toggleResolved(id: string) {
    const supabase = createClient();
    setResolvedIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    await supabase.from('alerts').update({ is_resolved: true }).eq('id', id);
  }

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-[#e2e8f0] p-5">
        <div className="skeleton h-5 w-32 mb-4" />
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="skeleton h-14 w-full" />
          ))}
        </div>
      </div>
    );
  }

  const unresolvedAlerts = alerts.filter((a) => !a.is_resolved && !resolvedIds.has(a.id));

  return (
    <div className="bg-white rounded-xl border border-[#e2e8f0] p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-bold text-gray-700">📌 משימות לביצוע</h3>
        {unresolvedAlerts.length > 0 && (
          <span className="text-[12px] bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-bold">
            {unresolvedAlerts.length}
          </span>
        )}
      </div>
      {unresolvedAlerts.length === 0 ? (
        <p className="text-lg text-gray-400 text-center py-4">אין משימות פתוחות</p>
      ) : (
        <div className="space-y-2">
          {unresolvedAlerts.slice(0, 10).map((alert) => (
            <div
              key={alert.id}
              className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 flex items-start gap-2"
            >
              <button
                onClick={() => toggleResolved(alert.id)}
                className="mt-0.5 w-5 h-5 rounded border-2 border-amber-400 flex items-center justify-center hover:bg-amber-100 transition-colors flex-shrink-0"
                title="סמן כבוצע"
              >
              </button>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-700">{alert.message}</p>
                {alert.assigned_to && (
                  <p className="text-[11px] text-gray-400 mt-0.5">{alert.assigned_to}</p>
                )}
              </div>
              <span className="text-[11px] text-gray-400 whitespace-nowrap mt-0.5 flex-shrink-0">
                {alert.created_at ? timeAgo(alert.created_at) : ''}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
