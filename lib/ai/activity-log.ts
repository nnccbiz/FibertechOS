/**
 * AI activity logging — every action Roxy performs (or is refused) is recorded
 * in ai_activity_log, stamped with the acting user. This powers the dashboard
 * "פעולות AI אחרונות" widget and the undo flow.
 *
 * RLS (migration 20260705_001): owner-stamped INSERT only, SELECT/UPDATE for
 * owner or admin. Logging is best-effort — a log failure must never break the
 * user-facing action — but unlike before, failures are console-visible.
 */

export type AiActionType = 'create' | 'update' | 'delete' | 'import' | 'generate';
export type AiSourceType = 'command' | 'document' | 'chat';

export interface AiLogParams {
  /** The user's original free-text command */
  command: string;
  actionType: AiActionType;
  targetTable: string;
  targetId?: string | null;
  targetLabel?: string;
  /** Human-readable Hebrew summary of what happened */
  summary: string;
  /** The fields that were written */
  changes?: Record<string, any> | Record<string, any>[];
  /** Pre-change values (enables undo for updates) */
  previous?: Record<string, any> | null;
  sourceType?: AiSourceType;
  fieldsCount?: number;
  status?: 'applied' | 'failed';
}

export async function logAiAction(supabase: any, p: AiLogParams): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase.from('ai_activity_log').insert({
      user_id: user.id,
      user_name: user.user_metadata?.full_name || user.email || '',
      command_text: p.command || '(ריק)',
      action_type: p.actionType,
      target_table: p.targetTable,
      target_id: p.targetId || null,
      target_label: p.targetLabel || '',
      changes_applied: p.changes ?? {},
      previous_values: p.previous ?? null,
      source_type: p.sourceType || 'chat',
      summary: p.summary,
      fields_count: p.fieldsCount ?? (p.changes && !Array.isArray(p.changes) ? Object.keys(p.changes).length : 0),
      status: p.status || 'applied',
    });
    if (error) console.error('[ai-log] insert failed:', error.message);
  } catch (e: any) {
    console.error('[ai-log]', e?.message || e);
  }
}
