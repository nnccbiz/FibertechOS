'use client';

interface Alert {
  id: string;
  type: string;
  message: string;
  created_at: string;
  is_resolved: boolean;
  assigned_to: string | null;
}

interface AlertsListProps {
  alerts: Alert[];
  loading: boolean;
}

function getAlertTypeStyle(type: string) {
  switch (type) {
    case 'urgent':
    case 'critical':
      return { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700', icon: '🔴' };
    case 'warning':
      return { bg: 'bg-yellow-50', border: 'border-yellow-200', text: 'text-yellow-700', icon: '🟡' };
    case 'delay':
      return { bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-700', icon: '🟠' };
    default:
      return { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700', icon: '🔵' };
  }
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

  const unresolvedAlerts = alerts.filter((a) => !a.is_resolved);

  if (unresolvedAlerts.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-[#e2e8f0] p-5">
        <h3 className="text-sm font-bold text-gray-700 mb-3">⚠️ התראות דחופות</h3>
        <p className="text-sm text-gray-400 text-center py-4">אין התראות פתוחות</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-[#e2e8f0] p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-gray-700">⚠️ התראות דחופות</h3>
        <span className="text-[10px] bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-bold">
          {unresolvedAlerts.length}
        </span>
      </div>
      <div className="space-y-2">
        {unresolvedAlerts.slice(0, 5).map((alert) => {
          const style = getAlertTypeStyle(alert.type);
          return (
            <div
              key={alert.id}
              className={`${style.bg} ${style.border} border rounded-lg px-3 py-2.5 flex items-start gap-2`}
            >
              <span className="text-sm mt-0.5">{style.icon}</span>
              <div className="flex-1 min-w-0">
                <p className={`text-xs font-semibold ${style.text}`}>{alert.type}</p>
                <p className="text-xs text-gray-700 mt-0.5 truncate">{alert.message}</p>
              </div>
              <span className="text-[10px] text-gray-400 whitespace-nowrap mt-0.5">
                {alert.created_at ? timeAgo(alert.created_at) : ''}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
