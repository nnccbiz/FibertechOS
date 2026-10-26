/**
 * Roxy's cross-cut ("insight") read tools — sales, customers, orders,
 * deliveries and finance sliced any way the user asks: by DN/PN/SN, product
 * family, project, customer, status, date range, with server-side totals and
 * group-by so "how much in total" is exact even when the row list is clipped.
 *
 * Same contract as the base tool belt: every query runs with the USER's
 * Supabase client (RLS decides what they see), read-only, no import tables.
 */
import { SchemaType, type FunctionDeclaration } from '@google/generative-ai';
import { isLengthBased } from '@/lib/pricing';

// ---------------------------------------------------------------------------
// Shared filter vocabulary (the same parameter names on every tool)
// ---------------------------------------------------------------------------

const F = {
  dn: { type: SchemaType.NUMBER, description: 'קוטר DN במ"מ (למשל 560). משווה למספר שבתוך dn_size.' },
  dn_min: { type: SchemaType.NUMBER, description: 'קוטר מינימלי (כולל) — לטווח קטרים' },
  dn_max: { type: SchemaType.NUMBER, description: 'קוטר מקסימלי (כולל)' },
  pn: { type: SchemaType.NUMBER, description: 'דרג לחץ PN (למשל 10)' },
  sn: { type: SchemaType.NUMBER, description: 'קשיחות SN (למשל 10000)' },
  product: { type: SchemaType.STRING, description: 'טקסט חופשי בשם המוצר (למשל "רוקר", "Flowtite", "מחבר קיר")' },
  family: { type: SchemaType.STRING, description: 'משפחת פריט: צינור / רוקר / מחבר / מחבר קיר / ברך / אוגן / מעבר / חיוץ / מצוף / אחר' },
  project: { type: SchemaType.STRING, description: 'שם פרויקט (או חלק), יזם או עיר' },
  customer: { type: SchemaType.STRING, description: 'שם לקוח (או חלק)' },
  date_from: { type: SchemaType.STRING, description: 'מתאריך, YYYY-MM-DD (כולל)' },
  date_to: { type: SchemaType.STRING, description: 'עד תאריך, YYYY-MM-DD (כולל)' },
  limit: { type: SchemaType.NUMBER, description: 'כמה שורות להחזיר לקריאה (ברירת מחדל 25, מקסימום 60). הסיכומים (totals) תמיד על כל ההתאמות.' },
} as const;

