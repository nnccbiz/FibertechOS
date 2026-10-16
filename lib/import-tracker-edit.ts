// Inline edits of the per-project import tracker. Every tracker cell maps to a
// real record (the same tables SmartUpload writes), so an edit here is an edit
// of that record — a hand-entered value simply has no source document.
// Nothing here deletes data except deleteTrackerRow (the caller double-confirms);
// clearing a quantity writes 0, clearing a COA only unlinks it from the note.

import type { createClient } from '@/lib/supabase/client';
import { rowKeyOf, type TrackerColumn, type TrackerGroup, type TrackerRow } from '@/lib/import-tracker';
import { deriveReceivedStatus, itemIdForLine } from '@/lib/import-status';

type SB = ReturnType<typeof createClient>;
export interface EditCtx { supabase: SB; data: any; orders: any[] }

const trimNo = (v: unknown) => String(v ?? '').replace(/\s+/g, '').toUpperCase();
const blank = (v: string | null | undefined) => (v && String(v).trim() ? String(v).trim() : null);
export const numOrNull = (v: string) => { const x = parseFloat(String(v).replace(',', '.')); return isNaN(x) ? null : x; };

function throwIf(error: any) { if (error) throw new Error(error.message || String(error)); }

// Replace (or drop, when `to` is empty) one delivery-note number inside a comma list.
function swapInList(list: string | null | undefined, from: string | null, to: string | null): string | null {
  const parts = String(list || '').split(/[,;]+/).map((x) => x.trim()).filter(Boolean);
  let out = parts.filter((x) => !(from && trimNo(x) === trimNo(from)));
  if (to && !out.some((x) => trimNo(x) === trimNo(to))) out = [...out, to];
  return out.length ? out.join(', ') : null;
}

export function rowLinesOf(ctx: EditCtx, row: TrackerRow): any[] {
  const ids = new Set(ctx.orders.map((o) => o.id));
  return (ctx.data.packing || []).filter((pl: any) => ids.has(pl.import_order_id) && rowKeyOf(pl) === row.key);
}

// Re-derive an order's receipt status from fresh DB rows (closed / cancelled untouched).
export async function syncOrderStatus(supabase: SB, orderId: string) {
  const [{ data: order }, { data: items }, { data: packing }] = await Promise.all([
    supabase.from('import_orders').select('id, status').eq('id', orderId).single(),
    supabase.from('import_order_items').select('*').eq('import_order_id', orderId),
    supabase.from('import_packing_lines').select('*').eq('import_order_id', orderId),
  ]);
  if (!order || order.status === 'closed' || order.status === 'cancelled') return;
  const derived = deriveReceivedStatus(items || [], packing || []);
  if (derived && derived !== order.status) {
    await supabase.from('import_orders').update({ status: derived, updated_at: new Date().toISOString() }).eq('id', orderId);
  }
}

// ---------------- LOT (shipment) fields ----------------

export type LotField = 'lot_label' | 'bl_number' | 'vessel_name' | 'eta' | 'released_at' | 'customer_delivery_date' | 'status';

/**
 * Edit a LOT field. A group with no shipment yet ("ללא LOT") gets one created
 * on its first edit, and the group's containers are moved into it.
 */
export async function saveLotField(ctx: EditCtx, g: TrackerGroup, field: LotField, value: string) {
  const { supabase } = ctx;
  const v = field === 'status' ? (value || 'booked') : blank(value);
  if (g.shipment) {
    const { error } = await supabase.from('import_shipments').update({ [field]: v, updated_at: new Date().toISOString() }).eq('id', g.shipment.id);
    throwIf(error);
    return;
  }
  const { data: s, error } = await supabase.from('import_shipments').insert({ [field]: v }).select('id').single();
  throwIf(error);
  const contIds = Array.from(new Set(g.rows.map((r) => r.container?.id).filter(Boolean))) as string[];
  if (contIds.length) {
    const { error: e2 } = await supabase.from('import_containers').update({ shipment_id: s!.id }).in('id', contIds);
    throwIf(e2);
  }
}

// ---------------- row fields ----------------

export type RowField = 'dn' | 'container' | 'invoice_date' | 'invoice_no' | 'invoice_value' | `qty:${string}` | `coa:${number}`;

