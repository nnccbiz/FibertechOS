/**
 * Derived import receipt status — shared by SmartUpload (write path) and the
 * /import OrderCard (display), so the coverage rule lives in one place.
 *
 * Matching mirrors the OrderCard: a packing line counts toward an order item by
 * explicit link (import_order_item_id), else by material_no, else by DN.
 */

export type ReceivedStatus = 'received' | 'partially_received';

interface OrderItem {
  id?: string;
  material_no?: string | null;
  dn?: string | null;
  ordered_qty?: number | string | null;
}
interface PackingLine {
  import_order_item_id?: string | null;
  material_no?: string | null;
  dn?: string | null;
  shipped_qty?: number | string | null;
}

const num = (v: unknown) => {
  const n = parseFloat(String(v ?? 0));
  return isNaN(n) ? 0 : n;
};

/** Total shipped quantity received against one order item. */
export function receivedForItem(item: OrderItem, packing: PackingLine[]): number {
  return packing
    .filter((p) =>
      p.import_order_item_id === item.id ||
      (!!p.material_no && !!item.material_no && p.material_no === item.material_no) ||
      (!p.import_order_item_id && !p.material_no && !!p.dn && !!item.dn && p.dn === item.dn),
    )
    .reduce((s, p) => s + num(p.shipped_qty), 0);
}

/**
 * Derive an order's receipt status from packing coverage:
 *   every ordered item fully covered → 'received'
 *   some coverage but not all complete → 'partially_received'
 *   no coverage (or no ordered items) → null (leave the status alone)
 */
export function deriveReceivedStatus(items: OrderItem[], packing: PackingLine[]): ReceivedStatus | null {
  const real = items.filter((i) => num(i.ordered_qty) > 0);
  if (real.length === 0 || packing.length === 0) return null;
  let anyReceived = false;
  let allComplete = true;
  for (const it of real) {
    const rec = receivedForItem(it, packing);
    if (rec > 0) anyReceived = true;
    if (rec + 1e-9 < num(it.ordered_qty)) allComplete = false;
  }
  if (!anyReceived) return null;
  return allComplete ? 'received' : 'partially_received';
}

/** Order-level coverage percentage (received / ordered, capped per item at 100%). */
export function orderCoveragePct(items: OrderItem[], packing: PackingLine[]): number {
  const totalOrdered = items.reduce((s, i) => s + num(i.ordered_qty), 0);
  if (totalOrdered <= 0) return 0;
  const totalReceived = items.reduce((s, i) => s + Math.min(receivedForItem(i, packing), num(i.ordered_qty)), 0);
  return Math.round((totalReceived / totalOrdered) * 100);
}
