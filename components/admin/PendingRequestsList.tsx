'use client';

import { useState, useTransition } from 'react';
import { APP_MODULES, MODULE_LABELS_HE, MODULE_ICONS, PERMISSION_LEVELS, LEVEL_LABELS_HE, type AppModule, type PermissionLevel } from '@/lib/auth/permissions';

type Request = {
  id: string;
  email: string;
  full_name: string;
  requested_role: string;
  phone: string | null;
  created_at: string;
  ip_address: string | null;
  user_agent: string | null;
  email_already_on_team: boolean;
};

const DEFAULT_PERMISSIONS: Record<AppModule, PermissionLevel> = {
  dashboard: 'view',
  projects: 'view',
  marketing: 'none',
  import: 'none',
  field: 'none',
  inventory: 'view',
  reports: 'view',
  settings: 'none',
};

export default function PendingRequestsList({ initial }: { initial: Request[] }) {
  const [requests, setRequests] = useState<Request[]>(initial);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!requests.length) {
    return (
      <div className="bg-white rounded-xl border border-[#e2e8f0] p-10 text-center text-gray-500">
        אין בקשות ממתינות לאישור כרגע.
      </div>
    );
  }

  async function approve(req: Request, accessLevel: 'admin' | 'member' | 'viewer', permissions: Record<string, string>, notes: string) {
    setError(null);
    startTransition(async () => {
      const res = await fetch('/api/approve-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          request_id: req.id,
          decision: 'approve',
          access_level: accessLevel,
          permissions,
          notes,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.detail || body.error || 'שגיאה בשליחת האישור');
        return;
      }
      setRequests((rs) => rs.filter((r) => r.id !== req.id));
    });
  }

  async function decline(req: Request, kind: 'decline_suspicious' | 'decline_not_authorized', notes: string) {
    setError(null);
    startTransition(async () => {
      const res = await fetch('/api/approve-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ request_id: req.id, decision: kind, notes }),
      });
      if (!res.ok) {
        setError('שגיאה בדחיית הבקשה');
        return;
      }
      setRequests((rs) => rs.filter((r) => r.id !== req.id));
    });
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      {requests.map((r) => {
        const isOpen = expanded === r.id;
        return (
          <div key={r.id} className="bg-white rounded-xl border border-[#e2e8f0] overflow-hidden">
            <button
              onClick={() => setExpanded(isOpen ? null : r.id)}
              className="w-full flex items-center justify-between p-4 text-right hover:bg-gray-50 transition-colors"
            >
              <div>
                <div className="font-semibold text-gray-800">
                  {r.full_name}
                  {r.email_already_on_team && (
                    <span className="mr-2 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
                      ⚠️ המייל כבר קיים בצוות
                    </span>
                  )}
                </div>
                <div className="text-[13px] text-gray-500" dir="ltr">
                  {r.email} · {r.requested_role}
                </div>
                <div className="text-[11px] text-gray-400 mt-0.5">
                  {new Date(r.created_at).toLocaleString('he-IL')} · IP: {r.ip_address || '—'}
                </div>
              </div>
              <span className="text-gray-400">{isOpen ? '▼' : '◀'}</span>
            </button>

            {isOpen && (
              <ApprovalForm
                request={r}
                onApprove={approve}
                onDecline={decline}
                pending={pending}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function ApprovalForm({
  request,
  onApprove,
  onDecline,
  pending,
}: {
  request: Request;
  onApprove: (r: Request, level: 'admin' | 'member' | 'viewer', perms: Record<string, string>, notes: string) => void;
  onDecline: (r: Request, kind: 'decline_suspicious' | 'decline_not_authorized', notes: string) => void;
  pending: boolean;
}) {
  const [accessLevel, setAccessLevel] = useState<'admin' | 'member' | 'viewer'>('member');
  const [perms, setPerms] = useState<Record<AppModule, PermissionLevel>>({ ...DEFAULT_PERMISSIONS });
  const [notes, setNotes] = useState('');

  function applyPreset(kind: 'viewer' | 'member' | 'admin') {
    setAccessLevel(kind);
    if (kind === 'admin') {
      setPerms(APP_MODULES.reduce((acc, m) => ({ ...acc, [m]: 'full' as PermissionLevel }), {} as Record<AppModule, PermissionLevel>));
    } else if (kind === 'viewer') {
      setPerms(APP_MODULES.reduce((acc, m) => ({ ...acc, [m]: m === 'inventory' ? 'view' as PermissionLevel : 'none' as PermissionLevel }), {} as Record<AppModule, PermissionLevel>));
    } else {
      setPerms({ ...DEFAULT_PERMISSIONS });
    }
  }

  return (
    <div className="border-t border-[#e2e8f0] bg-gray-50/60 p-4 space-y-4">
      <div>
        <div className="text-sm font-medium text-gray-700 mb-2">תבנית מהירה</div>
        <div className="flex gap-2 mb-4">
          <button onClick={() => applyPreset('admin')}  className="text-[13px] bg-white border border-gray-300 px-3 py-1.5 rounded-lg hover:bg-gray-100">Admin</button>
          <button onClick={() => applyPreset('member')} className="text-[13px] bg-white border border-gray-300 px-3 py-1.5 rounded-lg hover:bg-gray-100">Member (ברירת מחדל)</button>
          <button onClick={() => applyPreset('viewer')} className="text-[13px] bg-white border border-gray-300 px-3 py-1.5 rounded-lg hover:bg-gray-100">Viewer</button>
        </div>
      </div>

      <div>
        <div className="text-sm font-medium text-gray-700 mb-2">הרשאה לכל מודול</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {APP_MODULES.map((m) => (
            <div key={m} className="flex items-center justify-between bg-white rounded-lg border border-[#e2e8f0] px-3 py-2">
              <div className="text-sm">
                <span className="ml-2">{MODULE_ICONS[m]}</span>
                {MODULE_LABELS_HE[m]}
              </div>
              <select
                value={perms[m]}
                onChange={(e) => setPerms({ ...perms, [m]: e.target.value as PermissionLevel })}
                className="text-[13px] border border-[#e2e8f0] rounded px-2 py-1"
              >
                {PERMISSION_LEVELS.map((lvl) => (
                  <option key={lvl} value={lvl}>{LEVEL_LABELS_HE[lvl]}</option>
                ))}
              </select>
            </div>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">הערות (אופציונלי)</label>
        <input
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="w-full border border-[#e2e8f0] rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#1a56db]/30"
        />
      </div>

      <div className="flex flex-wrap gap-2 pt-2 border-t border-[#e2e8f0]">
        <button
          onClick={() => onApprove(request, accessLevel, perms, notes)}
          disabled={pending}
          className="bg-green-600 text-white font-medium px-4 py-2 rounded-lg hover:bg-green-700 disabled:opacity-50"
        >
          ✓ אשר ושלח לינק לקביעת סיסמה
        </button>
        <button
          onClick={() => onDecline(request, 'decline_suspicious', notes)}
          disabled={pending}
          className="bg-gray-200 text-gray-700 font-medium px-4 py-2 rounded-lg hover:bg-gray-300 disabled:opacity-50"
          title="לא מכיר / בקשה חשודה - לא חוסם את המייל"
        >
          דחה - בקשה חשודה
        </button>
        <button
          onClick={() => onDecline(request, 'decline_not_authorized', notes)}
          disabled={pending}
          className="bg-red-100 text-red-700 font-medium px-4 py-2 rounded-lg hover:bg-red-200 disabled:opacity-50"
          title="אוסר על מייל זה להגיש בקשה חדשה ל-30 יום"
        >
          דחה - עובד לא מורשה (חוסם 30 יום)
        </button>
      </div>
    </div>
  );
}
