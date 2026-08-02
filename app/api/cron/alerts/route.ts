/**
 * GET /api/cron/alerts  — scheduled alert engine (Vercel Cron, daily).
 *
 * Scans the operational tables and seeds in-app alerts (the dashboard "משימות
 * לביצוע" list) for things that would otherwise be silently missed:
 *   1. quote sent > 7d ago with no answer          (sales follow-up)
 *   2. quote price validity within 3d / already passed (re-quote before signing)
 *   3. shipment ETA within 7d / already passed      (import readiness)
 *   4. auto-seeded import draft pending תפ"י review > 2d
 *   5. delivery sent to accounting > 7d, invoice not issued
 *   6. factory work line's material arrived from import (stamps + notifies)
 *   7. factory work line stuck in progress > 14d
 *   8. customer invoice past its payment due date, not collected yet —
 *      escalates weekly (dedup key carries the overdue-week bucket)
 *   8b. customer invoice due within 3 days (heads-up before the deadline)
 *   8c. collection follow-up: a logged next_action_date arrived
 *   9a. billing trigger — advance: quote signed with "מקדמה X%", no advance invoice
 *   9b. billing trigger — port arrival: shipment arrived on a port-anchored deal
 *       (goods detail from packing lines)
 *   9c. billing trigger — delivery: certificate signed, no invoice yet (goods
 *       detail from the certificate's items snapshot)
 *   10. supplier payment due within 7d (one-shot) / overdue (weekly escalation)
 *
 * Runs with the service-role admin client (it writes alerts across modules and
 * is not a model-driven write). Protected by CRON_SECRET: Vercel automatically
 * sends `Authorization: Bearer $CRON_SECRET` on cron invocations when that env
 * var is set, so an unauthenticated hit is rejected.
 *
 * De-dup WITHOUT a schema change: each alert's `type` encodes rule + entity
 * (`cron:<rule>:<id>`). Before inserting we load every existing `cron:%` type
 * (resolved or not) and skip ones already present — so a still-stale quote is
 * not re-alerted every day, and a resolved alert is not resurrected.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { effectiveBillingAnchor, effectiveAdvancePct, summarizeGoods } from '@/lib/billing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Candidate = { type: string; project_id: string | null; message: string };

export async function GET(req: NextRequest) {
  if (!process.env.CRON_SECRET || req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();
  const now = new Date();
  const ymd = (d: Date) => d.toISOString().slice(0, 10);
  const shift = (n: number) => new Date(now.getTime() + n * 86_400_000);
  const daysSince = (iso: string) => Math.floor((now.getTime() - new Date(iso).getTime()) / 86_400_000);
  const projName = (row: any) => row.projects?.name || row.project_name || null;
  const heDate = (d: string) => new Date(d).toLocaleDateString('he-IL');

  const candidates: Candidate[] = [];

  // Rule 0 — finality: a sent quote past its price validity becomes 'expired'
  // (previously computed ad-hoc per screen; never stamped).
  const { data: expiredNow } = await admin
    .from('quotes')
    .update({ status: 'expired' })
    .eq('status', 'sent')
    .lt('valid_until', ymd(now))
    .select('id');
  const expiredCount = (expiredNow || []).length;

  // Rule 1 — quote sent > 7 days ago, still awaiting an answer.
  const { data: stale } = await admin
    .from('quotes')
    .select('id, quote_number, project_id, sent_at, projects(name)')
    .eq('status', 'sent')
    .not('sent_at', 'is', null)
    .lt('sent_at', shift(-7).toISOString());
  for (const q of stale || []) {
    candidates.push({
      type: `cron:quote_stale:${q.id}`,
      project_id: q.project_id || null,
      message: `⏳ הצעה ${q.quote_number || ''}${projName(q) ? ` (${projName(q)})` : ''} נשלחה לפני ${daysSince(q.sent_at)} ימים ולא נענתה — כדאי לעשות מעקב.`,
    });
  }

  // Rule 2 — quote price validity within 3 days or already passed (still open).
  const { data: expiring } = await admin
    .from('quotes')
    .select('id, quote_number, project_id, valid_until, projects(name)')
    .eq('status', 'sent')
    .not('valid_until', 'is', null)
    .lte('valid_until', ymd(shift(3)));
  for (const q of expiring || []) {
    const passed = q.valid_until < ymd(now);
    candidates.push({
      type: `cron:quote_validity:${q.id}`,
      project_id: q.project_id || null,
      message: passed
        ? `⌛ תוקף המחיר בהצעה ${q.quote_number || ''}${projName(q) ? ` (${projName(q)})` : ''} פג ב-${heDate(q.valid_until)} — לרענן מחיר לפני חתימה או לסמן שפג תוקף.`
        : `⌛ תוקף המחיר בהצעה ${q.quote_number || ''}${projName(q) ? ` (${projName(q)})` : ''} עומד לפוג ב-${heDate(q.valid_until)} — כדאי לסגור או לשלוח הצעה מעודכנת.`,
    });
  }

  // Rule 3 — shipment ETA within 7 days or already passed.
  const { data: ships } = await admin
    .from('import_shipments')
    .select('id, vessel_name, bl_number, eta, status')
    .in('status', ['booked', 'sailing'])
    .not('eta', 'is', null)
    .lte('eta', ymd(shift(7)));
  for (const s of ships || []) {
    const label = s.vessel_name || s.bl_number || 'משלוח';
    candidates.push({
      type: `cron:shipment_eta:${s.id}`,
      project_id: null,
      message: s.eta < ymd(now)
        ? `🚢 משלוח ${label} היה אמור להגיע ב-${heDate(s.eta)} — לבדוק סטטוס.`
        : `🚢 משלוח ${label} צפוי להגיע ב-${heDate(s.eta)}.`,
    });
  }

  // Rule 4 — auto-seeded import draft still pending תפ"י release > 2 days.
  const { data: drafts } = await admin
    .from('import_orders')
    .select('id, project_id, project_name, created_at, projects(name)')
    .eq('status', 'draft')
    .eq('origin', 'auto_from_quote')
    .lt('created_at', shift(-2).toISOString());
  for (const o of drafts || []) {
    candidates.push({
      type: `cron:import_draft_pending:${o.id}`,
      project_id: o.project_id || null,
      message: `📋 טיוטת הזמנת יבוא${projName(o) ? ` (${projName(o)})` : ''} ממתינה לשחרור תפ"י כבר ${daysSince(o.created_at)} ימים.`,
    });
  }

  // Rule 5 — delivery sent to accounting > 7 days ago, invoice still not issued.
  const { data: pendingInv } = await admin
    .from('import_customer_deliveries')
    .select('id, project_id, delivery_note_number, sent_to_accounting_at')
    .eq('sent_to_accounting', true)
    .eq('invoice_issued', false)
    .lt('sent_to_accounting_at', shift(-7).toISOString());
  for (const d of pendingInv || []) {
    candidates.push({
      type: `cron:invoice_pending:${d.id}`,
      project_id: d.project_id || null,
      message: `🧾 תעודת משלוח ${d.delivery_note_number || ''} נשלחה להנה"ח לפני ${daysSince(d.sent_to_accounting_at)} ימים וטרם הופקה חשבונית — לבדוק במסך תעודות משלוח (/deliveries).`,
    });
  }

  // Rule 6 — factory work lines waiting for material: when the linked import
  // order has received goods covering the line's DN, stamp material_arrived
  // and tell the factory it can start.
  const { data: waitingWork } = await admin
    .from('production_work_items')
    .select('id, order_id, output_desc, dn')
    .eq('status', 'awaiting_material')
    .eq('material_arrived', false);
  if (waitingWork && waitingWork.length) {
    const orderIds = Array.from(new Set(waitingWork.map((w: any) => w.order_id)));
    const { data: prodOrders } = await admin.from('orders').select('id, quote_id, project_id, order_number').in('id', orderIds);
    const quoteIds = Array.from(new Set((prodOrders || []).map((o: any) => o.quote_id).filter(Boolean)));
    const { data: impOrders } = quoteIds.length
      ? await admin.from('import_orders').select('id, quote_id, status').in('quote_id', quoteIds)
      : { data: [] as any[] };
    const receivedImp = (impOrders || []).filter((o: any) => ['received', 'partially_received', 'closed'].includes(o.status));
    const impIds = receivedImp.map((o: any) => o.id);
    const { data: packLines } = impIds.length
      ? await admin.from('import_packing_lines').select('import_order_id, dn').in('import_order_id', impIds)
      : { data: [] as any[] };
    const dnsByImp: Record<string, Set<string>> = {};
    (packLines || []).forEach((pl: any) => {
      if (!dnsByImp[pl.import_order_id]) dnsByImp[pl.import_order_id] = new Set();
      if (pl.dn != null) dnsByImp[pl.import_order_id].add(String(pl.dn));
    });
    for (const w of waitingWork) {
      const po = (prodOrders || []).find((o: any) => o.id === w.order_id);
      if (!po?.quote_id) continue;
      const imp = receivedImp.find((o: any) => o.quote_id === po.quote_id);
      if (!imp) continue;
      const dnOk = w.dn == null || (dnsByImp[imp.id]?.has(String(w.dn)) ?? false);
      if (!dnOk) continue;
      await admin.from('production_work_items')
        .update({ material_arrived: true, material_arrived_at: now.toISOString() })
        .eq('id', w.id);
      candidates.push({
        type: `cron:material_arrived:${w.id}`,
        project_id: po.project_id || null,
        message: `🏭 החומר עבור "${w.output_desc}" (הזמנה ${po.order_number || ''}) הגיע מהיבוא — המפעל יכול להתחיל לעבוד.`,
      });
    }
  }

  // Rule 7 — a work line stuck in progress for more than 14 days.
  const { data: stuckWork } = await admin
    .from('production_work_items')
    .select('id, order_id, output_desc, started_at')
    .eq('status', 'in_progress')
    .lt('started_at', shift(-14).toISOString());
  for (const w of stuckWork || []) {
    candidates.push({
      type: `cron:work_stuck:${w.id}`,
      project_id: null,
      message: `🏭 שורת הייצור "${w.output_desc}" בעבודה כבר ${daysSince(w.started_at)} ימים בלי עדכון — לבדוק עם המפעל.`,
    });
  }

  // Rule 8 — collection: customer invoice past due, not collected. ESCALATING —
  // the dedup key carries the overdue-week bucket, so a fresh alert fires every
  // week the debt stays open (unlike the other one-shot rules).
  const { data: overdueInv } = await admin
    .from('customer_invoice_balances')
    .select('id, project_id, invoice_number, payment_due_date, balance')
    .in('status', ['open', 'partially_paid'])
    .not('payment_due_date', 'is', null)
    .lt('payment_due_date', ymd(now));
  const ilsFmt = (n: number) => new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(n || 0);
  for (const inv of overdueInv || []) {
    const daysOver = daysSince(inv.payment_due_date);
    const week = Math.floor(daysOver / 7);
    const balTxt = Number(inv.balance) > 0 ? ` על סך ${ilsFmt(Number(inv.balance))}` : '';
    candidates.push({
      type: `cron:payment_overdue:${inv.id}:w${week}`,
      project_id: inv.project_id || null,
      message: `💰 חשבונית ${inv.invoice_number || ''}${balTxt} בפיגור ${daysOver} ימים (מועד: ${heDate(inv.payment_due_date)}) — לטפל בגבייה (/finance/collections).`,
    });
  }

  // Rule 8b — collection heads-up: invoice due within 3 days, not collected.
  const { data: dueSoonInv } = await admin
    .from('customer_invoice_balances')
    .select('id, project_id, invoice_number, payment_due_date, balance')
    .in('status', ['open', 'partially_paid'])
    .not('payment_due_date', 'is', null)
    .gte('payment_due_date', ymd(now))
    .lte('payment_due_date', ymd(shift(3)));
  for (const inv of dueSoonInv || []) {
    candidates.push({
      type: `cron:payment_due_soon:${inv.id}`,
      project_id: inv.project_id || null,
      message: `🔔 חשבונית ${inv.invoice_number || ''} מגיעה לפירעון ב-${heDate(inv.payment_due_date)} — לוודא שהתשלום בדרך (/finance/collections).`,
    });
  }

  // Rule 8c — collection follow-up reminder: a logged next_action_date arrived.
  const { data: dueActions } = await admin
    .from('collection_activities')
    .select('id, invoice_id, summary, next_action_date, customer_invoices(invoice_number, project_id, status)')
    .not('next_action_date', 'is', null)
    .lte('next_action_date', ymd(now));
  for (const a of dueActions || []) {
    const inv: any = a.customer_invoices;
    if (!inv || inv.status === 'paid' || inv.status === 'cancelled') continue;
    candidates.push({
      type: `cron:collection_action:${a.id}`,
      project_id: inv.project_id || null,
      message: `📞 תזכורת גבייה לחשבונית ${inv.invoice_number || ''}: "${(a.summary || '').slice(0, 80)}" — הגיע מועד הפעולה הבאה (/finance/collections).`,
    });
  }

  // ==========================================================================
  // Billing-trigger engine (rules 9a-9c) — WHEN to bill the customer, derived
  // from the signed quote's payment terms (override: quotes.billing_trigger /
  // billing_advance_pct). The invoice itself is issued in the external
  // accounting software; these alerts make sure no billing moment is missed.
  // ==========================================================================

  // Rule 9a — advance billing: quote signed with "מקדמה X%" in its terms and
  // no advance invoice opened yet.
  const { data: signedQuotes } = await admin
    .from('quotes')
    .select('id, quote_number, project_id, total_amount, payment_terms, billing_trigger, billing_advance_pct, projects(name)')
    .eq('status', 'signed');
  const signedIds = (signedQuotes || []).map((q: any) => q.id);
  const { data: advInvs } = signedIds.length
    ? await admin.from('customer_invoices').select('quote_id').eq('invoice_type', 'advance').in('quote_id', signedIds)
    : { data: [] as any[] };
  const hasAdvance = new Set((advInvs || []).map((r: any) => r.quote_id));
  for (const q of signedQuotes || []) {
    const pct = effectiveAdvancePct(q);
    if (!pct || hasAdvance.has(q.id)) continue;
    const amount = Math.round(((Number(q.total_amount) || 0) * pct) / 100);
    candidates.push({
      type: `cron:billing_advance:${q.id}`,
      project_id: q.project_id || null,
      message: `💳 חיוב מקדמה: הצעה ${q.quote_number || ''}${projName(q) ? ` (${projName(q)})` : ''} נחתמה עם מקדמה ${pct}% — להוציא חשבונית מקדמה${amount ? ` על כ-${amount.toLocaleString()} ₪` : ''} ולפתוח אותה למעקב (/finance/collections).`,
    });
  }

  // Quote lookup for rules 9b/9c — order id → its quote row.
  const { data: allOrders } = await admin
    .from('import_orders')
    .select('id, quote_id, project_id, project_name, status');
  const orderById: Record<string, any> = {};
  (allOrders || []).forEach((o: any) => { orderById[o.id] = o; });
  const quoteById: Record<string, any> = {};
  (signedQuotes || []).forEach((q: any) => { quoteById[q.id] = q; });

  // Rule 9b — port-arrival billing: shipment arrived (status, or ETA passed as
  // a fallback for unupdated statuses) on a deal whose terms anchor billing to
  // arrival. Goods detail comes from the shipment's packing lines.
  const { data: shipsForBilling } = await admin
    .from('import_shipments')
    .select('id, bl_number, status, eta');
  const arrivedShips = (shipsForBilling || []).filter((s: any) =>
    ['arrived', 'customs', 'delivered'].includes(s.status) || (s.eta && s.eta < ymd(now)));
  if (arrivedShips.length) {
    const shipIds = arrivedShips.map((s: any) => s.id);
    const { data: conts } = await admin.from('import_containers').select('id, shipment_id').in('shipment_id', shipIds);
    const contShip: Record<string, string> = {};
    (conts || []).forEach((c: any) => { contShip[c.id] = c.shipment_id; });
    const contIds = Object.keys(contShip);
    const { data: plines } = contIds.length
      ? await admin.from('import_packing_lines').select('container_id, import_order_id, dn, shipped_qty, unit, description').in('container_id', contIds)
      : { data: [] as any[] };
    // Group lines per (shipment, order)
    const groups: Record<string, { shipmentId: string; orderId: string; lines: any[] }> = {};
    (plines || []).forEach((l: any) => {
      const shipId = contShip[l.container_id];
      if (!shipId || !l.import_order_id) return;
      const key = `${shipId}:${l.import_order_id}`;
      (groups[key] = groups[key] || { shipmentId: shipId, orderId: l.import_order_id, lines: [] }).lines.push(l);
    });
    for (const g of Object.values(groups)) {
      const order = orderById[g.orderId];
      if (!order || order.status === 'cancelled') continue;
      const quote = order?.quote_id ? quoteById[order.quote_id] : null;
      if (!quote || effectiveBillingAnchor(quote) !== 'port_arrival') continue;
      const ship = arrivedShips.find((s: any) => s.id === g.shipmentId);
      const goods = summarizeGoods(g.lines.map((l: any) => ({ dn: l.dn, qty: l.shipped_qty, unit: l.unit, description: l.description })));
      candidates.push({
        type: `cron:billing_port:${g.shipmentId}:${g.orderId}`,
        project_id: order?.project_id || null,
        message: `🚢 חיוב עם הגעה לנמל: משלוח ${ship?.bl_number || ''}${order?.project_name ? ` (${order.project_name})` : ''} הגיע — לפי תנאי התשלום יש לחייב את הלקוח על: ${goods || 'ראה פירוט מכולות ביבוא'}. פתיחת חשבונית: /finance/collections.`,
      });
    }
  }

  // Rule 9c — delivery billing: a SIGNED delivery certificate with no invoice
  // yet, on a deal anchored to delivery (the default). Fires immediately on
  // signature (rule 5 keeps nagging 7d after הועבר להנה"ח).
  const { data: signedDeliveries } = await admin
    .from('import_customer_deliveries')
    .select('id, project_id, import_order_id, delivery_note_number, customer_name, items, quantity_summary')
    .eq('signed', true)
    .eq('invoice_issued', false)
    .is('customer_invoice_id', null);
  for (const d of signedDeliveries || []) {
    const order = d.import_order_id ? orderById[d.import_order_id] : null;
    const quote = order?.quote_id ? quoteById[order.quote_id] : null;
    if (quote && effectiveBillingAnchor(quote) !== 'delivery') continue;
    const goods = summarizeGoods(d.items as any[]) || d.quantity_summary || '';
    candidates.push({
      type: `cron:billing_delivery:${d.id}`,
      project_id: d.project_id || null,
      message: `🧾 לחייב לקוח: תעודת משלוח ${d.delivery_note_number || ''}${d.customer_name ? ` (${d.customer_name})` : ''} נחתמה — להוציא חשבונית על: ${goods || 'ראה פירוט בתעודה'}. סימון "חשבונית הופקה" במסך /deliveries יפתח אותה למעקב גבייה.`,
    });
  }

  // Rule 10 — supplier payments: due within 7 days (one-shot) / overdue
  // (escalates weekly, like the customer side).
  const { data: supInvs } = await admin
    .from('supplier_invoice_balances')
    .select('id, invoice_no, import_order_id, currency, balance, payment_due_date')
    .in('payment_status', ['open', 'partially_paid'])
    .not('payment_due_date', 'is', null);
  const fmtCur = (n: number, cur: string) => {
    try { return new Intl.NumberFormat('en-US', { style: 'currency', currency: cur || 'USD', maximumFractionDigits: 0 }).format(n || 0); }
    catch { return `${(n || 0).toLocaleString()} ${cur || ''}`; }
  };
  for (const inv of supInvs || []) {
    const order = inv.import_order_id ? orderById[inv.import_order_id] : null;
    const label = `${inv.invoice_no || ''}${order?.project_name ? ` (${order.project_name})` : ''}`;
    if (inv.payment_due_date < ymd(now)) {
      const week = Math.floor(daysSince(inv.payment_due_date) / 7);
      candidates.push({
        type: `cron:supplier_overdue:${inv.id}:w${week}`,
        project_id: order?.project_id || null,
        message: `🏦 תשלום לספק בפיגור: חשבונית ${label} על ${fmtCur(Number(inv.balance), inv.currency)} עברה את מועד הפירעון ${heDate(inv.payment_due_date)} (/finance/suppliers).`,
      });
    } else if (inv.payment_due_date <= ymd(shift(7))) {
      candidates.push({
        type: `cron:supplier_due:${inv.id}`,
        project_id: order?.project_id || null,
        message: `🏦 תשלום לספק מתקרב: חשבונית ${label} על ${fmtCur(Number(inv.balance), inv.currency)} לפירעון ב-${heDate(inv.payment_due_date)} (/finance/suppliers).`,
      });
    }
  }

  // De-dup against every cron alert ever created (resolved or not).
  const { data: existingRows } = await admin.from('alerts').select('type').like('type', 'cron:%');
  const seen = new Set((existingRows || []).map((a: any) => a.type));
  const fresh = candidates.filter((c) => !seen.has(c.type));

  let created = 0;
  if (fresh.length) {
    const { error } = await admin
      .from('alerts')
      .insert(fresh.map((c) => ({ type: c.type, project_id: c.project_id, message: c.message, is_resolved: false })));
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    created = fresh.length;
  }

  const byRule = fresh.reduce((acc: Record<string, number>, c) => {
    const rule = c.type.split(':')[1];
    acc[rule] = (acc[rule] || 0) + 1;
    return acc;
  }, {});

  return NextResponse.json({ ok: true, expired: expiredCount, scanned: candidates.length, created, byRule });
}
