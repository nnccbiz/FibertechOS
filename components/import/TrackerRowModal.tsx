'use client';

// Manual add / edit of one tracker row (container × delivery note): LOT,
// delivery note, container, the supplier invoice, meters per ordered item and
// COA numbers. Writes the same tables SmartUpload writes, so a hand-entered
// row behaves exactly like an extracted one (it just has no source document).
// Clearing a quantity sets it to 0 — nothing is deleted here except by the
// explicit, double-confirmed "delete row" (import:full only).

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { rowKeyOf, type TrackerColumn, type TrackerRow } from '@/lib/import-tracker';
import { deriveReceivedStatus, itemIdForLine } from '@/lib/import-status';
import Icon from '@/components/ui/Icon';

const NEW_LOT = '__new__';
const trimNo = (v: unknown) => String(v ?? '').replace(/\s+/g, '').toUpperCase();
const numOrNull = (v: string) => { const x = parseFloat(String(v).replace(',', '.')); return isNaN(x) ? null : x; };

// Replace one delivery-note number inside a comma list (invoice / COA coverage).
function swapInList(list: string | null | undefined, from: string | null, to: string): string {
  const parts = String(list || '').split(/[,;]+/).map((x) => x.trim()).filter(Boolean);
  const out = parts.map((x) => (from && trimNo(x) === trimNo(from) ? to : x));
  if (!out.some((x) => trimNo(x) === trimNo(to))) out.push(to);
  return out.join(', ');
}

