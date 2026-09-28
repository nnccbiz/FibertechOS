// Excel export of the per-project import tracker, in the layout of Nurit's
// ISKOOR sheet: line numbers + supplier/order above the item columns, the
// header row, one row per container grouped by LOT (LOT cells merged down the
// group), and Ordered quantity / delivered / to be delivered at the bottom.
// xlsx is loaded on demand — it is only needed when the button is pressed.

import type { TrackerModel } from '@/lib/import-tracker';

// Excel serial day number (the 1900 system), from an ISO date string.
function serial(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return (Date.UTC(+m[1], +m[2] - 1, +m[3]) - Date.UTC(1899, 11, 30)) / 864e5;
}

const n = (v: unknown) => { const x = parseFloat(String(v ?? '')); return isNaN(x) ? null : x; };

export async function exportTrackerXlsx(model: TrackerModel, projectName: string) {
  const XLSX = await import('xlsx');
  const { columns, groups, unmatchedTotal } = model;
  const hasUnmatched = unmatchedTotal > 0;
  const coaCols = Math.max(model.maxCoa, 1);

  const FIXED = 11; // A..K
  const itemStart = FIXED;
  const unmatchedCol = itemStart + columns.length;
  const poCol = unmatchedCol + (hasUnmatched ? 1 : 0);
  const coaStart = poCol + 1;
  const width = coaStart + coaCols;

  const aoa: any[][] = [];
  const blank = () => new Array(width).fill(null);
  const dateCells: [number, number][] = [];
  const merges: { s: { r: number; c: number }; e: { r: number; c: number } }[] = [];

  // Row 1: order line numbers
  const r1 = blank();
  columns.forEach((c, i) => { r1[itemStart + i] = c.lineLabel || null; });
  aoa.push(r1);

  // Row 2: supplier · order over each order's span
  const r2 = blank();
  let i = 0;
  while (i < columns.length) {
    let j = i;
    while (j + 1 < columns.length && columns[j + 1].order.id === columns[i].order.id) j++;
    r2[itemStart + i] = columns[i].orderLabel || null;
    if (j > i) merges.push({ s: { r: 1, c: itemStart + i }, e: { r: 1, c: itemStart + j } });
    i = j + 1;
  }
  aoa.push(r2);

  // Row 3: headers
  const h = blank();
  ['', '', 'BL', 'תאריך שחרור', 'ETA', 'תאריך אספקה ללקוח ', 'Date of INV', 'DN', 'Invoice no.', 'Invoice value', 'Container no.']
    .forEach((t, k) => { h[k] = t || null; });
  columns.forEach((c, k) => { h[itemStart + k] = c.label; });
  if (hasUnmatched) h[unmatchedCol] = 'לא משויך';
  h[poCol] = 'ת.מ רכש ';
  for (let k = 0; k < coaCols; k++) h[coaStart + k] = `COA${k + 1}`;
  aoa.push(h);

  // Data rows, grouped by LOT
  for (const g of groups) {
    const s = g.shipment;
    const first = aoa.length;
    g.rows.forEach((row, idx) => {
      const r = blank();
      if (idx === 0) {
        r[0] = g.status || null;
        r[1] = s?.lot_label || (g.key === 'none' ? 'ללא LOT' : null);
        r[2] = s?.bl_number || null;
        r[3] = serial(s?.released_at);
        r[4] = serial(s?.eta);
        r[5] = serial(s?.customer_delivery_date);
      }
      r[6] = serial(row.invoice?.invoice_date);
      r[7] = row.deliveryNote || null;
      r[8] = row.invoice?.invoice_no || null;
      r[9] = n(row.invoice?.final_amount ?? row.invoice?.net_value);
      r[10] = row.container?.container_number || null;
      columns.forEach((c, k) => { const q = row.qty[c.item.id]; r[itemStart + k] = q ? q : null; });
      if (hasUnmatched) r[unmatchedCol] = row.unmatched || null;
      r[poCol] = row.order?.po_number || null;
      row.coa.forEach((c, k) => { if (k < coaCols) r[coaStart + k] = c.coa.coa_no || (c.coa.dn ? `DN${c.coa.dn}` : null); });
      const rIdx = aoa.length;
      for (const c of [3, 4, 5, 6]) if (r[c] != null) dateCells.push([rIdx, c]);
      aoa.push(r);
    });
    const last = aoa.length - 1;
    if (last > first) for (let c = 0; c <= 5; c++) merges.push({ s: { r: first, c }, e: { r: last, c } });
  }

  // Bottom: ordered / delivered / to be delivered
  const tot = (label: string, pick: (c: TrackerModel['columns'][number]) => number | null, unmatched: number | null) => {
    const r = blank();
    r[10] = label;
    columns.forEach((c, k) => { r[itemStart + k] = pick(c); });
    if (hasUnmatched) r[unmatchedCol] = unmatched;
    aoa.push(r);
  };
  tot('Ordered quantity', (c) => c.ordered, null);
  tot('delivered ', (c) => c.shipped, unmatchedTotal);
  tot('to be delivered ', (c) => c.remaining, null);
  if (columns.some((c) => c.manual)) {
    const r = blank();
    r[10] = 'הושלם ידנית';
    columns.forEach((c, k) => { if (c.manual) r[itemStart + k] = 'V'; });
    aoa.push(r);
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  for (const [r, c] of dateCells) {
    const ref = XLSX.utils.encode_cell({ r, c });
    if (ws[ref]) { ws[ref].t = 'n'; ws[ref].z = 'd/m/yy'; }
  }
  ws['!merges'] = merges;
  ws['!cols'] = Array.from({ length: width }, (_, c) =>
    ({ wch: c === 0 ? 14 : c === 1 ? 9 : c === 10 ? 17 : c < FIXED ? 12 : c >= coaStart ? 9 : 13 }));

  const wb = XLSX.utils.book_new();
  const sheetName = (projectName || 'מעקב יבוא').replace(/[\[\]:*?/\\]/g, ' ').slice(0, 31);
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  const stamp = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `מעקב יבוא - ${projectName || 'פרויקט'} - ${stamp}.xlsx`);
}
