/**
 * Roxy's import / procurement read tools — purchase orders, supplier pricing
 * (cost inputs), shipments & shortfalls, supplier payables, suppliers.
 *
 * Policy (changed 2026-10-26 with the user's explicit approval): import tables
 * are readable through Roxy. RLS is still the gate — every query runs with the
 * USER's client, so a user without the `import` module sees nothing here and
 * Roxy tells them who can. Reads only; no import table is on the write allowlist.
 */
import { SchemaType, type FunctionDeclaration } from '@google/generative-ai';
import { effectiveCurrency } from '@/lib/pricing';
import { orderShortfall } from '@/lib/import-status';
import { SHIPMENT_STATUS_HE } from '@/lib/import-tracker';
import { familyOf } from '@/lib/ai/roxy-insight-tools';

const F = {
  dn: { type: SchemaType.NUMBER, description: 'קוטר DN במ"מ' },
  dn_min: { type: SchemaType.NUMBER, description: 'קוטר מינימלי (כולל)' },
  dn_max: { type: SchemaType.NUMBER, description: 'קוטר מקסימלי (כולל)' },
  pn: { type: SchemaType.NUMBER, description: 'דרג לחץ PN' },
  sn: { type: SchemaType.NUMBER, description: 'קשיחות SN' },
  product: { type: SchemaType.STRING, description: 'טקסט חופשי בתיאור הפריט / מק"ט' },
  family: { type: SchemaType.STRING, description: 'משפחת פריט: צינור / רוקר / מחבר / מחבר קיר / ברך / אוגן / מעבר / חיוץ / מצוף' },
  supplier: { type: SchemaType.STRING, description: 'שם ספק (או חלק): Amiblu / Subor / Alghadir…' },
  project: { type: SchemaType.STRING, description: 'שם פרויקט (או חלק), יזם או עיר' },
  date_from: { type: SchemaType.STRING, description: 'מתאריך YYYY-MM-DD (כולל)' },
  date_to: { type: SchemaType.STRING, description: 'עד תאריך YYYY-MM-DD (כולל)' },
  limit: { type: SchemaType.NUMBER, description: 'כמה שורות להציג (ברירת מחדל 25, עד 60). totals תמיד על הכול.' },
} as const;