export async function saveRowField(ctx: EditCtx, row: TrackerRow, g: TrackerGroup, columns: TrackerColumn[], field: RowField, value: string) {
  const { supabase, data } = ctx;
  const lines = rowLinesOf(ctx, row);
  const dn = row.deliveryNote || null;

  if (field === 'dn') {
    const next = blank(value);
    if (!next && !row.container) throw new Error('שורה בלי מכולה חייבת מספר תעודת משלוח.');
    for (const pl of lines) {
      const { error } = await supabase.from('import_packing_lines').update({ delivery_note_no: next }).eq('id', pl.id);
      throwIf(error);
    }
    if (row.invoice) {
      const { error } = await supabase.from('import_invoices').update({ delivery_notes: swapInList(row.invoice.delivery_notes, dn, next) }).eq('id', row.invoice.id);
      throwIf(error);
    }
    for (const c of row.coa) {
      const { error } = await supabase.from('import_coa').update({ delivery_notes: swapInList(c.coa.delivery_notes, dn, next) }).eq('id', c.coa.id);
      throwIf(error);
    }
    return;
  }

  if (field === 'container') {
    const next = blank(value);
    if (row.container) {
      if (!next) throw new Error('לא ניתן לרוקן מספר מכולה קיים — אפשר לתקן אותו.');
      const { error } = await supabase.from('import_containers').update({ container_number: next }).eq('id', row.container.id);
      throwIf(error);
      return;
    }
    if (!next) return;
    const sid = g.shipment?.id || null;
    const ex = (data.containers || []).find((c: any) => trimNo(c.container_number) === trimNo(next) && (c.shipment_id || null) === sid);
    let cid = ex?.id;
    if (!cid) {
      const { data: c, error } = await supabase.from('import_containers').insert({ shipment_id: sid, container_number: next }).select('id').single();
      throwIf(error);
      cid = c!.id;
    }
    for (const pl of lines) {
      const { error } = await supabase.from('import_packing_lines').update({ container_id: cid }).eq('id', pl.id);
      throwIf(error);
    }
    return;
  }

  if (field === 'invoice_date' || field === 'invoice_no' || field === 'invoice_value') {
    const inv = row.invoice;
    const patch: any = {};
    if (field === 'invoice_date') patch.invoice_date = blank(value);
    if (field === 'invoice_no') patch.invoice_no = blank(value);
    if (field === 'invoice_value') {
      const n = numOrNull(value);
      if (inv && inv.final_amount != null) patch.final_amount = n; else patch.net_value = n;
    }
    if (inv) {
      const { error } = await supabase.from('import_invoices').update(patch).eq('id', inv.id);
      throwIf(error);
      return;
    }
    if (Object.values(patch).every((x) => x == null)) return;
    if (!dn) throw new Error('כדי לקשר חשבונית לשורה צריך קודם מספר תעודת משלוח (DN).');
    const order = row.order || ctx.orders[0];
    const { error } = await supabase.from('import_invoices').insert({
      ...patch, import_order_id: order?.id || null, shipment_id: g.shipment?.id || null,
      invoice_type: 'commercial', currency: order?.currency || 'USD', delivery_notes: dn,
    });
    throwIf(error);
    return;
  }

  if (field.startsWith('qty:')) {
    const itemId = field.slice(4);
    const col = columns.find((c) => c.item.id === itemId);
    if (!col) return;
    const want = numOrNull(value) ?? 0;
    const orderItems = (data.items || []).filter((i: any) => i.import_order_id === col.order.id);
    const mine = lines.filter((pl) => pl.import_order_id === col.order.id && itemIdForLine(pl, orderItems) === itemId);
    if (mine.length) {
      const { error } = await supabase.from('import_packing_lines').update({ shipped_qty: want }).eq('id', mine[0].id);
      throwIf(error);
      for (const extra of mine.slice(1)) {
        const { error: e2 } = await supabase.from('import_packing_lines').update({ shipped_qty: 0 }).eq('id', extra.id);
        throwIf(e2);
      }
    } else if (want > 0) {
      const { error } = await supabase.from('import_packing_lines').insert({
        import_order_id: col.order.id, import_order_item_id: itemId, material_no: col.item.material_no || null,
        description: col.item.description || '', dn: col.item.dn || null, unit: col.item.unit || 'M',
        shipped_qty: want, delivery_note_no: dn, container_id: row.container?.id || null,
      });
      throwIf(error);
    }
    await syncOrderStatus(supabase, col.order.id);
    return;
  }

  if (field.startsWith('coa:')) {
    const k = Number(field.slice(4));
    const cur = row.coa[k];
    const next = blank(value);
    if (cur) {
      // Cleared → only unlink this delivery note from the certificate.
      const patch = next ? { coa_no: next } : { delivery_notes: swapInList(cur.coa.delivery_notes, dn, null) };
      const { error } = await supabase.from('import_coa').update(patch).eq('id', cur.coa.id);
      throwIf(error);
      return;
    }
    if (!next) return;
    if (!dn) throw new Error('כדי לקשר COA לשורה צריך קודם מספר תעודת משלוח (DN).');
    const { error } = await supabase.from('import_coa').insert({ import_order_id: row.order?.id || ctx.orders[0]?.id || null, coa_no: next, delivery_notes: dn });
    throwIf(error);
  }
}

