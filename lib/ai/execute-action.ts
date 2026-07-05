/**
 * Executes a Roxy pending_action AFTER the user explicitly confirmed it.
 *
 * Chain of defenses (in order):
 *   1. validateWrite — table + every column against the write-allowlist
 *   2. The write runs with the user's own Supabase client — RLS applies
 *   3. Success/failure recorded in ai_activity_log (updates keep
 *      previous_values so the dashboard undo works)
 *
 * Deletes are structurally impossible — only insert/update exist here.
 */
import { validateWrite, rejectionMessage, logRejection } from '@/lib/ai/write-allowlist';
import { logAiAction } from '@/lib/ai/activity-log';
import type { PendingAction } from '@/lib/ai/roxy-tools';

export interface ExecuteResult {
  ok: boolean;
  /** Hebrew, user-facing */
  message: string;
}

export async function executePendingAction(
  supabase: any,
  action: PendingAction,
  originalCommand: string,
): Promise<ExecuteResult> {
  const v = validateWrite(action.table, action.data);
  if (!v.ok) {
    await logRejection(supabase, {
      command: originalCommand,
      action: action.operation === 'update' ? 'update' : 'create',
      validation: v,
      targetLabel: action.label,
      data: action.data,
      sourceType: 'chat',
    });
    return { ok: false, message: rejectionMessage(v) };
  }

  try {
    if (action.operation === 'update') {
      if (!action.target_id) return { ok: false, message: 'חסר מזהה רשומה לעדכון.' };

      // Snapshot previous values of exactly the columns we're changing (undo).
      const cols = Object.keys(action.data).join(', ');
      const { data: prev } = await supabase.from(action.table)
        .select(cols).eq('id', action.target_id).maybeSingle();

      const { error } = await supabase.from(action.table)
        .update(action.data).eq('id', action.target_id);
      if (error) throw error;

      await logAiAction(supabase, {
        command: originalCommand,
        actionType: 'update',
        targetTable: action.table,
        targetId: action.target_id,
        targetLabel: action.label,
        summary: action.summary || `עודכנה רשומה ב-${action.table}`,
        changes: action.data,
        previous: prev || null,
      });
      return { ok: true, message: `בוצע — ${action.summary || 'הרשומה עודכנה'}.` };
    }

    // insert
    const { data: inserted, error } = await supabase.from(action.table)
      .insert(action.data).select('id').single();
    if (error) throw error;

    await logAiAction(supabase, {
      command: originalCommand,
      actionType: 'create',
      targetTable: action.table,
      targetId: inserted?.id || null,
      targetLabel: action.label,
      summary: action.summary || `נוצרה רשומה ב-${action.table}`,
      changes: action.data,
    });
    return { ok: true, message: `בוצע — ${action.summary || 'הרשומה נוצרה'}.` };
  } catch (e: any) {
    const msg = e?.message || 'שגיאה לא ידועה';
    await logAiAction(supabase, {
      command: originalCommand,
      actionType: action.operation === 'update' ? 'update' : 'create',
      targetTable: action.table,
      targetLabel: action.label,
      summary: `הפעולה נכשלה: ${msg}`,
      changes: action.data,
      status: 'failed',
    });
    // RLS denial reads as a permission problem — explain it that way.
    if (/row-level security|permission|policy/i.test(msg)) {
      return { ok: false, message: 'אין לך הרשאה לבצע את הפעולה הזו. בקש מאדמין הרשאת עריכה למודול המתאים (הגדרות ← משתמשים), או פנה למי שמחזיק בהרשאה.' };
    }
    return { ok: false, message: `לא הצלחתי לבצע: ${msg}` };
  }
}
