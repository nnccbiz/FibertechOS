/**
 * Roxy's server-side tool belt.
 *
 * Every read tool runs with the USER's Supabase client — RLS enforces exactly
 * what that user may see (a production-only user won't get quote totals, etc.).
 * The write tool (propose_action) never executes anything: it validates the
 * proposal against the write-allowlist and hands it back to the client, where
 * the user must explicitly confirm before execution.
 *
 * Import tables (import_orders, shipments, invoices…) are deliberately NOT
 * exposed — standing policy: no financial import data through Roxy.
 */
import { SchemaType, type FunctionDeclaration } from '@google/generative-ai';
import { validateWrite, rejectionMessage } from '@/lib/ai/write-allowlist';

// ---------------------------------------------------------------------------
// Tool declarations (what Gemini sees)
// ---------------------------------------------------------------------------

export const ROXY_FUNCTION_DECLARATIONS: FunctionDeclaration[] = [
  {
    name: 'search_projects',
    description: 'חיפוש פרויקטים לפי שם / יזם / עיר / סטטוס. מחזיר רשימה תמציתית עם id לכל פרויקט.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        query: { type: SchemaType.STRING, description: 'טקסט חיפוש חופשי (שם פרויקט, יזם, עיר). ריק = כל הפרויקטים הפעילים' },
        limit: { type: SchemaType.NUMBER, description: 'מקסימום תוצאות (ברירת מחדל 10)' },
      },
    },
  },
  {
    name: 'get_project',
    description: 'פרטים מלאים על פרויקט אחד: פרטי פרויקט, אנשי קשר, מפרטי צנרת, עדכונים אחרונים והצעות מחיר. קבל project_id מ-search_projects, או העבר שם פרויקט.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        project_id: { type: SchemaType.STRING, description: 'ה-id של הפרויקט (עדיף)' },
        name: { type: SchemaType.STRING, description: 'שם הפרויקט או חלק ממנו (אם אין id)' },
      },
    },
  },
  {
    name: 'list_quotes',
    description: 'רשימת הצעות מחיר, אפשר לסנן לפי סטטוס או פרויקט. סטטוסים: draft (טיוטה), sent (נשלחה), signed (נחתמה), rejected (נדחתה), expired (פג תוקף).',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        status: { type: SchemaType.STRING, description: 'סינון לפי סטטוס (draft/sent/signed/rejected/expired). ריק = הכל' },
        project_name: { type: SchemaType.STRING, description: 'סינון לפי שם פרויקט' },
      },
    },
  },
  {
    name: 'list_tasks',
    description: 'רשימת משימות והתראות מלוח הבקרה. ברירת מחדל: פתוחות בלבד.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        include_resolved: { type: SchemaType.BOOLEAN, description: 'לכלול גם משימות שטופלו' },
        project_name: { type: SchemaType.STRING, description: 'סינון לפי שם פרויקט' },
      },
    },
  },
  {
    name: 'search_inventory',
    description: 'חיפוש ביתרות המלאי החי (נבנה מקליטות רכש ותעודות משלוח): צינורות, אביזרים וחומרי סיכה. אפשר לסנן לפי קוטר DN או קטגוריה.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        diameter_mm: { type: SchemaType.NUMBER, description: 'קוטר במ"מ (למשל 800)' },
        category: { type: SchemaType.STRING, description: 'צינורות / אביזרים / חומרי סיכה' },
        query: { type: SchemaType.STRING, description: 'טקסט חופשי (יצרן, סוג)' },
      },
    },
  },
  {
    // Gemini rejects OBJECT params with empty properties — zero-arg tools omit `parameters`.
    name: 'list_leads',
    description: 'רשימת לידים (פרויקטים פוטנציאליים בשלבי הכרות/מסמכים/מכרז/מו"מ).',
  },
  {
    name: 'list_customers',
    description: 'חיפוש לקוחות (חברות) — שם, עיר, טלפון, מייל.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        query: { type: SchemaType.STRING, description: 'שם לקוח או חלק ממנו. ריק = 20 האחרונים' },
      },
    },
  },
  {
    name: 'find_drawings',
    description: 'חיפוש שרטוטים ומפרטים לפי מספר שרטוט / שם פרויקט / מספר פרויקט.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        query: { type: SchemaType.STRING, description: 'מונח החיפוש' },
      },
    },
  },
  {
    name: 'dashboard_snapshot',
    description: 'תמונת מצב מהירה: כמה פרויקטים פעילים, הצעות פתוחות (וסכומן), משימות פתוחות ולידים.',
  },
  {
    name: 'list_team',
    description: 'רשימת חברי הצוות: שם, תפקיד, ורמת גישה. שימושי כדי לדעת מי אחראי על מה.',
  },
  {
    name: 'propose_action',
    description: `הצעת פעולת כתיבה (יצירה או עדכון) — הפעולה לא מבוצעת מיד אלא מוצגת למשתמש לאישור.
טבלאות מותרות: alerts (משימה חדשה או סימון כטופלה), project_updates (עדכון פרויקט), projects (עדכון שדות), project_details (עדכון פרטים), project_contacts (הוספת איש קשר), pipe_specs (הוספת מפרט), leads (ליד חדש/עדכון), inventory (עדכון מלאי).
מחיקות אסורות לחלוטין.
לעדכון (operation=update) חובה target_id — השג אותו קודם עם כלי קריאה.
עמודות מותרות לפי טבלה: alerts: project_id,type,message,is_resolved · project_updates: project_id,update_date,people,title,description,tasks · projects: name,description,current_stage,stage_label,progress_percent,priority,order_value,status,city,supplier,notes,developer_name,planning_office,probability_percent · project_details: location,description,project_status,project_type,installation_type,winning_contractor,tender_submission_date,expected_pipe_order_date,special_requirements · project_contacts: project_id,role,name,phone,email · pipe_specs: project_id,diameter_mm,line_length_m,unit_length_m,stiffness_pascal,pressure_bar,notes · leads: project_name,developer_name,planner_name,stage,estimated_value,next_action,next_action_date,notes · inventory: manufacturer,pipe_type,diameter_mm,pressure_bar,stiffness_sn,length_m,in_stock,category,notes`,
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        operation: { type: SchemaType.STRING, description: 'insert או update (אין delete!)' },
        table: { type: SchemaType.STRING, description: 'שם הטבלה' },
        data: {
          type: SchemaType.STRING,
          description: 'מחרוזת JSON של השדות לכתיבה, למשל {"message":"להתקשר לספק","type":"task"}. תאריכים YYYY-MM-DD, מספרים כמספרים.',
        },
        target_id: { type: SchemaType.STRING, description: 'id הרשומה לעדכון (חובה ב-update)' },
        label: { type: SchemaType.STRING, description: 'תיאור קצר של היעד, למשל שם הפרויקט' },
        summary: { type: SchemaType.STRING, description: 'משפט בעברית שמתאר בדיוק מה יקרה, למשל: "תיווצר משימה חדשה: להתקשר לספק"' },
      },
      required: ['operation', 'table', 'data', 'summary'],
    },
  },
];