export const INSIGHT_FUNCTION_DECLARATIONS: FunctionDeclaration[] = [
  {
    name: 'search_quote_items',
    description: `חיפוש בשורות הפריטים של הצעות המחיר — החיתוך לפי מוצר: קוטר DN, PN, SN, שם מוצר, משפחה, פרויקט, לקוח, סטטוס ההצעה וטווח תאריכים.
עונה על: "למי נתנו הצעה לקוטר 560?", "מה המחיר האחרון ל-DN800 PN10?", "כמה מטר DN2000 הצענו ב-2026?", "טווח מחירים למטר של DN600 בהצעות חתומות", "אילו הצעות כוללות רוקרים", "אחוז רווח ממוצע על צינורות מול אביזרים".
מחזיר שורות + totals (מספר שורות, סה"כ כמות, סה"כ ₪, מחיר מינ/מקס/ממוצע משוקלל, רווח ממוצע) + פילוח לפי group_by.`,
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        ...F,
        quote_status: { type: SchemaType.STRING, description: 'סטטוסים מופרדים בפסיק: draft,sent,signed,rejected,expired. ריק = הכל. ל"מה הצענו" השתמשי ב-sent,signed; ל"מה נמכר" — signed בלבד.' },
        group_by: { type: SchemaType.STRING, description: 'פילוח הסיכומים: project / customer / quote / dn / family / month / status' },
        sort: { type: SchemaType.STRING, description: 'סדר שורות: date_desc (ברירת מחדל) / price_asc / price_desc / qty_desc' },
      },
    },
  },
  {
    name: 'search_quotes',
    description: `חיפוש הצעות מחיר (ברמת ההצעה) עם כל החיתוכים: סטטוס, פרויקט, לקוח, טווח תאריכים, סכום מינימלי, הנחות, מטבע זר, צפיות (מי פתח את הקישור), גרסאות, פג-תוקף-ולא-חודש, סיבות דחייה.
עונה על: "אילו הצעות נשלחו ולא נחתמו", "פג תוקפן בחודש האחרון ולא חודשו", "כמה נדחו השנה ולמה", "סכום הצעות פתוחות לפי לקוח", "נשלחו לפני 14 יום ואף אחד לא צפה", "כמה גרסאות היו להצעה של P069", "יחס המרה לפי רבעון".
מחזיר שורות + totals + פילוח לפי group_by, וגם conversion (כמה נשלחו/נחתמו/נדחו בתוך התוצאה).`,
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        status: { type: SchemaType.STRING, description: 'סטטוסים מופרדים בפסיק (draft,sent,signed,rejected,expired). ריק = הכל' },
        project: F.project,
        customer: F.customer,
        date_from: F.date_from,
        date_to: F.date_to,
        date_field: { type: SchemaType.STRING, description: 'על איזה תאריך לסנן: sent (ברירת מחדל — תאריך הוצאה, או יצירה לטיוטות) / created / valid_until' },
        min_total: { type: SchemaType.NUMBER, description: 'סכום מינימלי בש"ח' },
        has_discount: { type: SchemaType.BOOLEAN, description: 'רק הצעות עם הנחה כללית (% או סכום)' },
        min_discount_pct: { type: SchemaType.NUMBER, description: 'הנחה כללית מינימלית ב-%' },
        foreign_currency: { type: SchemaType.BOOLEAN, description: 'רק הצעות במטבע זר (USD/EUR)' },
        viewed: { type: SchemaType.BOOLEAN, description: 'true = רק הצעות שנצפו דרך קישור השיתוף; false = רק שלא נצפו' },
        sent_before_days: { type: SchemaType.NUMBER, description: 'רק הצעות שנשלחו לפני יותר מ-N ימים' },
        expired_not_renewed: { type: SchemaType.BOOLEAN, description: 'רק הצעות שפג תוקפן ואין להן גרסה/הצעה חדשה יותר באותו פרויקט' },
        quote_number: { type: SchemaType.STRING, description: 'מספר הצעה או חלק ממנו (למשל P069) — מחזיר את כל הגרסאות' },
        group_by: { type: SchemaType.STRING, description: 'פילוח: customer / project / month / quarter / status / lost_reason' },
        limit: F.limit,
      },
    },
  },
  {
    name: 'get_quote',
    description: 'פירוט מלא של הצעת מחיר אחת: כותרת, פריטים, הנחות, תנאי תשלום ואספקה, צפיות, כל הגרסאות של אותה הצעה (עם השוואת סכומים), הזמנת לקוח וחשבוניות שנגזרו ממנה. העבירי quote_number (למשל HM-201026-P069-V02) או quote_id.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        quote_id: { type: SchemaType.STRING, description: 'id ההצעה' },
        quote_number: { type: SchemaType.STRING, description: 'מספר ההצעה המלא או חלקו' },
      },
    },
  },
  {
    name: 'customer_stats',
    description: `דירוגים וסטטיסטיקות על לקוחות ומתכננים. metric:
top_signed — לקוחות לפי מספר/סכום הצעות חתומות; never_signed — לקוחות שקיבלו הצעות ולא חתמו אף פעם; conversion — יחס המרה לפי לקוח; planners — משרדי תכנון לפי מספר פרויקטים; developers — יזמים לפי מספר פרויקטים; history — היסטוריית ההצעות של לקוח אחד (customer חובה).`,
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        metric: { type: SchemaType.STRING, description: 'top_signed / never_signed / conversion / planners / developers / history' },
        customer: F.customer,
        date_from: F.date_from,
        date_to: F.date_to,
        limit: F.limit,
      },
      required: ['metric'],
    },
  },
  {
    name: 'search_orders',
    description: `הזמנות לקוח (אחרי חתימה — ייצור ואספקה): סטטוס, מ"ס, פרויקט, לקוח, איחור מול זמן האספקה שהובטח בהצעה, ביטולים.
עונה על: "אילו הזמנות בייצור ומה מועד האספקה הצפוי", "אילו הזמנות באיחור", "מה מספר המ"ס של פרויקט X", "אילו הזמנות בוטלו השנה ולמה".`,
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        status: { type: SchemaType.STRING, description: 'pending / confirmed / in_production / delivered / completed / cancelled — מופרדים בפסיק. ריק = הכל חוץ מבוטלות' },
        project: F.project,
        customer: F.customer,
        ms_number: { type: SchemaType.STRING, description: 'מספר מ"ס (או חלק)' },
        late_only: { type: SchemaType.BOOLEAN, description: 'רק הזמנות שעברו את מועד האספקה המחושב ולא סופקו' },
        include_cancelled: { type: SchemaType.BOOLEAN, description: 'לכלול גם הזמנות שבוטלו' },
        date_from: F.date_from,
        date_to: F.date_to,
        limit: F.limit,
      },
    },
  },
  {
    name: 'search_deliveries',
    description: `תעודות משלוח ללקוח: לפי פרויקט, לקוח, תאריך, חתומות/לא, הופקה חשבונית/לא.
עונה על: "אילו תעודות נחתמו באתר ועדיין לא הופקה חשבונית", "מה סופק ללקוח X בחודש האחרון", "כמה תעודות משלוח יצאו החודש".`,
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        project: F.project,
        customer: F.customer,
        signed: { type: SchemaType.BOOLEAN, description: 'true = חתומות בלבד, false = לא חתומות' },
        invoiced: { type: SchemaType.BOOLEAN, description: 'true = הופקה חשבונית, false = עדיין בלי חשבונית' },
        date_from: F.date_from,
        date_to: F.date_to,
        group_by: { type: SchemaType.STRING, description: 'month / customer / project' },
        limit: F.limit,
      },
    },
  },
  {
    name: 'finance_overview',
    description: `תמונות כספים. view:
aging — גיול חובות פתוחים (שוטף / 1-30 / 31-60 / 61-90 / 90+) לפי לקוח, עם סינון min_days (למשל 60 = פיגור מעל 60 יום);
revenue_by_month — הכנסות לפי חודש = סכומי הצעות שנחתמו (לפי חודש ההוצאה), בלי פרויקטים שבוטלו, לשנה נתונה;
inflow_forecast — תזרים כניסות צפוי לפי חודש פירעון של חשבוניות פתוחות.
(יציאות לספקים ותשלומי ספק — במסך הכספים, לא דרך הכלי הזה.)`,
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        view: { type: SchemaType.STRING, description: 'aging / revenue_by_month / inflow_forecast' },
        customer: F.customer,
        year: { type: SchemaType.NUMBER, description: 'שנה (ל-revenue_by_month; ברירת מחדל השנה הנוכחית)' },
        min_days: { type: SchemaType.NUMBER, description: 'ל-aging: רק חובות בפיגור של לפחות N ימים' },
        months_ahead: { type: SchemaType.NUMBER, description: 'ל-inflow_forecast: כמה חודשים קדימה (ברירת מחדל 3)' },
      },
      required: ['view'],
    },
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const clip = (rows: any[] | null | undefined, n = 25) => (rows || []).slice(0, Math.min(Math.max(n, 1), 60));
const num = (v: any) => { const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(/[^\d.-]/g, '')); return Number.isFinite(n) ? n : 0; };
const round2 = (n: number) => Math.round(n * 100) / 100;
const dateOnly = (v: any) => (v ? String(v).slice(0, 10) : null);
const monthKey = (v: any) => (v ? String(v).slice(0, 7) : 'ללא תאריך');
const quarterKey = (v: any) => { if (!v) return 'ללא תאריך'; const d = new Date(v); return `${d.getFullYear()}-Q${Math.floor(d.getMonth() / 3) + 1}`; };
const daysBetween = (a: string | Date, b: string | Date) => Math.floor((new Date(b).getTime() - new Date(a).getTime()) / 86400000);
const splitList = (s: any) => String(s || '').split(',').map((x) => x.trim()).filter(Boolean);

/** DN as a number from "800" / "DN800" / "DN 800 PN10" (first 3-4 digit run). */
function dnOf(v: any): number | null {
  if (v == null) return null;
  if (typeof v === 'number') return v;
  const m = String(v).match(/\d{2,4}/);
  return m ? parseInt(m[0], 10) : null;
}

