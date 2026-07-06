'use client';

import Icon, { type IconName } from '@/components/ui/Icon';

interface StatusTrackerProps {
  currentStatus: string;
  onChange: (status: string) => void;
}

const STATUSES = [
  { key: 'תכנון כללי', icon: 'drawings' as IconName, color: '#8b9099' },
  { key: 'תכנון מפורט', icon: 'clipboard' as IconName, color: '#1a73b8' },
  { key: 'טרום מכרז', icon: 'file' as IconName, color: '#c9821a' },
  { key: 'מועד הגשת מכרז', icon: 'calendar' as IconName, color: '#c9821a' },
  { key: 'קבלן זוכה', icon: 'trophy' as IconName, color: '#1e8a5a' },
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
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
              isActive
                ? 'text-white shadow-sm'
                : isPast
                ? 'bg-neutral-100 text-content-body'
                : 'bg-neutral-50 text-neutral-400'
            }`}
            style={isActive ? { backgroundColor: status.color } : undefined}
          >
            <span><Icon name={status.icon} size={20} /></span>
            <span>{status.key}</span>
          </button>
        );
      })}
    </div>
  );
}