// ---------------------------------------------------------------------------
// Pending action (returned to the client for explicit user confirmation)
// ---------------------------------------------------------------------------

export interface PendingAction {
  operation: 'insert' | 'update';
  table: string;
  data: Record<string, any>;
  target_id?: string;
  label: string;
  summary: string;
}

// Tables Roxy may propose writes to. Delete is structurally impossible.
const PROPOSABLE_TABLES = new Set([
  'alerts', 'project_updates', 'projects', 'project_details',
  'project_contacts', 'pipe_specs', 'leads', 'inventory',
]);

// ---------------------------------------------------------------------------
// Tool executors (run with the user's RLS-scoped client)
// ---------------------------------------------------------------------------

const clip = (rows: any[] | null, n = 25) => (rows || []).slice(0, n);

async function projectIdByName(sb: any, name: string): Promise<{ id: string; name: string } | null> {
  const { data } = await sb.from('projects').select('id, name').ilike('name', `%${name}%`).limit(1).maybeSingle();
  return data || null;
}

export async function executeRoxyTool(
  sb: any,
  name: string,
  args: Record<string, any>,
  collector: { pendingActions: PendingAction[] },
): Promise<Record<string, any>> {
  try {
    switch (name) {
      case 'search_projects': {
        let q = sb.from('projects')
          .select('id, name, current_stage, stage_label, progress_percent, order_value, status, developer_name, city, probability_percent')
          .order('updated_at', { ascending: false })
          .limit(Math.min(args.limit || 10, 25));
        if (args.query) q = q.or(`name.ilike.%${args.query}%,developer_name.ilike.%${args.query}%,city.ilike.%${args.query}%`);
        const { data, error } = await q;
        if (error) return { error: error.message };
        return { projects: clip(data), count: data?.length || 0 };
      }

      case 'get_project': {
        let proj: any = null;
        if (args.project_id) {
          const { data } = await sb.from('projects').select('*').eq('id', args.project_id).maybeSingle();
          proj = data;
        } else if (args.name) {
          const { data } = await sb.from('projects').select('*').ilike('name', `%${args.name}%`).limit(1).maybeSingle();
          proj = data;
        }
        if (!proj) return { error: 'הפרויקט לא נמצא' };
        const [details, contacts, specs, updates, quotes] = await Promise.all([
          sb.from('project_details').select('*').eq('project_id', proj.id).maybeSingle(),
          sb.from('project_contacts').select('id, role, name, phone, email').eq('project_id', proj.id),
          sb.from('pipe_specs').select('id, diameter_mm, line_length_m, unit_length_m, stiffness_pascal, pressure_bar, notes').eq('project_id', proj.id),
          sb.from('project_updates').select('update_date, people, title, description, tasks').eq('project_id', proj.id).order('update_date', { ascending: false }).limit(5),
          sb.from('quotes').select('id, quote_number, status, total_amount, client_name, sent_at, valid_until').eq('project_id', proj.id).order('created_at', { ascending: false }).limit(10),
        ]);
        return {
          project: proj,
          details: details.data || null,
          contacts: clip(contacts.data),
          pipe_specs: clip(specs.data),
          recent_updates: clip(updates.data, 5),
          quotes: clip(quotes.data, 10),
        };
      }

      case 'list_quotes': {
        let q = sb.from('quotes')
          .select('id, project_id, quote_number, client_name, status, total_amount, currency, sent_at, valid_until, created_at, lost_reason')
          .order('created_at', { ascending: false }).limit(30);
        if (args.status) q = q.eq('status', args.status);
        const { data, error } = await q;
        if (error) return { error: error.message };
        let rows = data || [];
        // Attach project names (and filter by project if asked)
        const ids = Array.from(new Set(rows.map((r: any) => r.project_id).filter(Boolean)));
        const nameById: Record<string, string> = {};
        if (ids.length) {
          const { data: projs } = await sb.from('projects').select('id, name').in('id', ids);
          (projs || []).forEach((p: any) => { nameById[p.id] = p.name; });
        }
        rows = rows.map((r: any) => ({ ...r, project_name: nameById[r.project_id] || null }));
        if (args.project_name) rows = rows.filter((r: any) => (r.project_name || '').includes(args.project_name));
        return { quotes: clip(rows, 30), count: rows.length };
      }

      case 'list_tasks': {
        let q = sb.from('alerts')
          .select('id, project_id, type, message, is_resolved, created_at')
          .order('created_at', { ascending: false }).limit(30);
        if (!args.include_resolved) q = q.eq('is_resolved', false);
        const { data, error } = await q;
        if (error) return { error: error.message };
        let rows = data || [];
        const ids = Array.from(new Set(rows.map((r: any) => r.project_id).filter(Boolean)));
        const nameById: Record<string, string> = {};
        if (ids.length) {
          const { data: projs } = await sb.from('projects').select('id, name').in('id', ids);
          (projs || []).forEach((p: any) => { nameById[p.id] = p.name; });
        }
        rows = rows.map((r: any) => ({ ...r, project_name: nameById[r.project_id] || null }));
        if (args.project_name) rows = rows.filter((r: any) => (r.project_name || '').includes(args.project_name));
        return { tasks: clip(rows, 30), count: rows.length };
      }

      case 'search_inventory': {
        // Live balance derived from the movements ledger (receipts in, deliveries out).
        let q = sb.from('inventory_balance')
          .select('item_key, description, category, dn, pn, sn, length_m, unit, in_stock, total_in, total_out, last_movement')
          .order('dn').limit(40);
        if (args.diameter_mm) q = q.eq('dn', args.diameter_mm);
        if (args.category) q = q.eq('category', args.category);
        if (args.query) q = q.or(`description.ilike.%${args.query}%,item_key.ilike.%${args.query}%`);
        const { data, error } = await q;
        if (error) return { error: error.message };
        return { inventory: clip(data, 40), count: data?.length || 0 };
      }

      case 'list_leads': {
        const { data, error } = await sb.from('leads')
          .select('id, project_name, developer_name, planner_name, stage, estimated_value, next_action, next_action_date, notes')
          .order('updated_at', { ascending: false }).limit(30);
        if (error) return { error: error.message };
        return { leads: clip(data, 30), count: data?.length || 0 };
      }

      case 'list_customers': {
        let q = sb.from('clients').select('id, name, city, phone, email, tax_id').order('created_at', { ascending: false }).limit(20);
        if (args.query) q = q.ilike('name', `%${args.query}%`);
        const { data, error } = await q;
        if (error) return { error: error.message };
        return { customers: clip(data, 20), count: data?.length || 0 };
      }

      case 'find_drawings': {
        const term = (args.query || '').toLowerCase();
        const [{ data: atts }, { data: projs }, { data: dets }] = await Promise.all([
          sb.from('attachments').select('id, project_id, file_name, file_type, drawing_number').eq('entity_type', 'project'),
          sb.from('projects').select('id, name'),
          sb.from('project_details').select('project_id, project_number'),
        ]);
        const nameById: Record<string, string> = {};
        (projs || []).forEach((p: any) => { nameById[p.id] = p.name; });
        const numById: Record<string, number> = {};
        (dets || []).forEach((d: any) => { if (d.project_number != null) numById[d.project_id] = d.project_number; });
        const matches = (atts || []).filter((a: any) => {
          const ref = `${numById[a.project_id] ?? ''}/${a.drawing_number ?? ''}`;
          return !term || [a.drawing_number, nameById[a.project_id], String(numById[a.project_id] ?? ''), ref, a.file_name]
            .some((f: any) => (f || '').toLowerCase().includes(term));
        }).map((a: any) => ({
          ref: `${numById[a.project_id] ?? '—'}/${a.drawing_number || '?'}`,
          project: nameById[a.project_id] || '',
          file_name: a.file_name,
          kind: a.file_type === 'spec' ? 'מפרט' : 'שרטוט',
        }));
        return { drawings: clip(matches, 15), count: matches.length, open_url: `/drawings?q=${encodeURIComponent(args.query || '')}` };
      }

      case 'dashboard_snapshot': {
        const [projects, quotes, tasks, leads] = await Promise.all([
          sb.from('projects').select('id', { count: 'exact', head: true }).not('realization_status', 'in', '("הסתיים","בוטל")'),
          sb.from('quotes').select('total_amount').eq('status', 'sent'),
          sb.from('alerts').select('id', { count: 'exact', head: true }).eq('is_resolved', false),
          sb.from('leads').select('id', { count: 'exact', head: true }),
        ]);
        const openQuotes = quotes.data || [];
        return {
          active_projects: projects.count ?? null,
          open_quotes: openQuotes.length,
          open_quotes_total_ils: openQuotes.reduce((s: number, q: any) => s + (q.total_amount || 0), 0),
          open_tasks: tasks.count ?? null,
          leads: leads.count ?? null,
        };
      }

      case 'list_team': {
        const { data, error } = await sb.from('team_members')
          .select('name, role, access_level, active').eq('active', true);
        if (error) return { error: error.message };
        return { team: clip(data, 30) };
      }

      case 'propose_action': {
        const operation = String(args.operation || '').toLowerCase();
        if (operation !== 'insert' && operation !== 'update') {
          return { error: 'רק insert או update מותרים. מחיקה דרך רקסי חסומה — הסבר למשתמש שמחיקה נעשית ידנית במסך המתאים.' };
        }
        const table = String(args.table || '');
        if (!PROPOSABLE_TABLES.has(table)) {
          return { error: `הטבלה "${table}" אינה ברשימת הטבלאות המותרות לכתיבה.` };
        }
        if (operation === 'update' && !args.target_id) {
          return { error: 'עדכון דורש target_id — מצא קודם את הרשומה עם כלי קריאה.' };
        }
        let data: Record<string, any> = {};
        if (typeof args.data === 'string') {
          try { data = JSON.parse(args.data); } catch { return { error: 'שדה data אינו JSON תקין.' }; }
        } else if (args.data && typeof args.data === 'object') {
          data = args.data;
        }
        const v = validateWrite(table, data);
        if (!v.ok) return { error: rejectionMessage(v) };

        const pending: PendingAction = {
          operation: operation as 'insert' | 'update',
          table,
          data,
          target_id: args.target_id || undefined,
          label: args.label || '',
          summary: args.summary || '',
        };
        collector.pendingActions.push(pending);
        return {
          ok: true,
          note: 'ההצעה נרשמה ותוצג למשתמש עם כפתורי אישור/ביטול. סכם למשתמש בקצרה מה הפעולה שממתינה לאישורו — אל תגיד שהיא בוצעה.',
        };
      }

      default:
        return { error: `כלי לא מוכר: ${name}` };
    }
  } catch (e: any) {
    return { error: e?.message || 'שגיאה בהרצת הכלי' };
  }
}
