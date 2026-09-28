// Per-project import tracker — the model behind Nurit's follow-up sheet
// (docs/דוגמת מעקב יבוא איסכור): one row per container / delivery note,
// grouped by LOT (shipment), a column per ordered item holding the meters that
// container carried, and ordered / delivered / to-be-delivered at the bottom.
// Shared by the /import tracker view and its Excel export, so both show the
// same numbers. Every value keeps the id of the document it came from.

import { itemIdForLine, isItemComplete } from '@/lib/import-status';
import { numKey, pipeVariant, VARIANT_LABEL } from '@/lib/import-match';

const num = (v: unknown) => { const n = parseFloat(String(v ?? 0)); return isNaN(n) ? 0 : n; };
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const trimNo = (v: unknown) => String(v ?? '').replace(/\s+/g, '').toUpperCase();

export interface TrackerColumn {
  item: any;
  order: any;
  label: string;        // "DN1280 standard"
  lineLabel: string;    // "שורה 30" (the order line) — '' when unknown
  orderLabel: string;   // "Amiblu · 1322250749"
  ordered: number;
  shipped: number;
  remaining: number;    // ordered − shipped (negative = over-shipped)
  complete: boolean;
  manual: boolean;      // complete only because a user marked it
}

export interface TrackerRow {
  key: string;
  order: any | null;             // the PO this delivery note belongs to (ת.מ רכש)
  deliveryNote: string | null;
  packingDocId: string | null;   // delivery-note PDF
  container: any | null;
  loadingDate: string | null;
  qty: Record<string, number>;   // item id → meters in this container
  unmatched: number;             // meters not tied to any ordered item
  invoice: any | null;
  invoiceDocId: string | null;
  coa: { coa: any; docId: string | null }[];
}

export interface TrackerGroup {
  key: string;
  shipment: any | null;
  blDocId: string | null;
  status: string;
  rows: TrackerRow[];
}

export interface TrackerModel {
  columns: TrackerColumn[];
  groups: TrackerGroup[];
  unmatchedTotal: number;
  maxCoa: number;
}

export const SHIPMENT_STATUS_HE: Record<string, string> = {
  booked: 'הוזמן', sailing: 'בהפלגה', arrived: 'הגיע לנמל', customs: 'במכס', delivered: 'שוחרר', closed: 'נסגר',
};

const dm = (d: string) => { const x = new Date(d); return `${String(x.getDate()).padStart(2, '0')}/${String(x.getMonth() + 1).padStart(2, '0')}`; };

/** "סופק 05/04" / "השתחרר 05/04" / the shipment status — like column A of the sheet. */
export function lotStatus(s: any | null): string {
  if (!s) return '';
  if (s.customer_delivery_date) return `סופק ${dm(s.customer_delivery_date)}`;
  if (s.released_at) return `השתחרר ${dm(s.released_at)}`;
  return SHIPMENT_STATUS_HE[s.status] || s.status || '';
}

const listHas = (list: string | null | undefined, no: string | null) =>
  !!no && String(list || '').split(/[\s,;/]+/).map(trimNo).includes(trimNo(no));

/** The document a value came from: the explicit link, else by number/file name (legacy rows). */
function findDoc(docs: any[], id: string | null | undefined, pred: (d: any) => boolean, no?: string | null): string | null {
  if (id && docs.some((d) => d.id === id)) return id;
  if (!no) return null;
  const n = trimNo(no);
  const d = docs.find((x) => pred(x) && (trimNo(x.doc_number) === n || trimNo(x.file_name).includes(n)));
  return d?.id || null;
}

