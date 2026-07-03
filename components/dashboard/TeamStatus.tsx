'use client';

interface TeamMember {
  id: string;
  name: string;
  role: string;
  email: string;
  access_level: string;
}

interface TeamStatusProps {
  members: TeamMember[];
  loading: boolean;
}

const roleColors: Record<string, string> = {
  admin: '#15427e',
  manager: '#1a73b8',
  field: '#1e8a5a',
  logistics: '#c9821a',
  sales: '#c0392b',
};

function getRoleColor(role: string) {
  return roleColors[role?.toLowerCase()] || '#6d6e71';
}

export default function TeamStatus({ members, loading }: TeamStatusProps) {
  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-line-subtle p-5">
        <div className="skeleton h-5 w-28 mb-4" />
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="skeleton h-10 w-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-line-subtle p-5">
      <h3 className="text-lg font-bold text-content-body mb-3">👥 סטטוס הצוות</h3>
      {members.length === 0 ? (
        <p className="text-lg text-neutral-400 text-center py-3">אין חברי צוות</p>
      ) : (
        <div className="space-y-2">
          {[...members]
            .sort((a, b) => {
              if (a.name === 'אשר') return -1;
              if (b.name === 'אשר') return 1;
              return 0;
            })
            .map((member) => {
            const color = getRoleColor(member.role);
            const initials = member.name
              .split(' ')
              .map((n) => n[0])
              .join('')
              .slice(0, 2);
            return (
              <div key={member.id} className="flex items-center gap-2.5 py-1.5">
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[12px] font-bold flex-shrink-0"
                  style={{ backgroundColor: color }}
                >
                  {initials}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-content-body truncate">{member.name}</p>
                </div>
                <div className="w-2 h-2 rounded-full bg-success flex-shrink-0" title="מחובר" />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
