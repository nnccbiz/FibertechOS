'use client';

import { useState, useTransition } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  APP_MODULES,
  MODULE_LABELS_HE,
  MODULE_ICONS,
  PERMISSION_LEVELS,
  LEVEL_LABELS_HE,
  type AppModule,
  type PermissionLevel,
} from '@/lib/auth/permissions';

type Member = {
  id: string;
  name: string;
  role: string;
  email: string | null;
  phone: string | null;
  access_level: string;
  active: boolean;
  created_at: string;
};

type Perm = { user_id: string; module: string; level: string };

export default function UserPermissionsEditor({
  initialMembers,
  initialPermissions,
}: {
  initialMembers: Member[];
  initialPermissions: Perm[];
}) {
  const [members, setMembers] = useState(initialMembers);
  const [perms, setPerms] = useState<Perm[]>(initialPermissions);
  const [openId, setOpenId] = useState<string | null>(null);
  const [saving, startTransition] = useTransition();
  const [status, setStatus] = useState<string | null>(null);

  function getPerm(userId: string, module: AppModule): PermissionLevel {
    const p = perms.find((x) => x.user_id === userId && x.module === module);
    return (p?.level as PermissionLevel) || 'none';
  }

  function setPerm(userId: string, module: AppModule, level: PermissionLevel) {
    setPerms((ps) => {
      const idx = ps.findIndex((x) => x.user_id === userId && x.module === module);
      const updated = { user_id: userId, module, level };
      if (idx === -1) return [...ps, updated];
      const copy = [...ps];
      copy[idx] = updated;
      return copy;
    });
  }

  async function saveMember(member: Member) {
    setStatus(null);
    startTransition(async () => {
      const supabase = createClient();
      const rows = APP_MODULES.map((m) => ({
        user_id: member.id,
        module: m,
        level: getPerm(member.id, m),
      }));
      const { error } = await supabase
        .from('user_module_permissions')
        .upsert(rows, { onConflict: 'user_id,module' });
      if (error) {
        setStatus('שגיאה בשמירה: ' + error.message);
        return;
      }
      setStatus(`נשמר בהצלחה עבור ${member.name}`);
      setTimeout(() => setStatus(null), 3000);
    });
  }

  async function toggleActive(member: Member) {
    startTransition(async () => {
      const supabase = createClient();
      const { error } = await supabase
        .from('team_members')
        .update({ active: !member.active })
        .eq('id', member.id);
      if (!error) {
        setMembers((ms) =>
          ms.map((m) => (m.id === member.id ? { ...m, active: !m.active } : m))
        );
      }
    });
  }

  return (
    <div className="space-y-3">
      {status && (
        <div className="bg-green-50 border border-green-200 text-green-800 text-sm rounded-lg px-3 py-2">
          {status}
        </div>
      )}

      {members.map((m) => {
        const isOpen = openId === m.id;
        return (
          <div
            key={m.id}
            className={`bg-white rounded-xl border ${m.active ? 'border-[#e2e8f0]' : 'border-gray-300 opacity-75'}`}
          >
            <button
              onClick={() => setOpenId(isOpen ? null : m.id)}
              className="w-full flex items-center justify-between p-4 text-right hover:bg-gray-50 transition-colors"
            >
              <div>
                <div className="font-semibold text-gray-800">
                  {m.name}
                  {!m.active && (
                    <span className="mr-2 text-[11px] bg-gray-200 text-gray-700 rounded px-1.5 py-0.5">
                      לא פעיל
                    </span>
                  )}
                  <span className={`mr-2 text-[11px] rounded px-1.5 py-0.5 ${
                    m.access_level === 'admin' ? 'bg-blue-100 text-blue-700' :
                    m.access_level === 'member' ? 'bg-gray-100 text-gray-700' :
                    'bg-amber-100 text-amber-700'
                  }`}>
                    {m.access_level}
                  </span>
                </div>
                <div className="text-[13px] text-gray-500" dir="ltr">
                  {m.email || 'אין מייל'} · {m.role}
                </div>
              </div>
              <span className="text-gray-400">{isOpen ? '▼' : '◀'}</span>
            </button>

            {isOpen && (
              <div className="border-t border-[#e2e8f0] bg-gray-50/60 p-4 space-y-4">
                <div>
                  <div className="text-sm font-medium text-gray-700 mb-2">
                    הרשאה לכל מודול
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {APP_MODULES.map((mod) => (
                      <div key={mod} className="flex items-center justify-between bg-white rounded-lg border border-[#e2e8f0] px-3 py-2">
                        <div className="text-sm">
                          <span className="ml-2">{MODULE_ICONS[mod]}</span>
                          {MODULE_LABELS_HE[mod]}
                        </div>
                        <select
                          value={getPerm(m.id, mod)}
                          onChange={(e) => setPerm(m.id, mod, e.target.value as PermissionLevel)}
                          disabled={m.access_level === 'admin'}
                          title={m.access_level === 'admin' ? 'Admin רואה את הכל ממילא' : undefined}
                          className="text-[13px] border border-[#e2e8f0] rounded px-2 py-1 disabled:bg-gray-100"
                        >
                          {PERMISSION_LEVELS.map((lvl) => (
                            <option key={lvl} value={lvl}>
                              {LEVEL_LABELS_HE[lvl]}
                            </option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 pt-2 border-t border-[#e2e8f0]">
                  <button
                    onClick={() => saveMember(m)}
                    disabled={saving || m.access_level === 'admin'}
                    className="bg-[#1a56db] text-white font-medium px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
                  >
                    {saving ? 'שומר...' : 'שמור'}
                  </button>
                  <button
                    onClick={() => toggleActive(m)}
                    disabled={saving}
                    className={`font-medium px-4 py-2 rounded-lg disabled:opacity-50 ${
                      m.active
                        ? 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                        : 'bg-green-100 text-green-700 hover:bg-green-200'
                    }`}
                  >
                    {m.active ? '🚫 השבת משתמש' : '✓ הפעל מחדש'}
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
