'use client';

interface KpiCardProps {
  title: string;
  value: string | number;
  icon: string;
  color: string;
  loading?: boolean;
}

export default function KpiCard({ title, value, icon, color, loading }: KpiCardProps) {
  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-[#e2e8f0] p-4">
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
    <div className="bg-white rounded-xl border border-[#e2e8f0] p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm text-gray-500 font-medium truncate">{title}</p>
          <p className="text-3xl font-bold text-gray-800 mt-1 truncate">{value}</p>
        </div>
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center text-2xl flex-shrink-0"
          style={{ backgroundColor: `${color}15`, color }}
        >
          {icon}
        </div>
      </div>
    </div>
  );
}
