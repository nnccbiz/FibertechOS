'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import Icon, { type IconName } from '@/components/ui/Icon';

interface LogEntry {
  id: string;
  command_text: string;
  action_type: string;
  target_table: string;
  target_id: string | null;
  target_label: string;
  changes_applied: any;
  previous_values: any;
  source_type: string;
  source_file_name: string | null;
  summary: string;
  fields_count: number;
  status: string;
  created_at: string;
}

interface ActivityLogProps {
  refreshTrigger?: number;
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

const actionIcons: Record<string, IconName> = {
  create: 'add',
  update: 'edit',
  delete: 'delete',
  import: 'file',
  generate: 'note',
};

const sourceLabels: Record<string, string> = {
  command: 'פקודה',
  document: 'מסמך',
  chat: 'שיחה',
};

export default function ActivityLog({ refreshTrigger }: ActivityLogProps) {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  async function fetchLog() {
    const supabase = createClient();
    try {
      const { data, error } = await supabase
        .from('ai_activity_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      setEntries(data || []);
    } catch {
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchLog();
  }, [refreshTrigger]);

  async function handleUndo(entry: LogEntry) {
    if (!entry.previous_values || !entry.target_id) return;
    const supabase = createClient();

    try {
      // Restore previous values
      const { error } = await supabase
        .from(entry.target_table)
        .update(entry.previous_values)
        .eq('id', entry.target_id);

      if (error) throw error;

      // Mark as reverted
      await supabase
        .from('ai_activity_log')
        .update({ status: 'reverted', reverted_at: new Date().toISOString() })
        .eq('id', entry.id);

      // Refresh log
      fetchLog();
    } catch (err) {
      console.error('Undo failed:', err);
    }
  }

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-line-subtle p-5">
        <div className="skeleton h-5 w-36 mb-4" />
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="skeleton h-12 w-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-line-subtle p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-bold text-content-body"><Icon name="ai" size={20} /> פעולות AI אחרונות</h3>
        {entries.length > 0 && (
          <span className="text-[12px] text-neutral-400">{entries.length} פעולות</span>
        )}
      </div>

      {entries.length === 0 ? (
        <div className="text-center py-4">
          <p className="text-lg text-neutral-400">אין פעולות עדיין</p>
          <p className="text-[12px] text-neutral-300 mt-1">לחץ ⌘K להפעלת רקסי</p>
        </div>
      ) : (
        <div className="space-y-2 max-h-[300px] overflow-y-auto">
          {entries.map((entry) => (
            <div
              key={entry.id}
              className={`rounded-lg p-2.5 border transition-colors ${
                entry.status === 'reverted'
                  ? 'bg-neutral-50 border-line-subtle opacity-50'
                  : 'bg-azure-100 border-azure'
              }`}
            >
              <div className="flex items-start gap-2">
                <span className="mt-0.5 text-primary">
                  <Icon name={actionIcons[entry.action_type] || 'zap'} size={18} />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-content-body">{entry.summary}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[12px] text-neutral-400">
                      {timeAgo(entry.created_at)}
                    </span>
                    <span className="text-[12px] text-neutral-300">•</span>
                    <span className="text-[12px] text-neutral-400">
                      {sourceLabels[entry.source_type] || entry.source_type}
                    </span>
                    {entry.fields_count > 0 && (
                      <>
                        <span className="text-[12px] text-neutral-300">•</span>
                        <span className="text-[12px] text-neutral-400">
                          {entry.fields_count} שדות
                        </span>
                      </>
                    )}
                  </div>
                </div>
                {entry.status === 'applied' && entry.previous_values && (
                  <button
                    onClick={() => handleUndo(entry)}
                    className="text-[12px] text-danger hover:text-danger bg-white px-2 py-1 rounded border border-danger hover:border-danger transition-colors flex-shrink-0"
                  >
                    ביטול
                  </button>
                )}
                {entry.status === 'reverted' && (
                  <span className="text-[12px] text-neutral-400 flex-shrink-0">בוטל</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
