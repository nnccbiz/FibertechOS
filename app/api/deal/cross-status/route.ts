/**
 * GET /api/deal/cross-status?quoteIds=<id,id,...>
 *
 * Cross-module link for the production ↔ import chips: given a set of quote ids,
 * returns for each the OTHER side's status so /production can show "🚢 import" and
 * /import can show "🏭 production" — the two are joined by their shared quote_id.
 *
 * Server-side because the two tables are RLS-siloed by module:
 *   orders        → needs projects:view   (a production/import user may lack it)
 *   import_orders → needs import:view      (a production user may lack it)
 * A live browser query from one page can't read the other side, so this route
 * verifies the caller has EITHER production or import view (least-privilege — both
 * pages are already permission-gated) and reads with the service-role client.
 *
 * Best-effort import ETA = earliest shipment ETA reachable from the import order
 * via packing lines → containers → shipments.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get('quoteIds') || '';
  const quoteIds = raw.split(',').map((s) => s.trim()).filter(Boolean);

  const userClient = await createClient();
  const { data: { user }, error: authErr } = await userClient.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const [{ data: prodOk }, { data: importOk }] = await Promise.all([
    userClient.rpc('has_module_permission', { p_module: 'production', p_min_level: 'view' }),
    userClient.rpc('has_module_permission', { p_module: 'import', p_min_level: 'view' }),
  ]);
  if (!prodOk && !importOk) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  if (quoteIds.length === 0) return NextResponse.json({ statuses: {} });

  const admin = createAdminClient();

  const [prodRes, impRes] = await Promise.all([
    admin.from('orders').select('quote_id, status, order_number').in('quote_id', quoteIds),
    admin.from('import_orders').select('id, quote_id, status').in('quote_id', quoteIds),
  ]);
  const prodOrders = prodRes.data || [];
  const importOrders = impRes.data || [];

  // Best-effort ETA per import order via packing → container → shipment.
  const etaByImportOrder: Record<string, string | null> = {};
  const impIds = importOrders.map((o: any) => o.id);
  if (impIds.length) {
    const { data: pk } = await admin
      .from('import_packing_lines')
      .select('import_order_id, container_id')
      .in('import_order_id', impIds)
      .not('container_id', 'is', null);
    const contIds = Array.from(new Set((pk || []).map((r: any) => r.container_id).filter(Boolean)));
    const shipByContainer: Record<string, string> = {};
    if (contIds.length) {
      const { data: conts } = await admin.from('import_containers').select('id, shipment_id').in('id', contIds);
      const shipIds = Array.from(new Set((conts || []).map((c: any) => c.shipment_id).filter(Boolean)));
      const etaByShip: Record<string, string | null> = {};
      if (shipIds.length) {
        const { data: ships } = await admin.from('import_shipments').select('id, eta').in('id', shipIds);
        (ships || []).forEach((s: any) => { etaByShip[s.id] = s.eta || null; });
      }
      (conts || []).forEach((c: any) => { if (c.shipment_id) shipByContainer[c.id] = c.shipment_id; });
      (pk || []).forEach((r: any) => {
        const shipId = r.container_id ? shipByContainer[r.container_id] : null;
        const eta = shipId ? etaByShip[shipId] : null;
        if (eta) {
          const cur = etaByImportOrder[r.import_order_id];
          if (!cur || eta < cur) etaByImportOrder[r.import_order_id] = eta;
        }
      });
    }
  }

  const statuses: Record<string, { production: any; import: any }> = {};
  for (const id of quoteIds) statuses[id] = { production: null, import: null };
  for (const o of prodOrders) {
    if (statuses[o.quote_id]) statuses[o.quote_id].production = { status: o.status, order_number: o.order_number };
  }
  for (const o of importOrders) {
    if (statuses[o.quote_id]) statuses[o.quote_id].import = { status: o.status, eta: etaByImportOrder[o.id] || null };
  }

  return NextResponse.json({ statuses });
}
