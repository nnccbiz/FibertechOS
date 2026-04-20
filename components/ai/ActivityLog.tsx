'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

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

const actionIcons: Record<string, string> = {
  create: '➕',
  update: '✏️',
  delete: '🗑️',
  import: '📄',
  generate: '📝',
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
      <div className="bg-white rounded-xl border border-[#e2e8f0] p-5">
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
    <div className="bg-white rounded-xl border border-[#e2e8f0] p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-bold text-gray-700">✨ פעולות AI אחרונות</h3>
        {entries.length > 0 && (
          <span className="text-[12px] text-gray-400">{entries.length} פעולות</span>
        )}
      </div>

      {entries.length === 0 ? (
        <div className="text-center py-4">
          <p className="text-lg text-gray-400">אין פעולות עדיין</p>
          <p className="text-[12px] text-gray-300 mt-1">לחץ ⌘K להפעלת רקסי</p>
        </div>
      ) : (
        <div className="space-y-2 max-h-[300px] overflow-y-auto">
          {entries.map((entry) => (
            <div
              key={entry.id}
              className={`rounded-lg p-2.5 border transition-colors ${
                entry.status === 'reverted'
                  ? 'bg-gray-50 border-gray-200 opacity-50'
                  : 'bg-blue-50/50 border-blue-100'
              }`}
            >
              <div className="flex items-start gap-2">
                <span className="text-lg mt-0.5">
                  {actionIcons[entry.action_type] || '⚡'}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-700">{entry.summary}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[12px] text-gray-400">
                      {timeAgo(entry.created_at)}
                    </span>
                    <span className="text-[12px] text-gray-300">•</span>
                    <span className="text-[12px] text-gray-400">
                      {sourceLabels[entry.source_type] || entry.source_type}
                    </span>
                    {entry.fields_count > 0 && (
                      <>
                        <span className="text-[12px] text-gray-300">•</span>
                        <span className="text-[12px] text-gray-400">
                          {entry.fields_count} שדות
                        </span>
                      </>
                    )}
                  </div>
                </div>
                {entry.status === 'applied' && entry.previous_values && (
                  <button
                    onClick={() => handleUndo(entry)}
                    className="text-[12px] text-red-400 hover:text-red-600 bg-white px-2 py-1 rounded border border-red-200 hover:border-red-300 transition-colors flex-shrink-0"
                  >
                    ביטול
                  </button>
                )}
                {entry.status === 'reverted' && (
                  <span className="text-[12px] text-gray-400 flex-shrink-0">בוטל</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
