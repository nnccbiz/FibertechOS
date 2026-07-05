/**
 * Write allowlist for Roxy (the AI assistant).
 *
 * Roxy's output is UNTRUSTED — the model is steered by free-text user input and
 * by the contents of uploaded documents (a classic indirect prompt-injection
 * surface). Before any model-driven insert/update reaches Supabase, the target
 * table and every column must be validated against this allowlist.
 *
 * Policy: REJECT (not silent-strip). If the table is not allowed, or any column
 * is not in the table's allowlist, the whole write is refused and the attempt is
 * logged. We never auto-"repair" the model's output.
 *
 * Column lists are derived from the ACTUAL database schema (migrations), not from
 * the system prompt — the two had drifted apart.
 */

// 'id' is always permitted: on update it is the row selector, never a written value.
const ALWAYS_ALLOWED = new Set(['id']);

export const WRITE_ALLOWLIST: Record<string, Set<string>> = {
  // Columns verified against the LIVE database schema (2026-07-05). The
  // previous lists for projects/alerts/leads had drifted from reality and
  // rejected (or silently failed) every write.
  projects: new Set([
    'name', 'description', 'current_stage', 'stage_label', 'progress_percent',
    'priority', 'order_value', 'status', 'city', 'supplier', 'notes',
    'serial_number', 'developer_name', 'planning_office',
    'probability_percent', 'realization_status', 'delivery_months',
    'order_execution_date',
  ]),
  project_details: new Set([
    'project_id', 'form_number', 'project_number', 'location', 'description',
    'order_received_date', 'approved_order_date', 'pipe_installation_start',
    'ordering_entity', 'responsible_party', 'project_type', 'installation_type',
    'special_requirements', 'field_supervision', 'soil_type', 'push_depth',
    'manhole_type', 'connection_method', 'project_status',
    'tender_submission_date', 'winning_contractor', 'winning_date',
    'expected_pipe_order_date', 'project_story', 'competitors',
    'assessments', 'politics',
  ]),
  project_contacts: new Set([
    'project_id', 'role', 'name', 'phone', 'email',
  ]),
  pipe_specs: new Set([
    'project_id', 'diameter_mm', 'line_length_m', 'unit_length_m',
    'stiffness_pascal', 'pressure_bar', 'notes',
  ]),
  alerts: new Set([
    'project_id', 'type', 'message', 'is_resolved', 'assigned_to',
  ]),
  leads: new Set([
    'project_name', 'developer_name', 'planner_name', 'stage',
    'estimated_value', 'assigned_to', 'next_action', 'next_action_date',
    'notes',
  ]),
  inventory: new Set([
    'manufacturer', 'pipe_type', 'diameter_mm', 'pressure_bar',
    'stiffness_sn', 'length_m', 'in_stock', 'category', 'notes',
  ]),
  project_updates: new Set([
    'project_id', 'update_date', 'people', 'title', 'description', 'tasks',
    'created_by',
  ]),
  cost_input_items: new Set([
    'cost_input_id', 'product_name', 'dn_size', 'quantity', 'unit',
    'cost_price', 'total_cost', 'notes', 'sort_order',
  ]),
  suppliers: new Set([
    'name', 'contact_name', 'currency', 'active',
  ]),
  supplier_quotes: new Set([
    'supplier_id', 'quote_ref', 'quote_date', 'project_name', 'currency',
    'raw_text',
  ]),
  supplier_quote_items: new Set([
    'quote_id', 'item_type', 'dn', 'sn', 'pn', 'length_m', 'unit_price',
    'price_per', 'currency', 'description',
  ]),
};

export type RejectReason = 'table_not_allowed' | 'columns_not_allowed' | 'empty';

export interface WriteValidation {
  ok: boolean;
  table: string;
  rejectedColumns: string[];
  reason?: RejectReason;
}

/**
 * Validate a single insert/update payload against the allowlist.
 * Rejects if the table is unknown, if any column is outside the table's
 * allowlist, or if there is nothing to write.
 */
export function validateWrite(
  table: string | undefined,
  data: Record<string, any> | undefined,
): WriteValidation {
  const t = (table || '').trim();
  const allowed = WRITE_ALLOWLIST[t];

  if (!allowed) {
    return { ok: false, table: t || 'unknown', rejectedColumns: [], reason: 'table_not_allowed' };
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { ok: false, table: t, rejectedColumns: [], reason: 'empty' };
  }

  const keys = Object.keys(data);
  const rejectedColumns = keys.filter((k) => !allowed.has(k) && !ALWAYS_ALLOWED.has(k));
  if (rejectedColumns.length > 0) {
    return { ok: false, table: t, rejectedColumns, reason: 'columns_not_allowed' };
  }

  const writableKeys = keys.filter((k) => !ALWAYS_ALLOWED.has(k));
  if (writableKeys.length === 0) {
    return { ok: false, table: t, rejectedColumns: [], reason: 'empty' };
  }

  return { ok: true, table: t, rejectedColumns: [] };
}

/** Human-readable Hebrew message describing why a write was rejected. */
export function rejectionMessage(v: WriteValidation): string {
  switch (v.reason) {
    case 'table_not_allowed':
      return `🚫 הפעולה נדחתה: הטבלה "${v.table}" אינה מורשית לכתיבה דרך רקסי.`;
    case 'columns_not_allowed':
      return `🚫 הפעולה נדחתה: עמודות לא מורשות בטבלה "${v.table}" — ${v.rejectedColumns.join(', ')}.`;
    case 'empty':
      return `🚫 הפעולה נדחתה: אין נתונים תקפים לכתיבה בטבלה "${v.table}".`;
    default:
      return `🚫 הפעולה נדחתה.`;
  }
}

/**
 * Log a rejected write attempt to ai_activity_log. Best-effort — a logging
 * failure must not surface as the user-facing error.
 *
 * Note: ai_activity_log.status has a CHECK constraint of
 * ('applied','reverted','failed') with no 'rejected' value, so rejections are
 * recorded as 'failed' with the rejection detail in the summary.
 */
export async function logRejection(
  supabase: any,
  params: {
    command: string;
    action: string;
    validation: WriteValidation;
    targetLabel?: string;
    data?: any;
    sourceType?: 'command' | 'document' | 'chat';
  },
): Promise<void> {
  const { command, action, validation, targetLabel, data, sourceType } = params;
  const actionType = ['create', 'update', 'delete', 'import', 'generate'].includes(action)
    ? action
    : 'create';
  try {
    // RLS requires owner-stamped rows (migration 20260705_001) — and we want
    // rejected attempts attributed to the user who triggered them.
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from('ai_activity_log').insert({
      user_id: user.id,
      user_name: user.user_metadata?.full_name || user.email || '',
      command_text: command || '(ריק)',
      action_type: actionType,
      target_table: validation.table,
      target_label: targetLabel || '',
      changes_applied: data || {},
      source_type: sourceType || 'command',
      summary: rejectionMessage(validation),
      status: 'failed',
    });
  } catch {
    // best-effort
  }
}