/** Product family from the name — the procurement anomaly check uses the same keyword logic. */
export function familyOf(name: string): string {
  const n = (name || '').toLowerCase();
  if (/rocker|roker|רוקר|נזיר/.test(n)) return /צף|float|מצוף|buoy/.test(n) ? 'מצוף' : 'רוקר';
  if (/מצוף|buoy/.test(n)) return 'מצוף';
  if (/pipe|צינור|צנרת/.test(n)) return 'צינור';
  if (/wall|קיר/.test(n) && /coupling|מחבר/.test(n)) return 'מחבר קיר';
  if (/coupling|מחבר|מצמד/.test(n)) return 'מחבר';
  if (/elbow|bend|ברך|קשת/.test(n)) return 'ברך';
  if (/flange|אוגן/.test(n)) return 'אוגן';
  if (/reducer|מעבר/.test(n)) return 'מעבר';
  if (/spacer|חיוץ/.test(n)) return 'חיוץ';
  return 'אחר';
}

/** Page through PostgREST's 1000-row cap. `build` must return a fresh query each call. */
async function fetchAll(build: () => any): Promise<any[]> {
  const out: any[] = [];
  const PAGE = 1000;
  for (let from = 0; from < 20000; from += PAGE) {
    const { data, error } = await build().range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    out.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

/** `.in()` over many ids without blowing the URL length. */
async function inChunks(ids: string[], build: (chunk: string[]) => any): Promise<any[]> {
  const out: any[] = [];
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error } = await build(ids.slice(i, i + 100));
    if (error) throw new Error(error.message);
    out.push(...(data || []));
  }
  return out;
}

async function projectsByTerm(sb: any, term?: string): Promise<Record<string, any>> {
  let q = sb.from('projects').select('id, name, developer_name, planning_office, city, realization_status, customer_id');
  if (term) q = q.or(`name.ilike.%${term}%,developer_name.ilike.%${term}%,city.ilike.%${term}%`);
  const rows = await fetchAll(() => q);
  const map: Record<string, any> = {};
  rows.forEach((p: any) => { map[p.id] = p; });
  return map;
}

async function customersByTerm(sb: any, term?: string): Promise<Record<string, any>> {
  let q = sb.from('clients').select('id, name, city');
  if (term) q = q.ilike('name', `%${term}%`);
  const rows = await fetchAll(() => q);
  const map: Record<string, any> = {};
  rows.forEach((c: any) => { map[c.id] = c; });
  return map;
}

function inRange(d: string | null, from?: string, to?: string) {
  if (!from && !to) return true;
  if (!d) return false;
  if (from && d < from) return false;
  if (to && d > to) return false;
  return true;
}

/** Group rows and sum numeric fields per group. */
function groupSum(rows: any[], keyFn: (r: any) => string, sums: Record<string, (r: any) => number>) {
  const g: Record<string, any> = {};
  rows.forEach((r) => {
    const k = keyFn(r) || '—';
    if (!g[k]) { g[k] = { key: k, count: 0 }; Object.keys(sums).forEach((s) => { g[k][s] = 0; }); }
    g[k].count += 1;
    Object.entries(sums).forEach(([s, fn]) => { g[k][s] = round2(g[k][s] + fn(r)); });
  });
  return Object.values(g).sort((a: any, b: any) => (b.total_ils ?? b.count) - (a.total_ils ?? a.count));
}

/** Quote "date" for filtering/sorting: issue date, falling back to creation for drafts. */
const quoteDate = (q: any) => dateOnly(q.sent_at || q.created_at);
/** Version number from "…-V02"; base number without the suffix. */
const versionOf = (qn: string | null) => { const m = (qn || '').match(/-V(\d+)$/); return m ? parseInt(m[1], 10) : null; };
const baseNumberOf = (qn: string | null) => (qn || '').replace(/-V\d+$/, '');

const QUOTE_COLS = 'id, project_id, customer_id, quote_number, client_name, status, total_amount, currency, fx_rate, global_discount_pct, discount_amount, sent_at, valid_until, created_at, updated_at, lost_reason, payment_terms, delivery_time, tier';

/** Load quotes with the shared header filters resolved to project/customer maps. */
async function loadQuotes(sb: any, args: any, statuses?: string[]) {
  const [projMap, custMap] = await Promise.all([projectsByTerm(sb, args.project), customersByTerm(sb, args.customer)]);
  const projIds = args.project ? Object.keys(projMap) : null;
  const custIds = args.customer ? Object.keys(custMap) : null;
  if ((projIds && !projIds.length) || (custIds && !custIds.length)) return { quotes: [] as any[], projMap, custMap };

  let quotes = await fetchAll(() => {
    let q = sb.from('quotes').select(QUOTE_COLS).order('created_at', { ascending: false });
    if (statuses?.length) q = q.in('status', statuses);
    if (projIds && projIds.length <= 100) q = q.in('project_id', projIds);
    return q;
  });
  if (projIds && projIds.length > 100) quotes = quotes.filter((q: any) => projMap[q.project_id]);
  if (custIds) {
    // Customer match: the quote's own customer_id, the project's winning customer, or the typed client_name.
    const t = String(args.customer).toLowerCase();
    quotes = quotes.filter((q: any) => custMap[q.customer_id] || custMap[projMap[q.project_id]?.customer_id] || (q.client_name || '').toLowerCase().includes(t));
  }
  // Fill maps for projects/customers we didn't pre-filter on.
  if (!args.project) {
    const ids = Array.from(new Set(quotes.map((q: any) => q.project_id).filter(Boolean))) as string[];
    const missing = ids.filter((id) => !projMap[id]);
    if (missing.length) (await inChunks(missing, (c) => sb.from('projects').select('id, name, developer_name, planning_office, city, realization_status, customer_id').in('id', c))).forEach((p: any) => { projMap[p.id] = p; });
  }
  if (!args.customer) {
    const ids = Array.from(new Set(quotes.flatMap((q: any) => [q.customer_id, projMap[q.project_id]?.customer_id]).filter(Boolean))) as string[];
    const missing = ids.filter((id) => !custMap[id]);
    if (missing.length) (await inChunks(missing, (c) => sb.from('clients').select('id, name, city').in('id', c))).forEach((cl: any) => { custMap[cl.id] = cl; });
  }
  return { quotes, projMap, custMap };
}