// Re-derive an order's receipt status from fresh DB rows (closed / cancelled untouched).
async function syncOrderStatus(supabase: ReturnType<typeof createClient>, orderId: string) {
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

export default function TrackerRowModal({ row, defaultShipmentId, orders, columns, lotShipments, data, canDelete, onClose, onSaved }: {
  row: TrackerRow | null;
  defaultShipmentId: string | null;
  orders: any[];
  columns: TrackerColumn[];
  lotShipments: any[];
  data: any;
  canDelete: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const supabase = createClient();
  const isNew = !row;
  const inv = row?.invoice || null;

  const [shipmentId, setShipmentId] = useState<string>(row ? (row.container?.shipment_id || '') : (defaultShipmentId || NEW_LOT));
  const [newLot, setNewLot] = useState({ lot_label: '', bl_number: '', vessel_name: '', eta: '' });
  const [orderId, setOrderId] = useState<string>(row?.order?.id || orders[0]?.id || '');
  const [dn, setDn] = useState(row?.deliveryNote || '');
  const [containerNo, setContainerNo] = useState(row?.container?.container_number || '');
  const [invoice, setInvoice] = useState({
    invoice_no: inv?.invoice_no || '',
    invoice_date: inv?.invoice_date || '',
    value: inv ? String(inv.final_amount ?? inv.net_value ?? '') : '',
    currency: inv?.currency || orders.find((o) => o.id === (row?.order?.id || orders[0]?.id))?.currency || 'USD',
  });
  const [qty, setQty] = useState<Record<string, string>>(() =>
    Object.fromEntries(columns.map((c) => [c.item.id, row?.qty[c.item.id] ? String(row.qty[c.item.id]) : ''])));
  const [coaNos, setCoaNos] = useState<string[]>(() => (row?.coa || []).map((c) => c.coa.coa_no || ''));
  const [newCoa, setNewCoa] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  // The row's own packing lines (same identity the tracker grouped them by).
  const orderIds = new Set(orders.map((o) => o.id));
  const rowLines: any[] = row ? (data.packing || []).filter((pl: any) => orderIds.has(pl.import_order_id) && rowKeyOf(pl) === row.key) : [];

  async function save() {
    const dnT = dn.trim();
    const contT = containerNo.trim();
    if (!dnT && !contT) { setErr('יש להזין לפחות מספר תעודת משלוח (DN) או מספר מכולה.'); return; }
    if (shipmentId === NEW_LOT && !newLot.lot_label.trim()) { setErr('יש לתת שם ל-LOT החדש (למשל LOT5).'); return; }
    // A row lives on its delivery-note lines — a new one needs at least one quantity to exist.
    if (isNew && !columns.some((c) => (numOrNull(qty[c.item.id] || '') ?? 0) > 0)) { setErr('יש להזין כמות (מטרים) לפחות לפריט אחד.'); return; }
    setSaving(true); setErr('');
    try {
      // 1. LOT (shipment)
      let sid: string | null = shipmentId && shipmentId !== NEW_LOT ? shipmentId : null;
      if (shipmentId === NEW_LOT) {
        const blank = (v: string) => (v.trim() ? v.trim() : null);
        const { data: s, error } = await supabase.from('import_shipments').insert({
          lot_label: newLot.lot_label.trim(), bl_number: blank(newLot.bl_number), vessel_name: blank(newLot.vessel_name),
          eta: blank(newLot.eta), status: newLot.vessel_name.trim() ? 'sailing' : 'booked',
        }).select('id').single();
        if (error) throw error;
        sid = s.id;
      }

      // 2. Container — rename / move the row's container, or find-or-create one in the LOT.
      let containerId: string | null = row?.container?.id || null;
      if (containerId) {
        const patch: any = {};
        if (contT && contT !== (row!.container.container_number || '').trim()) patch.container_number = contT;
        if ((row!.container.shipment_id || null) !== sid) patch.shipment_id = sid;
        if (Object.keys(patch).length) {
          const { error } = await supabase.from('import_containers').update(patch).eq('id', containerId);
          if (error) throw error;
        }
      } else if (contT) {
        const ex = (data.containers || []).find((c: any) => trimNo(c.container_number) === trimNo(contT) && (c.shipment_id || null) === sid);
        if (ex) containerId = ex.id;
        else {
          const { data: c, error } = await supabase.from('import_containers').insert({ shipment_id: sid, container_number: contT }).select('id').single();
          if (error) throw error;
          containerId = c.id;
        }
      }

      // 3. Existing lines follow a changed DN / container.
      const oldDn = row?.deliveryNote || null;
      for (const pl of rowLines) {
        const patch: any = {};
        if ((pl.delivery_note_no || '') !== dnT) patch.delivery_note_no = dnT || null;
        if ((pl.container_id || null) !== containerId) patch.container_id = containerId;
        if (Object.keys(patch).length) {
          const { error } = await supabase.from('import_packing_lines').update(patch).eq('id', pl.id);
          if (error) throw error;
        }
      }

      // 4. Meters per item: update the row's line (extra lines → 0), or add a line.
      const touchedOrders = new Set<string>();
      for (const c of columns) {
        const want = numOrNull(qty[c.item.id] || '') ?? 0;
        const orderItems = (data.items || []).filter((i: any) => i.import_order_id === c.order.id);
        const lines = rowLines.filter((pl) => pl.import_order_id === c.order.id && itemIdForLine(pl, orderItems) === c.item.id);
        const have = lines.reduce((s, pl) => s + (parseFloat(pl.shipped_qty) || 0), 0);
        if (Math.abs(have - want) < 1e-9) continue;
        touchedOrders.add(c.order.id);
        if (lines.length) {
          const { error } = await supabase.from('import_packing_lines').update({ shipped_qty: want }).eq('id', lines[0].id);
          if (error) throw error;
          for (const extra of lines.slice(1)) {
            const { error: e2 } = await supabase.from('import_packing_lines').update({ shipped_qty: 0 }).eq('id', extra.id);
            if (e2) throw e2;
          }
        } else if (want > 0) {
          const { error } = await supabase.from('import_packing_lines').insert({
            import_order_id: c.order.id, import_order_item_id: c.item.id, material_no: c.item.material_no || null,
            description: c.item.description || '', dn: c.item.dn || null, unit: c.item.unit || 'M',
            shipped_qty: want, delivery_note_no: dnT || null, container_id: containerId,
          });
          if (error) throw error;
        }
      }

      // 5. Supplier invoice for this delivery note.
      const invNo = invoice.invoice_no.trim();
      const invVal = numOrNull(invoice.value);
      if (inv) {
        const patch: any = {
          invoice_no: invNo || null, invoice_date: invoice.invoice_date || null, currency: invoice.currency || 'USD',
        };
        if (inv.final_amount != null) patch.final_amount = invVal; else patch.net_value = invVal;
        if (dnT && trimNo(dnT) !== trimNo(oldDn)) patch.delivery_notes = swapInList(inv.delivery_notes, oldDn, dnT);
        const { error } = await supabase.from('import_invoices').update(patch).eq('id', inv.id);
        if (error) throw error;
      } else if (invNo || invVal != null || invoice.invoice_date) {
        if (!dnT) throw new Error('כדי לקשר חשבונית לשורה צריך מספר תעודת משלוח (DN).');
        const { error } = await supabase.from('import_invoices').insert({
          import_order_id: orderId || null, shipment_id: sid, invoice_no: invNo || null, invoice_type: 'commercial',
          invoice_date: invoice.invoice_date || null, currency: invoice.currency || 'USD', net_value: invVal, delivery_notes: dnT,
        });
        if (error) throw error;
      }

      // 6. COA numbers covering this delivery note.
      for (const [k, c] of (row?.coa || []).entries()) {
        const patch: any = {};
        if ((coaNos[k] || '').trim() !== (c.coa.coa_no || '')) patch.coa_no = (coaNos[k] || '').trim() || null;
        if (dnT && trimNo(dnT) !== trimNo(oldDn)) patch.delivery_notes = swapInList(c.coa.delivery_notes, oldDn, dnT);
        if (Object.keys(patch).length) {
          const { error } = await supabase.from('import_coa').update(patch).eq('id', c.coa.id);
          if (error) throw error;
        }
      }
      if (newCoa.trim()) {
        if (!dnT) throw new Error('כדי לקשר COA לשורה צריך מספר תעודת משלוח (DN).');
        const { error } = await supabase.from('import_coa').insert({ import_order_id: orderId || null, coa_no: newCoa.trim(), delivery_notes: dnT });
        if (error) throw error;
      }

      for (const oid of touchedOrders) await syncOrderStatus(supabase, oid);
      onSaved();
    } catch (e: any) {
      setErr(e?.message || 'שגיאה בשמירה');
      setSaving(false);
    }
  }

  async function deleteRow() {
    if (!row || !rowLines.length) return;
    if (!confirm(`למחוק את השורה (תעודה ${row.deliveryNote || '—'} · מכולה ${row.container?.container_number || '—'})? הכמויות שלה יוסרו מהמעקב.`)) return;
    if (!confirm('בטוח? לא ניתן לשחזר. (החשבונית, ה-COA והמכולה עצמם לא יימחקו.)')) return;
    setSaving(true);
    const { error } = await supabase.from('import_packing_lines').delete().in('id', rowLines.map((pl) => pl.id));
    if (error) { setErr(error.message); setSaving(false); return; }
    for (const oid of new Set(rowLines.map((pl) => pl.import_order_id))) await syncOrderStatus(supabase, oid);
    onSaved();
  }

  const inp = 'w-full border border-line-subtle rounded-lg px-2 py-1.5 text-[13px]';
  const lbl = 'text-[11px] text-content-muted';
  const orderLabel = (o: any) => [o.po_number, o.supplier_order_no && `ספק ${o.supplier_order_no}`, o.suppliers?.name].filter(Boolean).join(' · ') || 'הזמנה';

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center overflow-y-auto p-4" onClick={onClose}>
      <div className="bg-white rounded-xl p-5 w-full max-w-2xl my-6" dir="rtl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-content-strong">{isNew ? 'הוספת שורה למעקב' : 'עריכת שורה'}</h3>
          <button onClick={onClose} className="text-content-muted hover:text-content-strong"><Icon name="close" size={18} /></button>
        </div>
        {err && <div className="bg-danger-soft text-danger text-[12px] rounded-lg px-3 py-2 mb-3">{err}</div>}

        <div className="grid grid-cols-2 gap-3">
          <label className="block"><span className={lbl}>LOT</span>
            <select className={inp} value={shipmentId} onChange={(e) => setShipmentId(e.target.value)}>
              <option value="">— ללא LOT —</option>
              {lotShipments.map((s: any) => (
                <option key={s.id} value={s.id}>{[s.lot_label, s.bl_number && `BL ${s.bl_number}`].filter(Boolean).join(' · ') || 'LOT ללא שם'}</option>
              ))}
              <option value={NEW_LOT}>+ LOT חדש</option>
            </select>
          </label>
          {orders.length > 1 ? (
            <label className="block"><span className={lbl}>הזמנת רכש (ת.מ רכש)</span>
              <select className={inp} value={orderId} onChange={(e) => setOrderId(e.target.value)}>
                {orders.map((o) => <option key={o.id} value={o.id}>{orderLabel(o)}</option>)}
              </select>
            </label>
          ) : <div className="text-[12px] text-content-muted self-end pb-2">הזמנת רכש: <span dir="ltr">{orders[0] ? orderLabel(orders[0]) : '—'}</span></div>}
        </div>

        {shipmentId === NEW_LOT && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3 bg-neutral-50 rounded-lg p-3">
            <label className="block"><span className={lbl}>שם LOT *</span><input className={inp} dir="ltr" value={newLot.lot_label} onChange={(e) => setNewLot({ ...newLot, lot_label: e.target.value })} placeholder="LOT5" /></label>
            <label className="block"><span className={lbl}>BL</span><input className={inp} dir="ltr" value={newLot.bl_number} onChange={(e) => setNewLot({ ...newLot, bl_number: e.target.value })} /></label>
            <label className="block"><span className={lbl}>אוניה</span><input className={inp} dir="ltr" value={newLot.vessel_name} onChange={(e) => setNewLot({ ...newLot, vessel_name: e.target.value })} /></label>
            <label className="block"><span className={lbl}>ETA</span><input type="date" className={inp} value={newLot.eta} onChange={(e) => setNewLot({ ...newLot, eta: e.target.value })} /></label>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 mt-3">
          <label className="block"><span className={lbl}>תעודת משלוח (DN)</span><input className={inp} dir="ltr" value={dn} onChange={(e) => setDn(e.target.value)} /></label>
          <label className="block"><span className={lbl}>מספר מכולה</span><input className={inp} dir="ltr" value={containerNo} onChange={(e) => setContainerNo(e.target.value)} /></label>
        </div>

        <p className="text-[12px] font-semibold text-content-body mt-4 mb-1.5">חשבונית ספק</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <label className="block"><span className={lbl}>Invoice no.</span><input className={inp} dir="ltr" value={invoice.invoice_no} onChange={(e) => setInvoice({ ...invoice, invoice_no: e.target.value })} /></label>
          <label className="block"><span className={lbl}>Date of INV</span><input type="date" className={inp} value={invoice.invoice_date} onChange={(e) => setInvoice({ ...invoice, invoice_date: e.target.value })} /></label>
          <label className="block"><span className={lbl}>Invoice value</span><input className={inp} dir="ltr" inputMode="decimal" value={invoice.value} onChange={(e) => setInvoice({ ...invoice, value: e.target.value })} /></label>
          <label className="block"><span className={lbl}>מטבע</span>
            <select className={inp} value={invoice.currency} onChange={(e) => setInvoice({ ...invoice, currency: e.target.value })}>
              {['USD', 'EUR', 'GBP', 'ILS'].map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
        </div>
        {inv && (inv.delivery_notes || '').split(',').filter(Boolean).length > 1 && (
          <p className="text-[11px] text-warning mt-1">החשבונית הזו מכסה כמה תעודות משלוח — שינוי בה יחול על כולן.</p>
        )}

        <p className="text-[12px] font-semibold text-content-body mt-4 mb-1.5">מטרים בשורה זו</p>
        {columns.length === 0 ? <p className="text-[12px] text-content-muted">אין פריטים בהזמנות הפרויקט.</p> : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {columns.map((c) => (
              <label key={c.item.id} className="block">
                <span className={lbl} dir="ltr" title={c.item.description}>{c.label}</span>
                <input className={inp} dir="ltr" inputMode="decimal" value={qty[c.item.id] || ''} onChange={(e) => setQty({ ...qty, [c.item.id]: e.target.value })} />
              </label>
            ))}
          </div>
        )}
        {row && row.unmatched > 0 && (
          <p className="text-[11px] text-warning mt-1">{row.unmatched} מ׳ בשורה לא משויכים לפריט (נשארים כפי שהם).</p>
        )}

        <p className="text-[12px] font-semibold text-content-body mt-4 mb-1.5">COA</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {coaNos.map((v, k) => (
            <input key={k} className={inp} dir="ltr" value={v} onChange={(e) => setCoaNos(coaNos.map((x, j) => (j === k ? e.target.value : x)))} />
          ))}
          <input className={inp} dir="ltr" value={newCoa} onChange={(e) => setNewCoa(e.target.value)} placeholder="+ COA נוסף" />
        </div>

        <div className="flex items-center gap-2 mt-5">
          <button onClick={save} disabled={saving} className="bg-primary text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-primary-700 disabled:opacity-40">{saving ? 'שומר…' : 'שמור'}</button>
          <button onClick={onClose} className="text-sm px-4 py-2 rounded-lg border border-line-subtle text-content-body">ביטול</button>
          {!isNew && canDelete && rowLines.length > 0 && (
            <button onClick={deleteRow} disabled={saving} className="text-[12px] text-danger hover:underline mr-auto disabled:opacity-40">מחיקת השורה</button>
          )}
        </div>
      </div>
    </div>
  );
}
