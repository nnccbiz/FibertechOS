/**
 * Import receipt status + per-item matching — shared by SmartUpload (write
 * path), the /import OrderCard and the per-project tracker, so the matching
 * and completion rules live in one place.
 *
 * A packing line belongs to AT MOST ONE order item: explicit link
 * (import_order_item_id) → same supplier material no → (legacy rows only, no
 * link and no material) a DN that exactly one item carries. The old rule let a
 * DN1280 line count toward every DN1280 item (standard / nozzles / first pipe).
 */

export type ReceivedStatus = 'received' | 'partially_received';

export interface OrderItem {
  id?: string;
  material_no?: string | null;
  dn?: string | null;
  ordered_qty?: number | string | null;
  completed_at?: string | null;
  [key: string]: any;
}
export interface PackingLine {
  import_order_item_id?: string | null;
  material_no?: string | null;
  dn?: string | null;
  shipped_qty?: number | string | null;
}

const num = (v: unknown) => {
  const n = parseFloat(String(v ?? 0));
  return isNaN(n) ? 0 : n;
};
const same = (a?: string | null, b?: string | null) =>
  !!a && !!b && String(a).trim() === String(b).trim();

/** The order item a packing line counts toward (null = unmatched). */
export function itemIdForLine(line: PackingLine, items: OrderItem[]): string | null {
  if (line.import_order_item_id && items.some((i) => i.id === line.import_order_item_id)) {
    return line.import_order_item_id;
  }
  if (line.material_no) {
    const m = items.find((i) => same(i.material_no, line.material_no));
    if (m?.id) return m.id;
  }
  if (!line.import_order_item_id && !line.material_no && line.dn) {
    const c = items.filter((i) => same(i.dn, line.dn));
    if (c.length === 1 && c[0].id) return c[0].id;
  }
  return null;
}

/** Total shipped quantity counted toward one order item. */
export function receivedForItem(item: OrderItem, packing: PackingLine[], items: OrderItem[] = [item]): number {
  return packing
    .filter((p) => item.id && itemIdForLine(p, items) === item.id)
    .reduce((s, p) => s + num(p.shipped_qty), 0);
}

/**
 * An item is complete ONLY when fully shipped (shipped ≥ ordered) or when a
 * user marked it complete by hand — never by an automatic tolerance.
 */
export function isItemComplete(item: OrderItem, shipped: number): boolean {
  return !!item.completed_at || shipped + 1e-9 >= num(item.ordered_qty);
}

export interface ItemShortfall<T extends OrderItem = OrderItem> {
  item: T;
  ordered: number;
  shipped: number;
  remaining: number;   // ordered − shipped (negative = over-shipped)
  complete: boolean;
  manual: boolean;     // complete only because a user marked it
}

/** Ordered vs shipped for every real (ordered > 0) item of one order. */
export function orderShortfall<T extends OrderItem>(items: T[], packing: PackingLine[]): ItemShortfall<T>[] {
  return items
    .filter((i) => num(i.ordered_qty) > 0)
    .map((item) => {
      const ordered = num(item.ordered_qty);
      const shipped = receivedForItem(item, packing, items);
      const full = shipped + 1e-9 >= ordered;
      return {
        item, ordered, shipped,
        remaining: Math.round((ordered - shipped) * 1000) / 1000,
        complete: full || !!item.completed_at,
        manual: !full && !!item.completed_at,
      };
    });
}

/**
 * Derive an order's receipt status from packing coverage:
 *   every ordered item complete → 'received'
 *   some coverage but not all complete → 'partially_received'
 *   no coverage (or no ordered items) → null (leave the status alone)
 */
export function deriveReceivedStatus(items: OrderItem[], packing: PackingLine[]): ReceivedStatus | null {
  const rows = orderShortfall(items, packing);
  if (rows.length === 0) return null;
  const anyActivity = rows.some((r) => r.shipped > 0 || r.manual);
  if (!anyActivity) return null;
  return rows.every((r) => r.complete) ? 'received' : 'partially_received';
}

/** Order-level coverage percentage (shipped / ordered, capped per item; a hand-completed item counts full). */
export function orderCoveragePct(items: OrderItem[], packing: PackingLine[]): number {
  const rows = orderShortfall(items, packing);
  const totalOrdered = rows.reduce((s, r) => s + r.ordered, 0);
  if (totalOrdered <= 0) return 0;
  const covered = rows.reduce((s, r) => s + (r.complete ? r.ordered : Math.min(r.shipped, r.ordered)), 0);
  return Math.round((covered / totalOrdered) * 100);
}
