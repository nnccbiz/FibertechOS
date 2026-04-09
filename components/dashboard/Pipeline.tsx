'use client';

interface Lead {
  id: string;
  project_name: string;
  developer_name: string;
  stage: string;
  estimated_value: number;
  next_action: string | null;
  next_action_date: string | null;
}

interface PipelineProps {
  leads: Lead[];
  loading: boolean;
}

const stages = [
  { key: 'הכרות', label: 'הכרות', color: '#94a3b8' },
  { key: 'מסמכים', label: 'מסמכים', color: '#3b82f6' },
  { key: 'מכרז', label: 'מכרז', color: '#f59e0b' },
  { key: 'מו"מ', label: 'מו"מ', color: '#22c55e' },
];

function formatValue(value: number) {
  if (value >= 1000000) return `₪${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `₪${(value / 1000).toFixed(0)}K`;
  return `₪${value}`;
}

export default function Pipeline({ leads, loading }: PipelineProps) {
  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-[#e2e8f0] p-5">
        <div className="skeleton h-5 w-32 mb-4" />
        <div className="grid grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="skeleton h-32 w-full" />
          ))}
        </div>
      </div>
    );
  }

  const grouped = stages.map((stage) => ({
    ...stage,
    leads: leads.filter((l) => l.stage === stage.key),
  }));

  return (
    <div className="bg-white rounded-xl border border-[#e2e8f0] p-5">
      <h3 className="text-lg font-bold text-gray-700 mb-4">📊 צינור שיווקי</h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {grouped.map((stage) => (
          <div key={stage.key} className="rounded-lg bg-gray-50 p-3">
            <div className="flex items-center gap-1.5 mb-2">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: stage.color }} />
              <span className="text-[13px] font-bold text-gray-600">{stage.label}</span>
              <span className="text-[12px] text-gray-400 mr-auto">{stage.leads.length}</span>
            </div>
            <div className="space-y-1.5">
              {stage.leads.length === 0 ? (
                <p className="text-[12px] text-gray-300 text-center py-2">ריק</p>
              ) : (
                stage.leads.map((lead) => (
                  <div
                    key={lead.id}
                    className="bg-white rounded-md p-2 border border-gray-100 shadow-sm"
                  >
                    <p className="text-[13px] font-semibold text-gray-700 truncate">
                      {lead.project_name}
                    </p>
                    <p className="text-[12px] text-gray-400 truncate">{lead.developer_name}</p>
                    <p className="text-[12px] font-bold text-[#1a56db] mt-1">
                      {formatValue(lead.estimated_value)}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
