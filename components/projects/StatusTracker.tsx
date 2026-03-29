'use client';

interface StatusTrackerProps {
  currentStatus: string;
  onChange: (status: string) => void;
}

const STATUSES = [
  { key: 'תכנון כללי', icon: '📐', color: '#94a3b8' },
  { key: 'תכנון מפורט', icon: '📋', color: '#3b82f6' },
  { key: 'טרום מכרז', icon: '📄', color: '#f59e0b' },
  { key: 'מועד הגשת מכרז', icon: '📅', color: '#f97316' },
  { key: 'קבלן זוכה', icon: '🏆', color: '#22c55e' },
];

export default function StatusTracker({ currentStatus, onChange }: StatusTrackerProps) {
  const currentIndex = STATUSES.findIndex((s) => s.key === currentStatus);

  return (
    <div className="flex items-center gap-1 overflow-x-auto py-1">
      {STATUSES.map((status, i) => {
        const isActive = status.key === currentStatus;
        const isPast = i < currentIndex;

        return (
          <button
            key={status.key}
            type="button"
            onClick={() => onChange(status.key)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
              isActive
                ? 'text-white shadow-sm'
                : isPast
                ? 'bg-gray-100 text-gray-600'
                : 'bg-gray-50 text-gray-400'
            }`}
            style={isActive ? { backgroundColor: status.color } : undefined}
          >
            <span>{status.icon}</span>
            <span>{status.key}</span>
          </button>
        );
      })}
    </div>
  );
}