export const IMPORT_FUNCTION_DECLARATIONS: FunctionDeclaration[] = [
  {
    name: 'search_purchase_orders',
    description: `הזמנות רכש לספקים (PO) עם שורותיהן: לפי ספק, פרויקט, סטטוס, שלב (בהכנה ברכש / נשלחה לספק), קוטר/PN/SN/מק"ט, טווח תאריכים.
עונה על: "מה הזמנו מ-Amiblu ב-2026 לפי DN", "באיזו הזמנת רכש מופיע DN1200 ומה מחיר העלות", "אילו הזמנות רכש בהכנה ולא נשלחו", "סך הרכש מכל ספק לפי מטבע", "יש פער בין ההצעה החתומה להזמנת הרכש של פרויקט X" (compare_with_quote=true).
מחזיר הזמנות + שורות תואמות + totals (לפי מטבע — אין סיכום חוצה-מטבעות) + פילוח group_by.`,
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        ...F,
        status: { type: SchemaType.STRING, description: 'סטטוסים מופרדים בפסיק: draft, planned, ordered, shipped, partially_received, received, closed, cancelled. ריק = הכל חוץ מבוטלות' },
        stage: { type: SchemaType.STRING, description: 'in_procurement = בהכנה ברכש (טרם נשלחה לספק) / sent = נשלחה לספק' },
        po_number: { type: SchemaType.STRING, description: 'מספר הזמנת רכש / מספר הזמנת ספק (או חלק)' },
        compare_with_quote: { type: SchemaType.BOOLEAN, description: 'להשוות כמויות לפי DN מול ההצעה החתומה שממנה נולדה ההזמנה' },
        group_by: { type: SchemaType.STRING, description: 'פילוח: supplier / project / month / currency / dn' },
      },
    },
  },
  {
    name: 'search_cost_inputs',
    description: `תמחורי ספקים (קוטציות ועלויות שהוזנו לפרויקטים): עלות לפי קוטר/PN/SN/מוצר, לפי ספק, פרויקט, מטבע, סוג (supplier/internal), גיל שער החליפין.
עונה על: "מה עלות DN900 אצל Subor לעומת Amiblu" (group_by=supplier), "מה העלות האחרונה ל-DN600", "אילו תמחורים עם שער ישן מ-60 יום" (stale_rate_days=60).
מחזיר שורות + totals (עלות מינ/מקס/ממוצע משוקלל/אחרונה בש"ח) + פילוח.`,
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        ...F,
        currency: { type: SchemaType.STRING, description: 'מטבע המקור: USD / EUR / ILS' },
        source_type: { type: SchemaType.STRING, description: 'supplier (קוטציית ספק) / internal (תמחור פנימי). ריק = הכל' },
        stale_rate_days: { type: SchemaType.NUMBER, description: 'רק תמחורים במטבע זר שתאריך השער שלהם ישן מ-N ימים' },
        group_by: { type: SchemaType.STRING, description: 'פילוח: supplier / dn / project / currency / month' },
      },
    },
  },
  {
    name: 'import_status',
    description: `משלוחים ו-LOTים: מה בדרך (אוניה, ETA), מה הגיע/שוחרר, לפי פרויקט / ספק / BL / LOT / מכולה / טווח ETA; ו"חסר להשלמה" — כמה הוזמן, כמה נשלח וכמה חסר לכל פריט בהזמנות של פרויקט (shortfall=true).
עונה על: "מה בדרך אלינו עכשיו", "כמה DN700 הגיע לרהט וכמה חסר", "אילו מכולות שוחררו החודש", "איזה LOT כולל BL X".`,
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        project: F.project,
        supplier: F.supplier,
        bl: { type: SchemaType.STRING, description: 'מספר BL (או חלק)' },
        lot: { type: SchemaType.STRING, description: 'שם LOT (או חלק)' },
        container: { type: SchemaType.STRING, description: 'מספר מכולה (או חלק)' },
        in_transit: { type: SchemaType.BOOLEAN, description: 'true = רק משלוחים שטרם הגיעו/שוחררו' },
        eta_from: { type: SchemaType.STRING, description: 'ETA מתאריך YYYY-MM-DD' },
        eta_to: { type: SchemaType.STRING, description: 'ETA עד תאריך YYYY-MM-DD' },
        released_from: { type: SchemaType.STRING, description: 'שוחרר מהנמל מתאריך' },
        released_to: { type: SchemaType.STRING, description: 'שוחרר מהנמל עד תאריך' },
        shortfall: { type: SchemaType.BOOLEAN, description: 'true = לחשב הוזמן/נשלח/חסר לכל פריט (דורש project או supplier)' },
        dn: F.dn,
        limit: F.limit,
      },
    },
  },
  {
    name: 'supplier_payables',
    description: 'חשבוניות ספק ותשלומים לספקים: יתרות פתוחות במטבע המקור, מועדי פירעון, פיגורים. עונה על: "אילו חשבוניות ספק מגיעות לפירעון ב-14 יום", "כמה חייבים ל-Amiblu", "מה בפיגור".',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        supplier: F.supplier,
        due_within_days: { type: SchemaType.NUMBER, description: 'רק חשבוניות שמועד פירעונן בתוך N ימים (כולל באיחור)' },
        overdue_only: { type: SchemaType.BOOLEAN, description: 'רק חשבוניות שעבר מועד פירעונן' },
        include_paid: { type: SchemaType.BOOLEAN, description: 'לכלול גם חשבוניות ששולמו במלואן' },
        limit: F.limit,
      },
    },
  },
  {
    name: 'list_suppliers',
    description: 'רשימת הספקים: שם, איש קשר, מטבע, מייל, טלפון, פעיל/לא, ומספר הזמנות הרכש. עונה על "מה המייל של Alghadir", "אילו ספקים פעילים".',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        query: { type: SchemaType.STRING, description: 'שם ספק או חלק ממנו. ריק = כולם' },
        include_inactive: { type: SchemaType.BOOLEAN, description: 'לכלול ספקים לא פעילים' },
      },
    },
  },
];

// ---------------------------------------------------------------------------

const clip = (rows: any[] | null | undefined, n = 25) => (rows || []).slice(0, Math.min(Math.max(n, 1), 60));
const num = (v: any) => { const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(/[^\d.-]/g, '')); return Number.isFinite(n) ? n : 0; };
const round2 = (n: number) => Math.round(n * 100) / 100;
const dateOnly = (v: any) => (v ? String(v).slice(0, 10) : null);
const monthKey = (v: any) => (v ? String(v).slice(0, 7) : 'ללא תאריך');
const daysBetween = (a: string, b: string) => Math.floor((new Date(b).getTime() - new Date(a).getTime()) / 86400000);
const splitList = (s: any) => String(s || '').split(',').map((x) => x.trim()).filter(Boolean);
const dnOf = (v: any): number | null => { if (v == null) return null; if (typeof v === 'number') return v; const m = String(v).match(/\d{2,4}/); return m ? parseInt(m[0], 10) : null; };
const inRange = (d: string | null, from?: string, to?: string) => (!from && !to) ? true : !d ? false : !(from && d < from) && !(to && d > to);
const today = () => new Date().toISOString().slice(0, 10);