const customerNameOf = (q: any, projMap: any, custMap: any) =>
  custMap[q.customer_id]?.name || custMap[projMap[q.project_id]?.customer_id]?.name || q.client_name || null;

/** Promised delivery in calendar days from the quote's free-text delivery_time ("70 ימי עבודה…", "8 שבועות", "45 ימים"). Default 70 working days ≈ 98 calendar days. */
function promisedDays(deliveryTime: string | null | undefined): { days: number; basis: string } {
  const t = deliveryTime || '';
  const m = t.match(/(\d+)\s*(ימי עבודה|ימי עסקים|ימים|יום|שבועות|שבוע|weeks?|working days|days?)/i);
  if (!m) return { days: 98, basis: 'ברירת מחדל: 70 ימי עבודה' };
  const n = parseInt(m[1], 10);
  const unit = m[2].toLowerCase();
  if (/שבוע|week/.test(unit)) return { days: n * 7, basis: `${n} שבועות` };
  if (/עבודה|עסקים|working/.test(unit)) return { days: Math.round(n * 1.4), basis: `${n} ימי עבודה` };
  return { days: n, basis: `${n} ימים` };
}

// ---------------------------------------------------------------------------
// Executors
// ---------------------------------------------------------------------------

/** Returns null when `name` is not an insight tool (caller falls through to its own switch). */
export async function executeInsightTool(sb: any, name: string, args: Record<string, any>): Promise<Record<string, any> | null> {
  const limit = Number(args.limit) || 25;
  try {
    switch (name) {
      // -------------------------------------------------------------------
      case 'search_quote_items': {
        const statuses = splitList(args.quote_status);
        const { quotes, projMap, custMap } = await loadQuotes(sb, args, statuses);
        const dated = quotes.filter((q: any) => inRange(quoteDate(q), args.date_from, args.date_to));
        if (!dated.length) return { items: [], count: 0, totals: null, note: 'לא נמצאו הצעות שעונות לסינון' };
        const qById: Record<string, any> = {};
        dated.forEach((q: any) => { qById[q.id] = q; });

        let items = await inChunks(Object.keys(qById), (c) =>
          sb.from('quote_items').select('id, quote_id, product_name, dn_size, pn, sn, length_m, quantity, unit, cost_price, unit_price, total_price, discount_pct, notes').in('quote_id', c));

        const fam = args.family ? String(args.family).trim() : null;
        const prod = args.product ? String(args.product).toLowerCase() : null;
        items = items.filter((it: any) => {
          const dn = dnOf(it.dn_size) ?? dnOf(it.product_name);
          if (args.dn != null && dn !== Number(args.dn)) return false;
          if (args.dn_min != null && (dn == null || dn < Number(args.dn_min))) return false;
          if (args.dn_max != null && (dn == null || dn > Number(args.dn_max))) return false;
          if (args.pn != null && num(it.pn) !== Number(args.pn)) return false;
          if (args.sn != null && num(it.sn) !== Number(args.sn)) return false;
          if (prod && !(it.product_name || '').toLowerCase().includes(prod)) return false;
          if (fam && familyOf(it.product_name) !== fam) return false;
          return true;
        });

        const rows = items.map((it: any) => {
          const q = qById[it.quote_id];
          const fx = q.currency && q.currency !== 'ILS' && num(q.fx_rate) > 0 ? num(q.fx_rate) : null;
          const unitPrice = num(it.unit_price);
          const qty = num(it.quantity);
          const lengthBased = isLengthBased(null, it.product_name);
          const len = num(it.length_m);
          return {
            quote_number: q.quote_number,
            quote_status: q.status,
            date: quoteDate(q),
            project: projMap[q.project_id]?.name || null,
            project_url: q.project_id ? `/projects/${q.project_id}` : null,
            customer: customerNameOf(q, projMap, custMap),
            product_name: it.product_name,
            family: familyOf(it.product_name),
            dn: dnOf(it.dn_size) ?? dnOf(it.product_name),
            pn: it.pn ?? null,
            sn: it.sn ?? null,
            length_m: len || null,
            quantity: qty,
            unit: it.unit,
            units_count: lengthBased && len > 0 ? round2(qty / len) : null,
            unit_price_ils: unitPrice,
            unit_price_quote_currency: fx ? round2(unitPrice / fx) : null,
            quote_currency: q.currency || 'ILS',
            line_total_ils: round2(qty * unitPrice),
            cost_price_ils: num(it.cost_price) || null,
            margin_pct: unitPrice > 0 && num(it.cost_price) > 0 ? round2(((unitPrice - num(it.cost_price)) / unitPrice) * 100) : null,
            line_discount_pct: num(it.discount_pct) || null,
          };
        });

        const sort = String(args.sort || 'date_desc');
        rows.sort((a: any, b: any) =>
          sort === 'price_asc' ? a.unit_price_ils - b.unit_price_ils
          : sort === 'price_desc' ? b.unit_price_ils - a.unit_price_ils
          : sort === 'qty_desc' ? b.quantity - a.quantity
          : (b.date || '').localeCompare(a.date || ''));

        const totalQty = rows.reduce((s: number, r: any) => s + r.quantity, 0);
        const totalIls = rows.reduce((s: number, r: any) => s + r.line_total_ils, 0);
        const priced = rows.filter((r: any) => r.unit_price_ils > 0);
        const margins = rows.filter((r: any) => r.margin_pct != null);
        const meters = rows.filter((r: any) => /מטר|^m$/i.test(r.unit || '')).reduce((s: number, r: any) => s + r.quantity, 0);
        const totals = {
          lines: rows.length,
          quotes: new Set(rows.map((r: any) => r.quote_number)).size,
          projects: new Set(rows.map((r: any) => r.project)).size,
          total_quantity: round2(totalQty),
          total_meters: round2(meters),
          total_ils: round2(totalIls),
          unit_price_ils: priced.length ? {
            min: Math.min(...priced.map((r: any) => r.unit_price_ils)),
            max: Math.max(...priced.map((r: any) => r.unit_price_ils)),
            weighted_avg: round2(priced.reduce((s: number, r: any) => s + r.line_total_ils, 0) / Math.max(1, priced.reduce((s: number, r: any) => s + r.quantity, 0))),
            latest: [...priced].sort((a: any, b: any) => (b.date || '').localeCompare(a.date || ''))[0]?.unit_price_ils ?? null,
          } : null,
          avg_margin_pct: margins.length ? round2(margins.reduce((s: number, r: any) => s + r.margin_pct, 0) / margins.length) : null,
        };

        const gb = String(args.group_by || '');
        const keyFn: Record<string, (r: any) => string> = {
          project: (r) => r.project || '—', customer: (r) => r.customer || '—', quote: (r) => r.quote_number || '—',
          dn: (r) => (r.dn != null ? `DN${r.dn}` : '—'), family: (r) => r.family, month: (r) => monthKey(r.date), status: (r) => r.quote_status,
        };
        const groups = keyFn[gb] ? groupSum(rows, keyFn[gb], {
          total_quantity: (r) => r.quantity, total_ils: (r) => r.line_total_ils,
          avg_margin_pct: (r) => 0,
        }).map((g: any) => {
          const members = rows.filter((r: any) => keyFn[gb](r) === g.key && r.margin_pct != null);
          return { ...g, avg_margin_pct: members.length ? round2(members.reduce((s: number, r: any) => s + r.margin_pct, 0) / members.length) : null };
        }) : undefined;

        return {
          items: clip(rows, limit), count: rows.length, totals, groups,
          note: rows.length > limit ? `מוצגות ${Math.min(limit, 60)} מתוך ${rows.length} שורות — הסיכומים כוללים הכול.` : undefined,
        };
      }

      // -------------------------------------------------------------------
      case 'search_quotes': {
        const statuses = splitList(args.status);
        const { quotes, projMap, custMap } = await loadQuotes(sb, args, statuses);
        const field = String(args.date_field || 'sent');
        const dateOf = (q: any) => field === 'created' ? dateOnly(q.created_at) : field === 'valid_until' ? dateOnly(q.valid_until) : quoteDate(q);
        let rows = quotes.filter((q: any) => inRange(dateOf(q), args.date_from, args.date_to));
        if (args.quote_number) { const t = String(args.quote_number).toLowerCase(); rows = rows.filter((q: any) => (q.quote_number || '').toLowerCase().includes(t)); }
        if (args.min_total != null) rows = rows.filter((q: any) => num(q.total_amount) >= Number(args.min_total));
        if (args.has_discount) rows = rows.filter((q: any) => num(q.global_discount_pct) > 0 || num(q.discount_amount) > 0);
        if (args.min_discount_pct != null) rows = rows.filter((q: any) => num(q.global_discount_pct) >= Number(args.min_discount_pct));
        if (args.foreign_currency) rows = rows.filter((q: any) => q.currency && q.currency !== 'ILS');
        const today = new Date().toISOString().slice(0, 10);
        if (args.sent_before_days != null) rows = rows.filter((q: any) => q.sent_at && daysBetween(q.sent_at, today) > Number(args.sent_before_days));

        // Share-link views — optional signal: if RLS hides quote_views for this
        // user the answer still goes out, just without view counts.
        const views: Record<string, { count: number; last: string | null }> = {};
        let viewsAvailable = true;
        if (rows.length) {
          try {
            const vs = await inChunks(rows.map((q: any) => q.id), (c) => sb.from('quote_views').select('quote_id, viewed_at').in('quote_id', c));
            vs.forEach((v: any) => { const cur = views[v.quote_id] || { count: 0, last: null }; cur.count += 1; if (!cur.last || v.viewed_at > cur.last) cur.last = v.viewed_at; views[v.quote_id] = cur; });
          } catch { viewsAvailable = false; }
        }
        if (args.viewed === true) rows = rows.filter((q: any) => views[q.id]);
        if (args.viewed === false) rows = rows.filter((q: any) => !views[q.id]);

        // "Expired and not renewed": no newer quote (any status) on the same project.
        if (args.expired_not_renewed) {
          const newestByProject: Record<string, string> = {};
          quotes.forEach((q: any) => { const d = q.created_at || ''; if (!newestByProject[q.project_id] || d > newestByProject[q.project_id]) newestByProject[q.project_id] = d; });
          rows = rows.filter((q: any) => (q.status === 'expired' || (q.status === 'sent' && q.valid_until && q.valid_until < today)) && newestByProject[q.project_id] === q.created_at);
        }

        const out = rows.map((q: any) => ({
          quote_id: q.id,
          quote_number: q.quote_number,
          version: versionOf(q.quote_number),
          status: q.status,
          date: dateOf(q),
          sent_at: dateOnly(q.sent_at),
          valid_until: q.valid_until,
          project: projMap[q.project_id]?.name || null,
          project_url: q.project_id ? `/projects/${q.project_id}` : null,
          quote_url: q.project_id ? `/projects/${q.project_id}/quote/${q.id}` : null,
          customer: customerNameOf(q, projMap, custMap),
          total_ils: num(q.total_amount),
          currency: q.currency || 'ILS',
          fx_rate: q.fx_rate ?? null,
          global_discount_pct: num(q.global_discount_pct) || null,
          discount_amount: num(q.discount_amount) || null,
          views: views[q.id]?.count || 0,
          last_viewed: dateOnly(views[q.id]?.last),
          lost_reason: q.lost_reason || null,
          tier: q.tier || null,
        }));

        const byStatus: Record<string, number> = {};
        out.forEach((r: any) => { byStatus[r.status] = (byStatus[r.status] || 0) + 1; });
        const issued = (byStatus.sent || 0) + (byStatus.signed || 0) + (byStatus.rejected || 0) + (byStatus.expired || 0);
        const gb = String(args.group_by || '');
        const keyFn: Record<string, (r: any) => string> = {
          customer: (r) => r.customer || '—', project: (r) => r.project || '—', month: (r) => monthKey(r.date),
          quarter: (r) => quarterKey(r.date), status: (r) => r.status, lost_reason: (r) => r.lost_reason || '—',
        };
        const groups = keyFn[gb] ? groupSum(out, keyFn[gb], { total_ils: (r) => r.total_ils }).map((g: any) => {
          const m = out.filter((r: any) => keyFn[gb](r) === g.key);
          const signed = m.filter((r: any) => r.status === 'signed').length;
          const iss = m.filter((r: any) => r.status !== 'draft').length;
          return { ...g, signed, issued: iss, conversion_pct: iss ? round2((signed / iss) * 100) : null };
        }) : undefined;

        return {
          quotes: clip(out, limit), count: out.length,
          totals: { total_ils: round2(out.reduce((s: number, r: any) => s + r.total_ils, 0)), by_status: byStatus,
            conversion_pct: issued ? round2(((byStatus.signed || 0) / issued) * 100) : null },
          groups,
          note: [
            out.length > limit ? `מוצגות ${Math.min(limit, 60)} מתוך ${out.length} הצעות — הסיכומים כוללים הכול.` : null,
            !viewsAvailable ? 'נתוני צפיות לא זמינים למשתמש זה.' : null,
          ].filter(Boolean).join(' ') || undefined,
        };
      }

      // -------------------------------------------------------------------
      case 'get_quote': {
        let q: any = null;
        if (args.quote_id) ({ data: q } = await sb.from('quotes').select(QUOTE_COLS + ', disclaimer_text, notes, contact_snapshot').eq('id', args.quote_id).maybeSingle());
        else if (args.quote_number) {
          const { data } = await sb.from('quotes').select(QUOTE_COLS + ', disclaimer_text, notes, contact_snapshot').ilike('quote_number', `%${args.quote_number}%`).order('created_at', { ascending: false }).limit(5);
          q = (data || [])[0] || null;
          if ((data || []).length > 1 && !/-V\d+$/i.test(String(args.quote_number))) {
            // Several versions match a base number — report them all, detail the newest.
            q._siblings_hint = (data || []).map((x: any) => x.quote_number);
          }
        }
        if (!q) return { error: 'ההצעה לא נמצאה' };
        const base = baseNumberOf(q.quote_number);
        const [items, versions, views, orders, invoices, proj] = await Promise.all([
          sb.from('quote_items').select('product_name, dn_size, pn, sn, length_m, quantity, unit, cost_price, unit_price, discount_pct, notes, sort_order').eq('quote_id', q.id).order('sort_order'),
          base ? sb.from('quotes').select('id, quote_number, status, total_amount, sent_at, created_at').ilike('quote_number', `${base}%`).order('created_at') : Promise.resolve({ data: [] }),
          sb.from('quote_views').select('viewed_at, city').eq('quote_id', q.id).order('viewed_at', { ascending: false }).limit(10),
          sb.from('orders').select('id, order_number, ms_number, status, total_amount, created_at, cancelled_at, cancel_reason').eq('quote_id', q.id),
          sb.from('customer_invoices').select('invoice_number, invoice_type, total_amount, status, payment_due_date').eq('quote_id', q.id),
          q.project_id ? sb.from('projects').select('id, name, customer_id').eq('id', q.project_id).maybeSingle() : Promise.resolve({ data: null }),
        ]);
        const its = (items.data || []).map((it: any) => ({
          ...it, family: familyOf(it.product_name), dn: dnOf(it.dn_size) ?? dnOf(it.product_name),
          line_total_ils: round2(num(it.quantity) * num(it.unit_price)),
          margin_pct: num(it.unit_price) > 0 && num(it.cost_price) > 0 ? round2(((num(it.unit_price) - num(it.cost_price)) / num(it.unit_price)) * 100) : null,
        }));
        const vers = (versions.data || []).map((v: any, i: number, arr: any[]) => ({
          quote_number: v.quote_number, version: versionOf(v.quote_number), status: v.status, total_ils: num(v.total_amount), date: dateOnly(v.sent_at || v.created_at),
          delta_from_previous_ils: i > 0 ? round2(num(v.total_amount) - num(arr[i - 1].total_amount)) : null, is_this: v.id === q.id,
        }));
        return {
          quote: {
            quote_number: q.quote_number, status: q.status, date: quoteDate(q), valid_until: q.valid_until, tier: q.tier,
            project: proj.data?.name || null, project_url: q.project_id ? `/projects/${q.project_id}` : null,
            quote_url: q.project_id ? `/projects/${q.project_id}/quote/${q.id}` : null,
            customer: q.client_name || null, contact: q.contact_snapshot || null,
            total_ils: num(q.total_amount), currency: q.currency || 'ILS', fx_rate: q.fx_rate ?? null,
            global_discount_pct: num(q.global_discount_pct) || null, discount_amount: num(q.discount_amount) || null,
            payment_terms: q.payment_terms, delivery_time: q.delivery_time, notes: q.disclaimer_text || q.notes || null, lost_reason: q.lost_reason || null,
          },
          items: its, items_total_ils: round2(its.reduce((s: number, r: any) => s + r.line_total_ils, 0)),
          versions: vers, views: views.data || [], orders: orders.data || [], invoices: invoices.data || [],
          matched_versions: q._siblings_hint,
        };
      }

      // -------------------------------------------------------------------
      case 'customer_stats': {
        const metric = String(args.metric || 'top_signed');
        if (metric === 'planners' || metric === 'developers') {
          const projs = await fetchAll(() => sb.from('projects').select('id, name, planning_office, developer_name, realization_status, order_value, created_at'));
          const dated = projs.filter((p: any) => inRange(dateOnly(p.created_at), args.date_from, args.date_to));
          const key = metric === 'planners' ? 'planning_office' : 'developer_name';
          const groups = groupSum(dated.filter((p: any) => p[key]), (p) => p[key], { total_ils: (p) => num(p.order_value) })
            .map((g: any) => ({ ...g, projects: dated.filter((p: any) => p[key] === g.key).slice(0, 6).map((p: any) => p.name) }));
          return { metric, ranking: clip(groups, limit), count: groups.length };
        }
        if (metric === 'history' && !args.customer) return { error: 'ל-history חובה להעביר customer' };
        const { quotes, projMap, custMap } = await loadQuotes(sb, { customer: args.customer }, undefined);
        const rows = quotes.filter((q: any) => inRange(quoteDate(q), args.date_from, args.date_to) && q.status !== 'draft');
        const named = rows.map((q: any) => ({ ...q, customer: customerNameOf(q, projMap, custMap) || '—', project: projMap[q.project_id]?.name || null }));
        if (metric === 'history') {
          const out = named.sort((a: any, b: any) => (quoteDate(b) || '').localeCompare(quoteDate(a) || '')).map((q: any) => ({
            quote_number: q.quote_number, status: q.status, date: quoteDate(q), project: q.project, project_url: `/projects/${q.project_id}`, total_ils: num(q.total_amount), lost_reason: q.lost_reason || null,
          }));
          const by: Record<string, number> = {}; out.forEach((r: any) => { by[r.status] = (by[r.status] || 0) + 1; });
          return { metric, customer: args.customer, quotes: clip(out, limit), count: out.length, by_status: by, signed_total_ils: round2(out.filter((r: any) => r.status === 'signed').reduce((s: number, r: any) => s + r.total_ils, 0)) };
        }
        const groups = groupSum(named, (q) => q.customer, { total_ils: (q) => 0, signed_total_ils: (q) => (q.status === 'signed' ? num(q.total_amount) : 0) })
          .map((g: any) => {
            const m = named.filter((q: any) => q.customer === g.key);
            const signed = m.filter((q: any) => q.status === 'signed').length;
            return { customer: g.key, issued: m.length, signed, rejected: m.filter((q: any) => q.status === 'rejected').length, signed_total_ils: g.signed_total_ils, conversion_pct: round2((signed / m.length) * 100) };
          });
        let ranking = groups;
        if (metric === 'top_signed') ranking = groups.filter((g) => g.signed > 0).sort((a, b) => b.signed_total_ils - a.signed_total_ils || b.signed - a.signed);
        else if (metric === 'never_signed') ranking = groups.filter((g) => g.signed === 0).sort((a, b) => b.issued - a.issued);
        else if (metric === 'conversion') ranking = groups.sort((a, b) => b.conversion_pct - a.conversion_pct);
        return { metric, ranking: clip(ranking, limit), count: ranking.length };
      }

      // -------------------------------------------------------------------
      case 'search_orders': {
        const { quotes, projMap, custMap } = await loadQuotes(sb, args, undefined);
        const qById: Record<string, any> = {}; quotes.forEach((q: any) => { qById[q.id] = q; });
        const projFilter = args.project || args.customer ? new Set(quotes.map((q: any) => q.project_id)) : null;
        let orders = await fetchAll(() => sb.from('orders').select('id, project_id, quote_id, order_number, ms_number, status, total_amount, notes, created_at, updated_at, cancelled_at, cancel_reason').order('created_at', { ascending: false }));
        if (projFilter) orders = orders.filter((o: any) => projFilter.has(o.project_id));
        const statuses = splitList(args.status);
        if (statuses.length) orders = orders.filter((o: any) => statuses.includes(o.status));
        else if (!args.include_cancelled) orders = orders.filter((o: any) => o.status !== 'cancelled');
        if (args.ms_number) orders = orders.filter((o: any) => (o.ms_number || '').includes(String(args.ms_number)));
        orders = orders.filter((o: any) => inRange(dateOnly(o.created_at), args.date_from, args.date_to));
        const today = new Date().toISOString().slice(0, 10);
        const out = orders.map((o: any) => {
          const q = qById[o.quote_id];
          const promised = promisedDays(q?.delivery_time);
          const due = new Date(o.created_at); due.setDate(due.getDate() + promised.days);
          const dueStr = due.toISOString().slice(0, 10);
          const delivered = ['delivered', 'completed'].includes(o.status);
          return {
            order_number: o.order_number, ms_number: o.ms_number, status: o.status,
            project: projMap[o.project_id]?.name || null, project_url: `/projects/${o.project_id}`,
            customer: q ? customerNameOf(q, projMap, custMap) : null, quote_number: q?.quote_number || null,
            total_ils: num(o.total_amount), ordered_at: dateOnly(o.created_at),
            promised_delivery: promised.basis, expected_delivery: dueStr,
            days_late: !delivered && o.status !== 'cancelled' && dueStr < today ? daysBetween(dueStr, today) : 0,
            cancelled_at: dateOnly(o.cancelled_at), cancel_reason: o.cancel_reason || null,
          };
        });
        const rows = args.late_only ? out.filter((r: any) => r.days_late > 0) : out;
        const by: Record<string, number> = {}; rows.forEach((r: any) => { by[r.status] = (by[r.status] || 0) + 1; });
        return { orders: clip(rows, limit), count: rows.length, totals: { total_ils: round2(rows.reduce((s: number, r: any) => s + r.total_ils, 0)), by_status: by, late: rows.filter((r: any) => r.days_late > 0).length }, production_url: '/production' };
      }

      // -------------------------------------------------------------------
      case 'search_deliveries': {
        const projMap = await projectsByTerm(sb, args.project);
        const projIds = args.project ? Object.keys(projMap) : null;
        if (projIds && !projIds.length) return { deliveries: [], count: 0 };
        let rows = await fetchAll(() => {
          let q = sb.from('import_customer_deliveries').select('id, project_id, delivery_note_number, delivery_date, customer_name, quantity_summary, items, signed, signed_at, signer_name, sent_to_accounting_at, invoice_issued, invoice_issued_at, invoice_number, customer_invoice_id, created_at').order('delivery_date', { ascending: false });
          if (projIds && projIds.length <= 100) q = q.in('project_id', projIds);
          return q;
        });
        if (projIds && projIds.length > 100) rows = rows.filter((r: any) => projMap[r.project_id]);
        if (args.customer) { const t = String(args.customer).toLowerCase(); rows = rows.filter((r: any) => (r.customer_name || '').toLowerCase().includes(t)); }
        if (args.signed === true) rows = rows.filter((r: any) => r.signed || r.signed_at);
        if (args.signed === false) rows = rows.filter((r: any) => !(r.signed || r.signed_at));
        const invoiced = (r: any) => !!(r.customer_invoice_id || r.invoice_issued || r.invoice_issued_at);
        if (args.invoiced === true) rows = rows.filter(invoiced);
        if (args.invoiced === false) rows = rows.filter((r: any) => !invoiced(r));
        rows = rows.filter((r: any) => inRange(dateOnly(r.delivery_date || r.created_at), args.date_from, args.date_to));
        const missing = Array.from(new Set(rows.map((r: any) => r.project_id).filter((id: any) => id && !projMap[id]))) as string[];
        if (missing.length) (await inChunks(missing, (c) => sb.from('projects').select('id, name').in('id', c))).forEach((p: any) => { projMap[p.id] = p; });
        const out = rows.map((r: any) => ({
          delivery_note_number: r.delivery_note_number, date: dateOnly(r.delivery_date || r.created_at),
          project: projMap[r.project_id]?.name || null, project_url: r.project_id ? `/projects/${r.project_id}` : null,
          customer: r.customer_name || null,
          items: r.quantity_summary || (Array.isArray(r.items) ? r.items.slice(0, 8).map((it: any) => `${it.description || it.product_name || ''} ${it.quantity ?? ''}${it.unit ? ' ' + it.unit : ''}`.trim()).join(' · ') : null),
          signed: !!(r.signed || r.signed_at), signed_at: dateOnly(r.signed_at), signer: r.signer_name || null,
          sent_to_accounting_at: dateOnly(r.sent_to_accounting_at), invoiced: invoiced(r), invoice_number: r.invoice_number || null,
        }));
        const gb = String(args.group_by || '');
        const keyFn: Record<string, (r: any) => string> = { month: (r) => monthKey(r.date), customer: (r) => r.customer || '—', project: (r) => r.project || '—' };
        const groups = keyFn[gb] ? groupSum(out, keyFn[gb], {}) : undefined;
        return { deliveries: clip(out, limit), count: out.length, totals: { signed: out.filter((r: any) => r.signed).length, awaiting_invoice: out.filter((r: any) => r.signed && !r.invoiced).length }, groups, deliveries_url: '/deliveries' };
      }

      // -------------------------------------------------------------------
      case 'finance_overview': {
        const view = String(args.view || 'aging');
        const today = new Date().toISOString().slice(0, 10);
        if (view === 'revenue_by_month') {
          const year = Number(args.year) || new Date().getFullYear();
          const { quotes, projMap, custMap } = await loadQuotes(sb, { customer: args.customer }, ['signed']);
          const rows = quotes.filter((q: any) => projMap[q.project_id]?.realization_status !== 'בוטל' && (quoteDate(q) || '').startsWith(String(year)));
          const months: Record<string, { month: string; total_ils: number; quotes: number }> = {};
          rows.forEach((q: any) => { const k = monthKey(quoteDate(q)); months[k] = months[k] || { month: k, total_ils: 0, quotes: 0 }; months[k].total_ils = round2(months[k].total_ils + num(q.total_amount)); months[k].quotes += 1; });
          return {
            view, year, method: 'סכומי הצעות שנחתמו, לפי חודש ההוצאה (sent_at), ללא פרויקטים בסטטוס בוטל. ההצעות עצמן בש"ח לפני מע"מ.',
            months: Object.values(months).sort((a, b) => a.month.localeCompare(b.month)),
            total_ils: round2(rows.reduce((s: number, q: any) => s + num(q.total_amount), 0)), quotes: rows.length,
            top_customers: groupSum(rows.map((q: any) => ({ c: customerNameOf(q, projMap, custMap) || '—', t: num(q.total_amount) })), (r) => r.c, { total_ils: (r) => r.t }).slice(0, 8),
          };
        }
        // aging / inflow_forecast — open customer invoices (RLS: import view).
        const { data: inv, error } = await sb.from('customer_invoice_balances')
          .select('invoice_number, customer_id, project_id, invoice_type, total_amount, paid_total, balance, payment_due_date, status, issued_at')
          .in('status', ['open', 'partially_paid']);
        if (error) return { error: error.message };
        let rows = inv || [];
        const custIds = Array.from(new Set(rows.map((r: any) => r.customer_id).filter(Boolean))) as string[];
        const names: Record<string, string> = {};
        if (custIds.length) (await inChunks(custIds, (c) => sb.from('clients').select('id, name').in('id', c))).forEach((c: any) => { names[c.id] = c.name; });
        if (args.customer) { const t = String(args.customer).toLowerCase(); rows = rows.filter((r: any) => (names[r.customer_id] || '').toLowerCase().includes(t)); }
        const withAge = rows.map((r: any) => ({
          invoice_number: r.invoice_number, customer: names[r.customer_id] || '—', balance_ils: num(r.balance), due_date: r.payment_due_date,
          days_overdue: r.payment_due_date && r.payment_due_date < today ? daysBetween(r.payment_due_date, today) : 0,
        }));
        if (view === 'inflow_forecast') {
          const ahead = Number(args.months_ahead) || 3;
          const months: Record<string, number> = {};
          withAge.forEach((r: any) => { const k = r.due_date ? (r.due_date < today ? 'באיחור' : monthKey(r.due_date)) : 'ללא מועד'; months[k] = round2((months[k] || 0) + r.balance_ils); });
          const horizon = new Date(); horizon.setMonth(horizon.getMonth() + ahead);
          return { view, months_ahead: ahead, inflow_by_month: Object.entries(months).map(([month, total_ils]) => ({ month, total_ils })).sort((a, b) => a.month.localeCompare(b.month)), open_total_ils: round2(withAge.reduce((s: number, r: any) => s + r.balance_ils, 0)), note: 'כניסות בלבד (חשבוניות לקוח פתוחות לפי מועד פירעון). יציאות לספקים — במסך דוחות ותזרים.', url: '/finance/reports' };
        }
        const minDays = Number(args.min_days) || 0;
        const filtered = withAge.filter((r: any) => r.days_overdue >= minDays);
        const bucket = (d: number) => (d <= 0 ? 'שוטף' : d <= 30 ? '1-30' : d <= 60 ? '31-60' : d <= 90 ? '61-90' : '90+');
        const buckets: Record<string, number> = {}; filtered.forEach((r: any) => { const b = bucket(r.days_overdue); buckets[b] = round2((buckets[b] || 0) + r.balance_ils); });
        const byCustomer = groupSum(filtered, (r) => r.customer, { total_ils: (r) => r.balance_ils }).map((g: any) => ({ ...g, max_days_overdue: Math.max(...filtered.filter((r: any) => r.customer === g.key).map((r: any) => r.days_overdue)) }));
        return { view, min_days: minDays, buckets, by_customer: clip(byCustomer, limit), invoices: clip(filtered.sort((a: any, b: any) => b.days_overdue - a.days_overdue), limit), count: filtered.length, open_total_ils: round2(filtered.reduce((s: number, r: any) => s + r.balance_ils, 0)), url: '/finance/collections' };
      }

      default:
        return null;
    }
  } catch (e: any) {
    return { error: e?.message || 'שגיאה בהרצת הכלי' };
  }
}
