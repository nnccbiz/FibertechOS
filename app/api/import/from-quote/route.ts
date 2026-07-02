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
 * from the supplier-cost side (cost_input_items), not from the customer selling
 * prices (quote_items). quote_items is only a fallback when the quote has no
 * linked cost input.
 *
 * Idempotent: if an import order already exists for this quote_id, it is returned
 * unchanged (re-signing a quote must not duplicate the draft).
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';

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
    .select('id, project_id, status, cost_input_id, supplier_name, currency')
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

  // 5. Gather the order lines + header context from the cost input (supplier
  //    side). Fall back to the quote's selling lines only if there is none.
  let currency = 'USD';
  let paymentTerms: string | null = null;
  let supplierName: string | null = quote.supplier_name || null;
  let lines: any[] = [];

  if (quote.cost_input_id) {
    const { data: ci } = await admin
      .from('cost_inputs')
      .select('currency, payment_terms, source_name')
      .eq('id', quote.cost_input_id)
      .maybeSingle();
    if (ci) {
      currency = ci.currency || 'USD';
      paymentTerms = ci.payment_terms || null;
      supplierName = supplierName || ci.source_name || null;
    }
    const { data: items } = await admin
      .from('cost_input_items')
      .select('*')
      .eq('cost_input_id', quote.cost_input_id)
      .order('sort_order');
    const isForex = currency !== 'ILS';
    lines = (items || [])
      .filter((it: any) => (it.product_name || '').trim())
      .map((it: any, idx: number) => ({
        description: it.product_name,
        dn: it.dn_size || null,
        pn: it.pn != null ? String(it.pn) : null,
        sn: it.sn != null ? String(it.sn) : null,
        unit: it.unit || 'M',
        ordered_qty: Number(it.quantity) || 0,
        unit_price: isForex ? (Number(it.original_price) || 0) : (Number(it.cost_price) || 0),
        sort_order: idx,
      }));
  }

  if (lines.length === 0) {
    // Fallback: no cost input (or it was empty) — seed from the quote items at
    // their cost price, in the quote's currency.
    currency = quote.currency || 'ILS';
    const { data: qItems } = await admin
      .from('quote_items')
      .select('*')
      .eq('quote_id', quoteId)
      .order('sort_order');
    lines = (qItems || [])
      .filter((it: any) => (it.product_name || '').trim())
      .map((it: any, idx: number) => ({
        description: it.product_name,
        dn: it.dn_size || null,
        pn: it.pn != null ? String(it.pn) : null,
        sn: it.sn != null ? String(it.sn) : null,
        unit: it.unit || 'M',
        ordered_qty: Number(it.quantity) || 0,
        unit_price: Number(it.cost_price) || 0,
        sort_order: idx,
      }));
  }

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

  return NextResponse.json({ importOrderId: order.id, created: true, lines: lines.length });
}