async function fetchAll(build: () => any): Promise<any[]> {
  const out: any[] = []; const PAGE = 1000;
  for (let from = 0; from < 20000; from += PAGE) {
    const { data, error } = await build().range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    out.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }
  return out;
}
async function inChunks(ids: string[], build: (chunk: string[]) => any): Promise<any[]> {
  const out: any[] = [];
  for (let i = 0; i < ids.length; i += 100) { const { data, error } = await build(ids.slice(i, i + 100)); if (error) throw new Error(error.message); out.push(...(data || [])); }
  return out;
}
function groupSum(rows: any[], keyFn: (r: any) => string, sums: Record<string, (r: any) => number>) {
  const g: Record<string, any> = {};
  rows.forEach((r) => {
    const k = keyFn(r) || '—';
    if (!g[k]) { g[k] = { key: k, count: 0 }; Object.keys(sums).forEach((s) => { g[k][s] = 0; }); }
    g[k].count += 1; Object.entries(sums).forEach(([s, fn]) => { g[k][s] = round2(g[k][s] + fn(r)); });
  });
  return Object.values(g).sort((a: any, b: any) => b.count - a.count);
}
/** Item filter shared by PO lines and cost-input lines. */
function lineMatches(args: any, line: { dn: number | null; pn: any; sn: any; text: string }) {
  if (args.dn != null && line.dn !== Number(args.dn)) return false;
  if (args.dn_min != null && (line.dn == null || line.dn < Number(args.dn_min))) return false;
  if (args.dn_max != null && (line.dn == null || line.dn > Number(args.dn_max))) return false;
  if (args.pn != null && num(line.pn) !== Number(args.pn)) return false;
  if (args.sn != null && num(line.sn) !== Number(args.sn)) return false;
  if (args.product && !line.text.toLowerCase().includes(String(args.product).toLowerCase())) return false;
  if (args.family && familyOf(line.text) !== String(args.family).trim()) return false;
  return true;
}
const hasLineFilter = (args: any) => ['dn', 'dn_min', 'dn_max', 'pn', 'sn', 'product', 'family'].some((k) => args[k] != null && args[k] !== '');

async function suppliersMap(sb: any, term?: string): Promise<Record<string, any>> {
  let q = sb.from('suppliers').select('id, name, contact_name, currency, active, email, phone');
  if (term) q = q.ilike('name', `%${term}%`);
  const rows = await fetchAll(() => q); const m: Record<string, any> = {}; rows.forEach((s: any) => { m[s.id] = s; }); return m;
}
async function projectsMap(sb: any, term?: string): Promise<Record<string, any>> {
  let q = sb.from('projects').select('id, name, developer_name, city, customer_id');
  if (term) q = q.or(`name.ilike.%${term}%,developer_name.ilike.%${term}%,city.ilike.%${term}%`);
  const rows = await fetchAll(() => q); const m: Record<string, any> = {}; rows.forEach((p: any) => { m[p.id] = p; }); return m;
}
async function fillProjects(sb: any, map: Record<string, any>, ids: any[]) {
  const missing = Array.from(new Set(ids.filter((id) => id && !map[id]))) as string[];
  if (missing.length) (await inChunks(missing, (c) => sb.from('projects').select('id, name, developer_name, city, customer_id').in('id', c))).forEach((p: any) => { map[p.id] = p; });
}

const PO_STATUS_HE: Record<string, string> = {
  draft: 'טיוטה (מהצעה)', planned: 'מתוכננת (תפ"י)', ordered: 'הוזמנה', shipped: 'נשלחה', partially_received: 'התקבלה חלקית', received: 'התקבלה', closed: 'נסגרה', cancelled: 'בוטלה',
};
const RLS_HINT = 'אין למשתמש הרשאת צפייה במודול היבוא — הסבירי מי כן יכול (מבלוק ההרשאות) ושאדמין נותן הרשאה בהגדרות → משתמשים.';
const rlsOrError = (e: any) => (/row-level security|permission|policy|42501/i.test(String(e?.message || e)) ? { error: RLS_HINT } : { error: e?.message || 'שגיאה בהרצת הכלי' });

/** Load POs (+ supplier/project/quote maps) with the shared header filters. */
async function loadPOs(sb: any, args: any) {
  const [supMap, projMap] = await Promise.all([suppliersMap(sb, args.supplier), projectsMap(sb, args.project)]);
  if ((args.supplier && !Object.keys(supMap).length) || (args.project && !Object.keys(projMap).length)) return { orders: [] as any[], supMap, projMap, quotes: {} as Record<string, any> };
  let orders = await fetchAll(() => sb.from('import_orders').select('id, supplier_id, project_id, is_stock, po_number, supplier_order_no, project_name, currency, incoterms, payment_terms, total_amount, order_date, status, notes, created_at, quote_id, origin, procurement_type, po_sent_at, delivery_date, cancelled_at, cancel_reason').order('created_at', { ascending: false }));
  if (args.supplier) orders = orders.filter((o: any) => supMap[o.supplier_id]);
  if (args.project) orders = orders.filter((o: any) => projMap[o.project_id]);
  await fillProjects(sb, projMap, orders.map((o: any) => o.project_id));
  if (!args.supplier) { const miss = Array.from(new Set(orders.map((o: any) => o.supplier_id).filter((id: any) => id && !supMap[id]))) as string[]; if (miss.length) (await inChunks(miss, (c) => sb.from('suppliers').select('id, name, contact_name, currency, active, email, phone').in('id', c))).forEach((s: any) => { supMap[s.id] = s; }); }
  const quotes: Record<string, any> = {};
  const qids = Array.from(new Set(orders.map((o: any) => o.quote_id).filter(Boolean))) as string[];
  if (qids.length) (await inChunks(qids, (c) => sb.from('quotes').select('id, quote_number, status, total_amount').in('id', c))).forEach((q: any) => { quotes[q.id] = q; });
  return { orders, supMap, projMap, quotes };
}

