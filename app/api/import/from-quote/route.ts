/**
 * POST /api/import/from-quote  { quoteId }
 *
 * Seeds a DRAFT import order from a signed customer quote — the automatic
 * hand-off from sales to import/planning. Called from usePricing.updateQuoteStatus
 * right after a quote is signed (and the production order is created).
 *
 * Why server-side with the admin client:
 *   RLS on import_* requires has_module_permission('import','edit'). The person
 *   signing a quote works in the projects module and usually has NO import
 *   permission, so a direct browser insert would be rejected by RLS. This route
 *   verifies the caller has a session and that the quote is genuinely 'signed',
 *   then writes with the service-role client. It is NOT a model-driven write, so
 *   the Roxy write-allowlist does not apply (and no import_* table is on it).
 *
 * The import order is a PURCHASE order to the supplier, so its lines are seeded
 * from the supplier-cost side (cost_input_items) at their original foreign price.
 *
 * CONDITIONAL: a draft is created ONLY when the pricing basis is an external
 * supplier in a FOREIGN currency (effectiveCurrency !== 'ILS' and source_type is
 * not 'internal'). Internal / ILS (domestic) pricing, or a quote with no supplier
 * cost input, imports nothing — the route returns { created: false, reason } so
 * the caller knows WHY no draft was made. The currency is resolved with
 * effectiveCurrency() (not cost_inputs.currency alone — see CLAUDE.md #11).
 *
 * Idempotent: if an import order already exists for this quote_id, it is returned
 * unchanged (re-signing a quote must not duplicate the draft).
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { effectiveCurrency } from '@/lib/pricing';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  let quoteId: string | undefined;
  try {
    ({ quoteId } = await req.json());
  } catch {
    return NextResponse.json({ error: 'bad request' }, { status: 400 });
  }
  if (!quoteId || typeof quoteId !== 'string') {
    return NextResponse.json({ error: 'quoteId required' }, { status: 400 });
  }

  // 1. Require a logged-in user (the route bypasses RLS, so guard the door).
  const userClient = await createClient();
  const { data: { user }, error: authErr } = await userClient.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();

  // 2. Load the quote and require it to be signed. Never seed from a draft/sent
  //    quote — this route is the signed hand-off, not a generic importer.
  const { data: quote, error: qErr } = await admin
    .from('quotes')
    .select('id, project_id, status, cost_input_id, supplier_name, currency, quote_number, total_amount')
    .eq('id', quoteId)
    .maybeSingle();
  if (qErr) return NextResponse.json({ error: qErr.message }, { status: 500 });
  if (!quote) return NextResponse.json({ error: 'quote not found' }, { status: 404 });
  if (quote.status !== 'signed') {
    return NextResponse.json({ error: 'quote not signed' }, { status: 409 });
  }

  // 3. Idempotency — one auto-seeded draft per quote.
  const { data: existing } = await admin
    .from('import_orders')
    .select('id')
    .eq('quote_id', quoteId)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ importOrderId: existing.id, created: false });
  }

  // 4. Resolve project name (for the supplier-facing project_name field).
  let projectName: string | null = null;
  if (quote.project_id) {
    const { data: proj } = await admin
      .from('projects')
      .select('name, client_name')
      .eq('id', quote.project_id)
      .maybeSingle();
    projectName = proj?.name || proj?.client_name || null;
  }

  // 5. GATE — an import draft is seeded ONLY when the quote's pricing basis is an
  //    EXTERNAL supplier priced in a FOREIGN currency. Internal / ILS (domestic)
  //    pricing, or a quote with no supplier cost input, imports nothing — skip and
  //    return a clear reason instead of silently doing nothing.
  //
  //    The currency test uses effectiveCurrency(), NOT cost_inputs.currency alone:
  //    a known bug (CLAUDE.md #11) leaves the header at 'ILS' after a duplicate/edit
  //    while the items are still EUR/USD, so the header on its own would wrongly
  //    route a foreign order to the "domestic" skip path.
  if (!quote.cost_input_id) {
    return NextResponse.json({
      created: false,
      reason: 'no_cost_input',
      message: 'ההצעה אינה מבוססת על תמחור ספק — לא נוצרה טיוטת הזמנת יבוא.',
    });
  }

  const { data: ci } = await admin
    .from('cost_inputs')
    .select('currency, source_type, payment_terms, source_name')
    .eq('id', quote.cost_input_id)
    .maybeSingle();

  const { data: items } = await admin
    .from('cost_input_items')
    .select('*')
    .eq('cost_input_id', quote.cost_input_id)
    .order('sort_order');

  const currency = effectiveCurrency(ci, items || []);
  const isForex = currency !== 'ILS';

  if (ci?.source_type === 'internal') {
    return NextResponse.json({
      created: false,
      reason: 'internal_pricing',
      message: 'ההצעה מבוססת תמחור פנימי — לא נוצרה טיוטת הזמנת יבוא.',
    });
  }
  if (!isForex) {
    return NextResponse.json({
      created: false,
      reason: 'domestic_ils_pricing',
      message: 'ההצעה מבוססת תמחור בשקלים (ספק מקומי) — לא נוצרה טיוטת הזמנת יבוא.',
    });
  }

  // Passed the gate: external supplier in a foreign currency. Seed the lines from
  // the supplier-cost side (cost_input_items) at their ORIGINAL foreign unit price.
  const paymentTerms: string | null = ci?.payment_terms || null;
  const supplierName: string | null = quote.supplier_name || ci?.source_name || null;
  const lines = (items || [])
    .filter((it: any) => (it.product_name || '').trim())
    .map((it: any, idx: number) => ({
      description: it.product_name,
      dn: it.dn_size || null,
      pn: it.pn != null ? String(it.pn) : null,
      sn: it.sn != null ? String(it.sn) : null,
      unit: it.unit || 'M',
      ordered_qty: Number(it.quantity) || 0,
      unit_price: Number(it.original_price) || 0,
      sort_order: idx,
    }));

  // 6. Best-effort supplier match by name (Nitzan fills it in review otherwise).
  let supplierId: string | null = null;
  if (supplierName) {
    const { data: sup } = await admin
      .from('suppliers')
      .select('id')
      .ilike('name', supplierName.trim())
      .maybeSingle();
    supplierId = sup?.id || null;
  }

  const totalAmount = lines.reduce(
    (s, l) => s + (Number(l.unit_price) || 0) * (Number(l.ordered_qty) || 0),
    0,
  );

  // 7. Create the draft order + its items.
  const { data: order, error: oErr } = await admin
    .from('import_orders')
    .insert({
      quote_id: quoteId,
      project_id: quote.project_id || null,
      is_stock: false,
      project_name: projectName,
      supplier_id: supplierId,
      currency,
      payment_terms: paymentTerms,
      total_amount: totalAmount,
      status: 'draft',
      origin: 'auto_from_quote',
    })
    .select('id')
    .single();
  if (oErr) return NextResponse.json({ error: oErr.message }, { status: 500 });

  if (lines.length > 0) {
    const { error: iErr } = await admin
      .from('import_order_items')
      .insert(lines.map((l) => ({ ...l, import_order_id: order.id })));
    if (iErr) {
      // Roll back the header so a signed quote never keeps a half-seeded draft.
      await admin.from('import_orders').delete().eq('id', order.id);
      return NextResponse.json({ error: iErr.message }, { status: 500 });
    }
  }

  // 8. Surface the win: an in-app alert on the dashboard ("משימות לביצוע").
  //    The old /api/webhooks/quote-signed path was never called and targeted a
  //    schema that doesn't exist — this is the working replacement. Runs only on
  //    first creation (idempotency above), so re-signing can't spam alerts.
  const ils = new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 });
  const { error: alertErr } = await admin.from('alerts').insert({
    type: 'signature',
    project_id: quote.project_id || null,
    assigned_to: projectName || '',
    message: `🎉 נחתמה הצעה ${quote.quote_number || ''}${projectName ? ` בפרויקט ${projectName}` : ''} על סך ${ils.format(quote.total_amount || 0)} — נוצרה טיוטת הזמנת יבוא לבדיקת תפ"י`,
    is_resolved: false,
  });
  if (alertErr) console.error('signed-quote alert insert failed:', alertErr.message);

  return NextResponse.json({ importOrderId: order.id, created: true, lines: lines.length });
}
