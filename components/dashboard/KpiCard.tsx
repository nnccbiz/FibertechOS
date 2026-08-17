'use client';

import Icon, { type IconName } from '@/components/ui/Icon';

interface KpiCardProps {
  title: string;
  value: string | number;
  icon: IconName;
  color: string;
  loading?: boolean;
  onClick?: () => void;
}

export default function KpiCard({ title, value, icon, color, loading, onClick }: KpiCardProps) {
  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-line-subtle p-4">
        <div className="flex items-center justify-between">
          <div className="space-y-2 flex-1">
            <div className="skeleton h-3 w-20" />
            <div className="skeleton h-7 w-16" />
          </div>
          <div className="skeleton h-10 w-10 rounded-lg" />
        </div>
      </div>
    );
  }

  return (
    <div
      onClick={onClick}
      className={`bg-white rounded-xl border border-line-subtle p-4 hover:shadow-md transition-shadow ${onClick ? 'cursor-pointer hover:border-line-strong active:scale-[0.99]' : ''}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm text-content-muted font-medium">{title}</p>
          <p className="text-xl font-bold text-content-strong mt-1">{value}</p>
        </div>
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center text-2xl flex-shrink-0"
          style={{ backgroundColor: `${color}15`, color }}
        >
          <Icon name={icon} size={22} />
        </div>
      </div>
    </div>
  );
}