export async function executeImportTool(sb: any, name: string, args: Record<string, any>): Promise<Record<string, any> | null> {
  const limit = Number(args.limit) || 25;
  try {
    switch (name) {
      // -------------------------------------------------------------------
      case 'search_purchase_orders': {
        const { orders: all, supMap, projMap, quotes } = await loadPOs(sb, args);
        let orders = all;
        const statuses = splitList(args.status);
        if (statuses.length) orders = orders.filter((o: any) => statuses.includes(o.status));
        else orders = orders.filter((o: any) => o.status !== 'cancelled' && !o.cancelled_at);
        if (args.stage === 'in_procurement') orders = orders.filter((o: any) => !o.po_sent_at);
        if (args.stage === 'sent') orders = orders.filter((o: any) => !!o.po_sent_at);
        if (args.po_number) { const t = String(args.po_number).toLowerCase(); orders = orders.filter((o: any) => [o.po_number, o.supplier_order_no].some((x) => (x || '').toLowerCase().includes(t))); }
        orders = orders.filter((o: any) => inRange(dateOnly(o.order_date || o.created_at), args.date_from, args.date_to));
        if (!orders.length) return { orders: [], count: 0, note: 'לא נמצאו הזמנות רכש שעונות לסינון' };

        const lines = await inChunks(orders.map((o: any) => o.id), (c) => sb.from('import_order_items').select('id, import_order_id, line_no, material_no, description, dn, pn, sn, unit, ordered_qty, unit_price, length_m, completed_at').in('import_order_id', c));
        const lineRows = lines.map((l: any) => ({
          import_order_id: l.import_order_id, line_no: l.line_no, material_no: l.material_no, description: l.description,
          dn: dnOf(l.dn) ?? dnOf(l.description), pn: l.pn ?? null, sn: l.sn ?? null, family: familyOf(l.description || ''),
          ordered_qty: num(l.ordered_qty), unit: l.unit, length_m: num(l.length_m) || null, unit_price: num(l.unit_price) || null,
          line_total: round2(num(l.ordered_qty) * num(l.unit_price)), completed: !!l.completed_at,
        }));
        const matching = hasLineFilter(args) ? lineRows.filter((l) => lineMatches(args, { dn: l.dn, pn: l.pn, sn: l.sn, text: `${l.description || ''} ${l.material_no || ''}` })) : lineRows;
        const keep = hasLineFilter(args) ? new Set(matching.map((l) => l.import_order_id)) : null;
        const outOrders = orders.filter((o: any) => !keep || keep.has(o.id)).map((o: any) => {
          const ls = matching.filter((l) => l.import_order_id === o.id);
          return {
            po_number: o.po_number, supplier_order_no: o.supplier_order_no, supplier: supMap[o.supplier_id]?.name || null,
            project: projMap[o.project_id]?.name || o.project_name || (o.is_stock ? 'מלאי' : null), project_url: o.project_id ? `/projects/${o.project_id}` : null,
            status: o.status, status_he: PO_STATUS_HE[o.status] || o.status, stage: o.po_sent_at ? 'נשלחה לספק' : 'בהכנה ברכש',
            currency: o.currency, total_amount: num(o.total_amount), order_date: dateOnly(o.order_date || o.created_at), po_sent_at: dateOnly(o.po_sent_at), delivery_date: o.delivery_date,
            incoterms: o.incoterms, payment_terms: o.payment_terms, quote_number: quotes[o.quote_id]?.quote_number || null,
            cancelled_at: dateOnly(o.cancelled_at), cancel_reason: o.cancel_reason || null,
            lines: ls.map(({ import_order_id, ...rest }) => rest), lines_total: round2(ls.reduce((s, l) => s + l.line_total, 0)), lines_qty: round2(ls.reduce((s, l) => s + l.ordered_qty, 0)),
          };
        });

        // Totals per currency (never summed across currencies).
        const byCurrency: Record<string, { orders: number; total_amount: number; lines_total: number; lines_qty: number }> = {};
        outOrders.forEach((o) => { const c = o.currency || '?'; byCurrency[c] = byCurrency[c] || { orders: 0, total_amount: 0, lines_total: 0, lines_qty: 0 }; byCurrency[c].orders += 1; byCurrency[c].total_amount = round2(byCurrency[c].total_amount + o.total_amount); byCurrency[c].lines_total = round2(byCurrency[c].lines_total + o.lines_total); byCurrency[c].lines_qty = round2(byCurrency[c].lines_qty + o.lines_qty); });
        const flatLines = outOrders.flatMap((o) => o.lines.map((l) => ({ ...l, supplier: o.supplier, project: o.project, currency: o.currency, month: monthKey(o.order_date) })));
        const gb = String(args.group_by || '');
        const keyFn: Record<string, (r: any) => string> = { supplier: (r) => r.supplier || '—', project: (r) => r.project || '—', month: (r) => r.month, currency: (r) => r.currency || '—', dn: (r) => (r.dn != null ? `DN${r.dn}` : '—') };
        const groups = keyFn[gb] ? groupSum(flatLines, (r) => `${keyFn[gb](r)}${gb === 'currency' ? '' : ` [${r.currency}]`}`, { qty: (r) => r.ordered_qty, amount: (r) => r.line_total }) : undefined;

        // Signed quote vs PO, by DN (meters).
        let comparison: any[] | undefined;
        if (args.compare_with_quote) {
          comparison = [];
          for (const o of orders.filter((x: any) => x.quote_id)) {
            const { data: qi } = await sb.from('quote_items').select('product_name, dn_size, quantity, unit').eq('quote_id', o.quote_id);
            const byDn = (rows: any[], dnK: (r: any) => number | null, qK: (r: any) => number) => { const m: Record<string, number> = {}; rows.forEach((r) => { const k = dnK(r) != null ? `DN${dnK(r)}` : '—'; m[k] = round2((m[k] || 0) + qK(r)); }); return m; };
            const q = byDn(qi || [], (r) => dnOf(r.dn_size) ?? dnOf(r.product_name), (r) => num(r.quantity));
            const p = byDn(lineRows.filter((l) => l.import_order_id === o.id), (r) => r.dn, (r) => r.ordered_qty);
            const keys = Array.from(new Set([...Object.keys(q), ...Object.keys(p)]));
            comparison.push({ po_number: o.po_number, quote_number: quotes[o.quote_id]?.quote_number, project: projMap[o.project_id]?.name || o.project_name, by_dn: keys.map((k) => ({ dn: k, quote_qty: q[k] || 0, po_qty: p[k] || 0, diff: round2((p[k] || 0) - (q[k] || 0)) })).filter((r) => r.diff !== 0 || true), has_gap: keys.some((k) => (q[k] || 0) !== (p[k] || 0)) });
          }
        }
        return {
          orders: clip(outOrders, limit), count: outOrders.length,
          totals: { orders: outOrders.length, lines: flatLines.length, by_currency: byCurrency, in_procurement: outOrders.filter((o) => o.stage === 'בהכנה ברכש').length },
          groups, comparison, urls: { procurement: '/procurement', import: '/import' },
          note: outOrders.length > limit ? `מוצגות ${Math.min(limit, 60)} מתוך ${outOrders.length} הזמנות — הסיכומים כוללים הכול.` : undefined,
        };
      }

      // -------------------------------------------------------------------
      case 'search_cost_inputs': {
        const projMap = await projectsMap(sb, args.project);
        if (args.project && !Object.keys(projMap).length) return { items: [], count: 0 };
        let cis = await fetchAll(() => { let q = sb.from('cost_inputs').select('id, project_id, source_type, source_name, reference_number, currency, exchange_rate, exchange_rate_date, payment_terms, is_archived, created_at').order('created_at', { ascending: false }); if (args.project && Object.keys(projMap).length <= 100) q = q.in('project_id', Object.keys(projMap)); return q; });
        if (args.project) cis = cis.filter((c: any) => projMap[c.project_id]);
        if (args.supplier) { const t = String(args.supplier).toLowerCase(); cis = cis.filter((c: any) => (c.source_name || '').toLowerCase().includes(t)); }
        if (args.source_type) cis = cis.filter((c: any) => c.source_type === args.source_type);
        cis = cis.filter((c: any) => !c.is_archived && inRange(dateOnly(c.created_at), args.date_from, args.date_to));
        if (!cis.length) return { items: [], count: 0, note: 'לא נמצאו תמחורים שעונים לסינון' };
        await fillProjects(sb, projMap, cis.map((c: any) => c.project_id));
        const ciById: Record<string, any> = {}; cis.forEach((c: any) => { ciById[c.id] = c; });
        const items = await inChunks(cis.map((c: any) => c.id), (c) => sb.from('cost_input_items').select('id, cost_input_id, product_name, dn_size, quantity, unit, cost_price, original_price, original_currency, item_type, pn, sn, length_m').in('cost_input_id', c));
        const itemsByCi: Record<string, any[]> = {}; items.forEach((it: any) => { (itemsByCi[it.cost_input_id] ||= []).push(it); });
        const effCur: Record<string, string> = {}; cis.forEach((c: any) => { effCur[c.id] = effectiveCurrency(c, itemsByCi[c.id] || []); });

        let rows = items.map((it: any) => {
          const ci = ciById[it.cost_input_id];
          return {
            project: projMap[ci.project_id]?.name || null, project_url: ci.project_id ? `/projects/${ci.project_id}` : null,
            supplier: ci.source_name || null, source_type: ci.source_type, reference: ci.reference_number || null, date: dateOnly(ci.created_at),
            currency: effCur[ci.id], exchange_rate: ci.exchange_rate ?? null, exchange_rate_date: ci.exchange_rate_date ?? null,
            rate_age_days: ci.exchange_rate_date ? daysBetween(ci.exchange_rate_date, today()) : null,
            product_name: it.product_name, family: familyOf(it.product_name), dn: dnOf(it.dn_size) ?? dnOf(it.product_name), pn: it.pn ?? null, sn: it.sn ?? null, length_m: num(it.length_m) || null,
            quantity: num(it.quantity), unit: it.unit, cost_price_ils: num(it.cost_price), original_price: num(it.original_price) || null, original_currency: it.original_currency || null,
          };
        });
        rows = rows.filter((r) => lineMatches(args, { dn: r.dn, pn: r.pn, sn: r.sn, text: r.product_name || '' }));
        if (args.currency) rows = rows.filter((r) => r.currency === String(args.currency).toUpperCase());
        if (args.stale_rate_days != null) rows = rows.filter((r) => r.currency !== 'ILS' && (r.rate_age_days == null || r.rate_age_days > Number(args.stale_rate_days)));
        rows.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
        const priced = rows.filter((r) => r.cost_price_ils > 0);
        const totals = {
          lines: rows.length, cost_inputs: new Set(rows.map((r) => `${r.project}|${r.supplier}|${r.date}`)).size, suppliers: Array.from(new Set(rows.map((r) => r.supplier).filter(Boolean))),
          cost_price_ils: priced.length ? { min: Math.min(...priced.map((r) => r.cost_price_ils)), max: Math.max(...priced.map((r) => r.cost_price_ils)), weighted_avg: round2(priced.reduce((s, r) => s + r.cost_price_ils * r.quantity, 0) / Math.max(1, priced.reduce((s, r) => s + r.quantity, 0))), latest: priced[0].cost_price_ils, latest_from: `${priced[0].supplier || '?'} · ${priced[0].date}` } : null,
        };
        const gb = String(args.group_by || '');
        const keyFn: Record<string, (r: any) => string> = { supplier: (r) => r.supplier || '—', dn: (r) => (r.dn != null ? `DN${r.dn}` : '—'), project: (r) => r.project || '—', currency: (r) => r.currency, month: (r) => monthKey(r.date) };
        const groups = keyFn[gb] ? groupSum(rows, keyFn[gb], { qty: (r) => r.quantity, _w: (r) => r.cost_price_ils * r.quantity }).map((g: any) => { const m = rows.filter((r) => keyFn[gb](r) === g.key && r.cost_price_ils > 0); const { _w, ...rest } = g; return { ...rest, avg_cost_ils: m.length ? round2(m.reduce((s, r) => s + r.cost_price_ils * r.quantity, 0) / Math.max(1, m.reduce((s, r) => s + r.quantity, 0))) : null, min_cost_ils: m.length ? Math.min(...m.map((r) => r.cost_price_ils)) : null, max_cost_ils: m.length ? Math.max(...m.map((r) => r.cost_price_ils)) : null, latest_cost_ils: m[0]?.cost_price_ils ?? null }; }) : undefined;
        return { items: clip(rows, limit), count: rows.length, totals, groups, note: rows.length > limit ? `מוצגות ${Math.min(limit, 60)} מתוך ${rows.length} שורות — הסיכומים כוללים הכול.` : undefined };
      }

      // -------------------------------------------------------------------
      case 'import_status': {
        const { orders, supMap, projMap } = await loadPOs(sb, { supplier: args.supplier, project: args.project });
        const orderIds = orders.map((o: any) => o.id);
        const scoped = !!(args.supplier || args.project);
        // Shipments: via packing lines (container → shipment) and invoices (shipment_id) of the scoped orders; unscoped = all.
        const [packing, invoices] = await Promise.all([
          orderIds.length ? inChunks(orderIds, (c) => sb.from('import_packing_lines').select('id, delivery_note_no, container_id, import_order_id, import_order_item_id, material_no, description, dn, shipped_qty, unit, pieces, loading_date, discharge_date').in('import_order_id', c)) : Promise.resolve([]),
          orderIds.length ? inChunks(orderIds, (c) => sb.from('import_invoices').select('id, import_order_id, shipment_id, invoice_no, invoice_type, invoice_date, currency, final_amount, net_value, freight').in('import_order_id', c)) : Promise.resolve([]),
        ]);
        const containers = await fetchAll(() => sb.from('import_containers').select('id, shipment_id, container_number, container_type, pieces'));
        const contById: Record<string, any> = {}; containers.forEach((c: any) => { contById[c.id] = c; });
        const shipIdsScoped = new Set<string>([...packing.map((p: any) => contById[p.container_id]?.shipment_id), ...invoices.map((i: any) => i.shipment_id)].filter(Boolean));
        let shipments = await fetchAll(() => sb.from('import_shipments').select('id, supplier_id, bl_number, carrier, vessel_name, voyage_no, port_loading, port_discharge, etd, eta, status, lot_label, released_at, customer_delivery_date, notes').order('eta', { ascending: false }));
        if (scoped) shipments = shipments.filter((s: any) => shipIdsScoped.has(s.id) || (args.supplier && supMap[s.supplier_id] && !args.project));
        if (args.bl) { const t = String(args.bl).toLowerCase(); shipments = shipments.filter((s: any) => (s.bl_number || '').toLowerCase().includes(t)); }
        if (args.lot) { const t = String(args.lot).toLowerCase(); shipments = shipments.filter((s: any) => (s.lot_label || '').toLowerCase().includes(t)); }
        if (args.container) { const t = String(args.container).toLowerCase(); const sids = new Set(containers.filter((c: any) => (c.container_number || '').toLowerCase().includes(t)).map((c: any) => c.shipment_id)); shipments = shipments.filter((s: any) => sids.has(s.id)); }
        const arrivedLike = (s: any) => ['arrived', 'customs', 'delivered', 'closed'].includes(s.status) || !!s.released_at || !!s.customer_delivery_date;
        if (args.in_transit) shipments = shipments.filter((s: any) => !arrivedLike(s));
        shipments = shipments.filter((s: any) => inRange(dateOnly(s.eta), args.eta_from, args.eta_to) && inRange(dateOnly(s.released_at), args.released_from, args.released_to));
        const miss = Array.from(new Set(shipments.map((s: any) => s.supplier_id).filter((id: any) => id && !supMap[id]))) as string[];
        if (miss.length) (await inChunks(miss, (c) => sb.from('suppliers').select('id, name').in('id', c))).forEach((s: any) => { supMap[s.id] = s; });
        const t0 = today();
        const out = shipments.map((s: any) => {
          const conts = containers.filter((c: any) => c.shipment_id === s.id);
          const contIds = new Set(conts.map((c: any) => c.id));
          const lines = packing.filter((p: any) => contIds.has(p.container_id));
          const linkedOrders = Array.from(new Set([...lines.map((p: any) => p.import_order_id), ...invoices.filter((i: any) => i.shipment_id === s.id).map((i: any) => i.import_order_id)].filter(Boolean)));
          return {
            lot: s.lot_label || null, bl_number: s.bl_number, supplier: supMap[s.supplier_id]?.name || null, vessel: s.vessel_name || null, carrier: s.carrier || null,
            route: [s.port_loading, s.port_discharge].filter(Boolean).join(' → ') || null, etd: dateOnly(s.etd), eta: dateOnly(s.eta),
            days_to_eta: s.eta && !arrivedLike(s) ? daysBetween(t0, dateOnly(s.eta)!) : null,
            status: s.status, status_he: s.customer_delivery_date ? `סופק ללקוח ${s.customer_delivery_date}` : s.released_at ? `שוחרר ${dateOnly(s.released_at)}` : (SHIPMENT_STATUS_HE[s.status] || s.status), in_transit: !arrivedLike(s),
            released_at: dateOnly(s.released_at), customer_delivery_date: s.customer_delivery_date || null,
            containers: conts.map((c: any) => c.container_number).filter(Boolean),
            orders: linkedOrders.map((id) => { const o = orders.find((x: any) => x.id === id); return o ? { po_number: o.po_number, project: projMap[o.project_id]?.name || o.project_name || null, project_url: o.project_id ? `/projects/${o.project_id}` : null } : null; }).filter(Boolean),
            invoices: invoices.filter((i: any) => i.shipment_id === s.id).map((i: any) => ({ invoice_no: i.invoice_no, type: i.invoice_type, date: i.invoice_date, currency: i.currency, amount: num(i.final_amount) || num(i.net_value) + num(i.freight) })),
            shipped_meters: round2(lines.reduce((sum: number, p: any) => sum + num(p.shipped_qty), 0)),
          };
        });

        // Shortfall per order item (scoped orders only — needs project or supplier).
        let shortfall: any[] | undefined;
        if (args.shortfall && orderIds.length) {
          const items = await inChunks(orderIds, (c) => sb.from('import_order_items').select('id, import_order_id, line_no, material_no, description, dn, pn, sn, unit, ordered_qty, length_m, completed_at').in('import_order_id', c));
          shortfall = orders.filter((o: any) => o.status !== 'cancelled').map((o: any) => {
            const its = items.filter((i: any) => i.import_order_id === o.id);
            const rows = orderShortfall(its, packing.filter((p: any) => p.import_order_id === o.id))
              .map((r) => ({ line_no: r.item.line_no, description: r.item.description, dn: dnOf(r.item.dn) ?? dnOf(r.item.description), pn: r.item.pn, sn: r.item.sn, unit: r.item.unit, ordered: r.ordered, shipped: r.shipped, remaining: r.remaining, complete: r.complete, marked_manually: r.manual }))
              .filter((r) => args.dn == null || r.dn === Number(args.dn));
            return { po_number: o.po_number, supplier: supMap[o.supplier_id]?.name || null, project: projMap[o.project_id]?.name || o.project_name || null, project_url: o.project_id ? `/projects/${o.project_id}` : null, tracker_url: o.project_id ? `/import?view=tracker&project=${o.project_id}` : '/import', items: rows, totals: { ordered: round2(rows.reduce((s, r) => s + r.ordered, 0)), shipped: round2(rows.reduce((s, r) => s + r.shipped, 0)), remaining: round2(rows.reduce((s, r) => s + Math.max(0, r.remaining), 0)), open_items: rows.filter((r) => !r.complete).length } };
          }).filter((o: any) => o.items.length);
        }
        return { shipments: clip(out, limit), count: out.length, totals: { in_transit: out.filter((s) => s.in_transit).length, arrived: out.filter((s) => !s.in_transit).length }, shortfall, import_url: '/import', note: args.shortfall && !orderIds.length ? 'לחישוב "חסר להשלמה" צריך project או supplier.' : undefined };
      }

      // -------------------------------------------------------------------
      case 'supplier_payables': {
        const supMap = await suppliersMap(sb, args.supplier);
        if (args.supplier && !Object.keys(supMap).length) return { invoices: [], count: 0 };
        const { data: inv, error } = await sb.from('supplier_invoice_balances').select('id, import_order_id, shipment_id, invoice_no, invoice_type, invoice_date, currency, payable_amount, paid_total, balance, payment_due_date, payment_status, paid_at, booked');
        if (error) throw new Error(error.message);
        let rows: any[] = inv || [];
        const oids = Array.from(new Set(rows.map((r) => r.import_order_id).filter(Boolean))) as string[];
        const orders: Record<string, any> = {};
        if (oids.length) (await inChunks(oids, (c) => sb.from('import_orders').select('id, po_number, supplier_id, project_id, project_name').in('id', c))).forEach((o: any) => { orders[o.id] = o; });
        const missSup = Array.from(new Set(Object.values(orders).map((o: any) => o.supplier_id).filter((id: any) => id && !supMap[id]))) as string[];
        if (!args.supplier && missSup.length) (await inChunks(missSup, (c) => sb.from('suppliers').select('id, name, currency').in('id', c))).forEach((s: any) => { supMap[s.id] = s; });
        const projMap: Record<string, any> = {}; await fillProjects(sb, projMap, Object.values(orders).map((o: any) => o.project_id));
        if (args.supplier) rows = rows.filter((r) => supMap[orders[r.import_order_id]?.supplier_id]);
        if (!args.include_paid) rows = rows.filter((r) => num(r.balance) > 0.009 && r.payment_status !== 'paid');
        const t0 = today();
        let out = rows.map((r) => {
          const o = orders[r.import_order_id];
          const due = r.payment_due_date ? dateOnly(r.payment_due_date) : null;
          return { invoice_no: r.invoice_no, type: r.invoice_type, date: r.invoice_date, supplier: supMap[o?.supplier_id]?.name || null, po_number: o?.po_number || null, project: projMap[o?.project_id]?.name || o?.project_name || null,
            currency: r.currency, payable: num(r.payable_amount), paid: num(r.paid_total), balance: num(r.balance), due_date: due, days_to_due: due ? daysBetween(t0, due) : null, overdue: !!(due && due < t0 && num(r.balance) > 0), status: r.payment_status, booked: !!r.booked };
        });
        if (args.overdue_only) out = out.filter((r) => r.overdue);
        if (args.due_within_days != null) out = out.filter((r) => r.days_to_due != null && r.days_to_due <= Number(args.due_within_days));
        out.sort((a, b) => (a.due_date || '9999').localeCompare(b.due_date || '9999'));
        const byCur: Record<string, { balance: number; overdue: number; invoices: number }> = {};
        out.forEach((r) => { const c = r.currency || '?'; byCur[c] = byCur[c] || { balance: 0, overdue: 0, invoices: 0 }; byCur[c].balance = round2(byCur[c].balance + r.balance); if (r.overdue) byCur[c].overdue = round2(byCur[c].overdue + r.balance); byCur[c].invoices += 1; });
        return { invoices: clip(out, limit), count: out.length, totals: { by_currency: byCur, overdue_count: out.filter((r) => r.overdue).length }, by_supplier: groupSum(out, (r) => `${r.supplier || '—'} [${r.currency}]`, { balance: (r) => r.balance }), url: '/finance/suppliers' };
      }

      // -------------------------------------------------------------------
      case 'list_suppliers': {
        let q = sb.from('suppliers').select('id, name, contact_name, currency, active, email, phone').order('name');
        if (args.query) q = q.ilike('name', `%${args.query}%`);
        const { data, error } = await q; if (error) throw new Error(error.message);
        let rows: any[] = data || [];
        if (!args.include_inactive) rows = rows.filter((s) => s.active !== false);
        const { data: pos } = await sb.from('import_orders').select('supplier_id, status, cancelled_at');
        const counts: Record<string, number> = {}; (pos || []).forEach((o: any) => { if (o.status !== 'cancelled' && !o.cancelled_at) counts[o.supplier_id] = (counts[o.supplier_id] || 0) + 1; });
        return { suppliers: rows.map((s) => ({ name: s.name, contact: s.contact_name || null, currency: s.currency, email: s.email || null, phone: s.phone || null, active: s.active !== false, purchase_orders: counts[s.id] || 0 })), count: rows.length, url: '/suppliers' };
      }

      default:
        return null;
    }
  } catch (e: any) {
    return rlsOrError(e);
  }
}
