/**
 * GET /api/cron/alerts  — scheduled alert engine (Vercel Cron, daily).
 *
 * Scans the operational tables and seeds in-app alerts (the dashboard "משימות
 * לביצוע" list) for things that would otherwise be silently missed:
 *   1. quote sent > 7d ago with no answer          (sales follow-up)
 *   2. quote price validity within 3d / already passed (re-quote before signing)
 *   3. shipment ETA within 7d / already passed      (import readiness)
 *   4. auto-seeded import draft pending תפ"י review > 2d
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

  return NextResponse.json({ ok: true, scanned: candidates.length, created, byRule });
}