/** The supplier's order-line number shown above an item column ("שורה 30"). */
export async function saveItemLineNo(supabase: SB, itemId: string, value: string) {
  const n = numOrNull(value);
  const { error } = await supabase.from('import_order_items').update({ line_no: n == null ? null : Math.round(n) }).eq('id', itemId);
  throwIf(error);
}

// ---------------- new row / delete row ----------------

export interface NewRowDraft {
  shipmentId: string;      // existing shipment id, '' = no LOT, '__new__' = create
  newLotLabel: string;
  // LOT fields — used when a new LOT is opened from the blank row
  status: string;
  bl_number: string;
  released_at: string;
  eta: string;
  customer_delivery_date: string;
  dn: string;
  container: string;
  invoice_date: string;
  invoice_no: string;
  invoice_value: string;
  qty: Record<string, string>;
  coa: string;
}
export const NEW_LOT = '__new__';

export async function createTrackerRow(ctx: EditCtx, columns: TrackerColumn[], d: NewRowDraft) {
  const { supabase, data } = ctx;
  const dn = blank(d.dn);
  const cont = blank(d.container);
  if (!dn && !cont) throw new Error('יש להזין לפחות מספר תעודת משלוח (DN) או מספר מכולה.');
  const qtys = columns.map((c) => ({ c, q: numOrNull(d.qty[c.item.id] || '') ?? 0 })).filter((x) => x.q > 0);
  if (!qtys.length) throw new Error('יש להזין כמות (מטרים) לפחות לפריט אחד.');
  if (d.shipmentId === NEW_LOT && !blank(d.newLotLabel)) throw new Error('יש לתת שם ל-LOT החדש.');

  let sid: string | null = d.shipmentId && d.shipmentId !== NEW_LOT ? d.shipmentId : null;
  if (d.shipmentId === NEW_LOT) {
    const { data: s, error } = await supabase.from('import_shipments').insert({
      lot_label: blank(d.newLotLabel), status: d.status || 'booked', bl_number: blank(d.bl_number),
      released_at: blank(d.released_at), eta: blank(d.eta), customer_delivery_date: blank(d.customer_delivery_date),
    }).select('id').single();
    throwIf(error);
    sid = s!.id;
  }
  let cid: string | null = null;
  if (cont) {
    const ex = (data.containers || []).find((c: any) => trimNo(c.container_number) === trimNo(cont) && (c.shipment_id || null) === sid);
    if (ex) cid = ex.id;
    else {
      const { data: c, error } = await supabase.from('import_containers').insert({ shipment_id: sid, container_number: cont }).select('id').single();
      throwIf(error);
      cid = c!.id;
    }
  }
  const { error: plErr } = await supabase.from('import_packing_lines').insert(qtys.map(({ c, q }) => ({
    import_order_id: c.order.id, import_order_item_id: c.item.id, material_no: c.item.material_no || null,
    description: c.item.description || '', dn: c.item.dn || null, unit: c.item.unit || 'M',
    shipped_qty: q, delivery_note_no: dn, container_id: cid,
  })));
  throwIf(plErr);
  const order = qtys[0].c.order;
  const invVal = numOrNull(d.invoice_value);
  if (dn && (blank(d.invoice_no) || blank(d.invoice_date) || invVal != null)) {
    const { error } = await supabase.from('import_invoices').insert({
      import_order_id: order.id, shipment_id: sid, invoice_type: 'commercial', currency: order.currency || 'USD',
      invoice_no: blank(d.invoice_no), invoice_date: blank(d.invoice_date), net_value: invVal, delivery_notes: dn,
    });
    throwIf(error);
  }
  if (dn && blank(d.coa)) {
    const { error } = await supabase.from('import_coa').insert({ import_order_id: order.id, coa_no: blank(d.coa), delivery_notes: dn });
    throwIf(error);
  }
  for (const oid of new Set(qtys.map((x) => x.c.order.id))) await syncOrderStatus(supabase, oid);
}

/** Deletes ONLY the row's delivery-note lines (invoice, COA, container stay). */
export async function deleteTrackerRow(ctx: EditCtx, row: TrackerRow) {
  const lines = rowLinesOf(ctx, row);
  if (!lines.length) return;
  const { error } = await ctx.supabase.from('import_packing_lines').delete().in('id', lines.map((pl) => pl.id));
  throwIf(error);
  for (const oid of new Set(lines.map((pl) => pl.import_order_id))) await syncOrderStatus(ctx.supabase, oid);
}