export function buildTracker(orders: any[], data: any): TrackerModel {
  const orderIds = new Set(orders.map((o) => o.id));
  const docs: any[] = data.docs || [];
  const itemsByOrder: Record<string, any[]> = {};
  for (const it of data.items || []) {
    if (!orderIds.has(it.import_order_id)) continue;
    (itemsByOrder[it.import_order_id] ||= []).push(it);
  }
  const packing = (data.packing || []).filter((pl: any) => orderIds.has(pl.import_order_id));

  // ---- columns: every ordered item, grouped by order ----
  const colItems: { item: any; order: any }[] = [];
  for (const o of orders) {
    const its = (itemsByOrder[o.id] || [])
      .filter((i) => num(i.ordered_qty) > 0)
      .sort((a, b) => (a.line_no ?? 1e9) - (b.line_no ?? 1e9) || (a.sort_order ?? 0) - (b.sort_order ?? 0));
    for (const item of its) colItems.push({ item, order: o });
  }
  const dnCount: Record<string, number> = {};
  for (const { item } of colItems) { const k = String(numKey(item.dn) ?? item.description); dnCount[k] = (dnCount[k] || 0) + 1; }
  const baseLabel = (item: any) => {
    const k = String(numKey(item.dn) ?? item.description);
    const dn = numKey(item.dn) ? `DN${numKey(item.dn)}` : (item.description || '—');
    return dnCount[k] > 1 ? `${dn} ${VARIANT_LABEL[pipeVariant(item.description)]}` : dn;
  };
  const labelCount: Record<string, number> = {};
  for (const { item } of colItems) { const l = baseLabel(item); labelCount[l] = (labelCount[l] || 0) + 1; }

  // ---- rows: one per container × delivery note ----
  const rowMap = new Map<string, TrackerRow>();
  const shippedByItem: Record<string, number> = {};
  let unmatchedTotal = 0;
  for (const pl of packing) {
    const key = `${pl.container_id || 'none'}|${trimNo(pl.delivery_note_no) || pl.id}`;
    let row = rowMap.get(key);
    if (!row) {
      const container = (data.containers || []).find((c: any) => c.id === pl.container_id) || null;
      row = {
        key, order: orders.find((o) => o.id === pl.import_order_id) || null,
        deliveryNote: pl.delivery_note_no || null, packingDocId: null, container,
        loadingDate: pl.loading_date || null, qty: {}, unmatched: 0,
        invoice: null, invoiceDocId: null, coa: [],
      };
      rowMap.set(key, row);
    }
    if (!row.packingDocId) {
      row.packingDocId = findDoc(docs, pl.source_document_id, (d) => d.doc_type === 'packing_list', pl.delivery_note_no);
    }
    const itemId = itemIdForLine(pl, itemsByOrder[pl.import_order_id] || []);
    const q = num(pl.shipped_qty);
    if (itemId && colItems.some((c) => c.item.id === itemId)) {
      row.qty[itemId] = r3((row.qty[itemId] || 0) + q);
      shippedByItem[itemId] = (shippedByItem[itemId] || 0) + q;
    } else {
      row.unmatched = r3(row.unmatched + q);
      unmatchedTotal += q;
    }
  }

  // invoice + COA per delivery note
  const invoices = (data.invoices || []).filter((iv: any) => !iv.import_order_id || orderIds.has(iv.import_order_id));
  const coas = (data.coa || []).filter((c: any) => !c.import_order_id || orderIds.has(c.import_order_id));
  let maxCoa = 0;
  for (const row of rowMap.values()) {
    const inv = invoices.find((iv: any) => listHas(iv.delivery_notes, row.deliveryNote)) || null;
    row.invoice = inv;
    row.invoiceDocId = inv ? findDoc(docs, inv.source_document_id, (d) => /invoice/.test(d.doc_type || ''), inv.invoice_no) : null;
    row.coa = coas
      .filter((c: any) => listHas(c.delivery_notes, row.deliveryNote))
      .map((c: any) => ({ coa: c, docId: findDoc(docs, c.source_document_id, (d) => d.doc_type === 'coa', c.coa_no) }));
    maxCoa = Math.max(maxCoa, row.coa.length);
  }

  // ---- groups: rows by LOT (the container's shipment) ----
  const groupMap = new Map<string, TrackerGroup>();
  for (const row of rowMap.values()) {
    const sid = row.container?.shipment_id || null;
    const key = sid || 'none';
    let g = groupMap.get(key);
    if (!g) {
      const shipment = sid ? (data.shipments || []).find((s: any) => s.id === sid) || null : null;
      g = {
        key, shipment, rows: [], status: lotStatus(shipment),
        blDocId: shipment ? (docs.find((d) => d.shipment_id === shipment.id && d.doc_type === 'bl')?.id || null) : null,
      };
      groupMap.set(key, g);
    }
    g.rows.push(row);
  }
  const rowDate = (r: TrackerRow) => r.invoice?.invoice_date || r.loadingDate || '';
  const groups = [...groupMap.values()];
  for (const g of groups) {
    g.rows.sort((a, b) => rowDate(a).localeCompare(rowDate(b))
      || String(a.invoice?.invoice_no || '').localeCompare(String(b.invoice?.invoice_no || ''))
      || String(a.deliveryNote || '').localeCompare(String(b.deliveryNote || '')));
  }
  const groupDate = (g: TrackerGroup) => g.rows.map(rowDate).filter(Boolean).sort()[0] || g.shipment?.created_at || '9999';
  groups.sort((a, b) => (a.key === 'none' ? 1 : 0) - (b.key === 'none' ? 1 : 0) || groupDate(a).localeCompare(groupDate(b)));

  const columns: TrackerColumn[] = colItems.map(({ item, order }) => {
    const ordered = num(item.ordered_qty);
    const shipped = r3(shippedByItem[item.id] || 0);
    const full = shipped + 1e-9 >= ordered;
    let label = baseLabel(item);
    if (labelCount[label] > 1) label += [item.pn && ` PN${item.pn}`, item.sn && ` SN${item.sn}`].filter(Boolean).join('');
    return {
      item, order, label,
      lineLabel: item.line_no != null ? `שורה ${item.line_no}` : '',
      orderLabel: [order.suppliers?.name, order.supplier_order_no || order.po_number].filter(Boolean).join(' · '),
      ordered, shipped, remaining: r3(ordered - shipped),
      complete: isItemComplete(item, shipped), manual: !full && !!item.completed_at,
    };
  });

  return { columns, groups, unmatchedTotal: r3(unmatchedTotal), maxCoa };
}
