'use client';

import { useRouter } from 'next/navigation';

interface Project {
  id: string;
  name: string;
  current_stage: number;
  stage_label: string;
  progress_percent: number;
  priority: string;
  assigned_to: string | null;
  order_value: number;
  status: string;
}

interface ProjectsTableProps {
  projects: Project[];
  loading: boolean;
}

function getProfitColor(value: number) {
  // Simulating profitability based on order_value thresholds
  // In real app this would come from actual profit data
  if (value > 500000) return { color: '#22c55e', label: 'ירוק' }; // green >10%
  if (value > 200000) return { color: '#eab308', label: 'צהוב' }; // yellow 0-10%
  return { color: '#ef4444', label: 'אדום' }; // red negative
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('he-IL', {
    style: 'currency',
    currency: 'ILS',
    maximumFractionDigits: 0,
  }).format(value);
}

export default function ProjectsTable({ projects, loading }: ProjectsTableProps) {
  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-[#e2e8f0] p-5">
        <div className="skeleton h-5 w-40 mb-4" />
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="skeleton h-12 w-full" />
          ))}
        </div>
      </div>
    );
  }

  const router = useRouter();
  const activeProjects = projects;

  return (
    <div className="bg-white rounded-xl border border-[#e2e8f0] p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold text-gray-700">📋 פרויקטים פעילים</h3>
        <span className="text-[12px] bg-blue-100 text-[#1a56db] px-2 py-0.5 rounded-full font-bold">
          {activeProjects.length}
        </span>
      </div>

      {activeProjects.length === 0 ? (
        <p className="text-lg text-gray-400 text-center py-4">אין פרויקטים פעילים</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-lg">
            <thead>
              <tr className="border-b border-[#e2e8f0]">
                <th className="text-right text-[13px] text-gray-500 font-medium pb-2 pr-2">פרויקט</th>
                <th className="text-right text-[13px] text-gray-500 font-medium pb-2">ערך</th>
                <th className="text-right text-[13px] text-gray-500 font-medium pb-2">שלב</th>
                <th className="text-right text-[13px] text-gray-500 font-medium pb-2">התקדמות</th>
                <th className="text-center text-[13px] text-gray-500 font-medium pb-2">רווחיות</th>
              </tr>
            </thead>
            <tbody>
              {activeProjects.map((project) => {
                const profit = getProfitColor(project.order_value);
                return (
                  <tr key={project.id} onClick={() => router.push(`/projects/${project.id}`)} className="border-b border-gray-50 hover:bg-gray-50 transition-colors cursor-pointer">
                    <td className="py-2.5 pr-2">
                      <p className="text-sm font-semibold text-gray-800">{project.name}</p>
                      <p className="text-[12px] text-gray-400">{project.assigned_to || '—'}</p>
                    </td>
                    <td className="py-2.5">
                      <span className="text-sm font-medium text-gray-700">
                        {formatCurrency(project.order_value)}
                      </span>
                    </td>
                    <td className="py-2.5">
                      <span className="text-[13px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                        {project.stage_label || `שלב ${project.current_stage}`}
                      </span>
                    </td>
                    <td className="py-2.5 min-w-[100px]">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-[#1a56db] rounded-full transition-all duration-500"
                            style={{ width: `${project.progress_percent}%` }}
                          />
                        </div>
                        <span className="text-[12px] text-gray-500 w-7 text-left">
                          {project.progress_percent}%
                        </span>
                      </div>
                    </td>
                    <td className="py-2.5 text-center">
                      <span
                        className="inline-block w-3 h-3 rounded-full"
                        style={{ backgroundColor: profit.color }}
                        title={profit.label}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
