'use client';

/**
 * Purchase receipts (תעודת משלוח רכש) — the stock-IN gate.
 * The system DRAFTS the receipt from the packing lines Roxy already extracted
 * (falling back to the PO items); Nitzan (factory) or Zamir (site unloading)
 * only confirms quantities. Discrepancies vs the order are computed per line.
 * Confirming writes the inventory IN movements and opens Miri's booking task.
 */
import { useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import Icon from '@/components/ui/Icon';
import { itemKey, guessCategory } from '@/lib/inventory';

function fmtDate(d: string | null) {
  return d ? new Date(d).toLocaleDateString('he-IL') : '—';
}

export default function ReceiptsPanel({ order, data, canEdit, onUpdate }: any) {
  const supabase = createClient();
  const receipts = (data.receipts || []).filter((r: any) => r.import_order_id === order.id);
  const receiptLines = data.receiptLines || [];
  const orderItems = (data.items || []).filter((i: any) => i.import_order_id === order.id);
  const packing = (data.packing || []).filter((p: any) => p.import_order_id === order.id);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);

  // How much of each PO line was already received on CONFIRMED receipts.
  const receivedByItem = useMemo(() => {
    const ids = new Set(receipts.filter((r: any) => r.status === 'confirmed').map((r: any) => r.id));
    const m: Record<string, number> = {};
    receiptLines.filter((l: any) => ids.has(l.receipt_id)).forEach((l: any) => {
      if (l.import_order_item_id) m[l.import_order_item_id] = (m[l.import_order_item_id] || 0) + (Number(l.received_qty) || 0);
    });
    return m;
  }, [receipts, receiptLines]);

  async function createDraft(location: 'factory' | 'site') {
    setCreating(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: rec, error } = await supabase.from('purchase_receipts').insert({
        import_order_id: order.id,
        project_id: order.project_id || null,
        location,
        created_by: user?.id || null,
      }).select('id').single();
      if (error || !rec) { alert(`שגיאה: ${error?.message}`); return; }

      // Draft lines: packing lines when we have them (what actually shipped),
      // else the PO items (what was ordered).
      const src = packing.length
        ? packing.map((pl: any) => {
            const item = orderItems.find((i: any) => i.id === pl.import_order_item_id)
              || orderItems.find((i: any) => i.dn != null && String(i.dn) === String(pl.dn));
            return {
              receipt_id: rec.id,
              import_order_item_id: item?.id || null,
              packing_line_id: pl.id,
              material_no: pl.material_no || item?.material_no || null,
              description: pl.description || item?.description || null,
              dn: pl.dn ?? item?.dn ?? null,
              pn: item?.pn ?? null,
              sn: item?.sn ?? null,
              unit: pl.unit || item?.unit || null,
              ordered_qty: item?.ordered_qty ?? null,
              received_qty: Number(pl.shipped_qty) || 0,
            };
          })
        : orderItems.map((i: any) => ({
            receipt_id: rec.id,
            import_order_item_id: i.id,
            material_no: i.material_no || null,
            description: i.description || null,
            dn: i.dn ?? null, pn: i.pn ?? null, sn: i.sn ?? null,
            unit: i.unit || null,
            ordered_qty: i.ordered_qty ?? null,
            received_qty: Number(i.ordered_qty) || 0,
          }));
      if (src.length) await supabase.from('purchase_receipt_lines').insert(src);
      onUpdate();
    } finally { setCreating(false); }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-[11px] text-neutral-400">טיוטת הקליטה נבנית אוטומטית מנתוני המשלוח — רק לאשר כמויות. אישור = כניסה למלאי + משימת קליטת חשבונית למירי.</p>
        {canEdit && (
          <div className="flex gap-1.5">
            <button disabled={creating} onClick={() => createDraft('factory')} className="text-[12px] bg-primary text-white px-3 py-1.5 rounded-lg hover:bg-primary-700 disabled:opacity-50 whitespace-nowrap">
              <Icon name="add" size={13} /> קליטה במפעל
            </button>
            <button disabled={creating} onClick={() => createDraft('site')} className="text-[12px] bg-azure-600 text-white px-3 py-1.5 rounded-lg hover:opacity-90 disabled:opacity-50 whitespace-nowrap">
              <Icon name="location" size={13} /> קליטה באתר (זמיר)
            </button>
          </div>
        )}
      </div>

      {receipts.length === 0 && <p className="text-[13px] text-neutral-400 py-2">אין קליטות עדיין</p>}

      <div className="space-y-2">
        {receipts.map((r: any) => (
          <ReceiptCard
            key={r.id} receipt={r} order={order}
            lines={receiptLines.filter((l: any) => l.receipt_id === r.id)}
            receivedByItem={receivedByItem}
            canEdit={canEdit} supabase={supabase} onUpdate={onUpdate}
            busy={busy} setBusy={setBusy}
          />
        ))}
      </div>
    </div>
  );
}

function ReceiptCard({ receipt: r, order, lines, canEdit, supabase, onUpdate, busy, setBusy }: any) {
  const [open, setOpen] = useState(r.status === 'draft');
  const [edited, setEdited] = useState<Record<string, string>>({});
  const [verifier, setVerifier] = useState(r.verifier_name || '');

  const qtyOf = (l: any) => edited[l.id] !== undefined ? parseFloat(edited[l.id]) || 0 : Number(l.received_qty) || 0;

  async function confirmReceipt() {
    if (busy) return;
    setBusy(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      // 1. Persist edited quantities
      for (const l of lines) {
        if (edited[l.id] !== undefined) {
          await supabase.from('purchase_receipt_lines').update({ received_qty: parseFloat(edited[l.id]) || 0 }).eq('id', l.id);
        }
      }
      // 2. Number + confirm the receipt
      const { data: recNo } = await supabase.rpc('next_doc_number', { p_kind: 'pr' });
      const { error } = await supabase.from('purchase_receipts').update({
        status: 'confirmed', receipt_number: recNo || null,
        verifier_name: verifier.trim() || null,
        confirmed_by: user?.id || null, confirmed_at: new Date().toISOString(),
      }).eq('id', r.id);
      if (error) { alert(`שגיאה: ${error.message}`); return; }

      // 3. Stock IN movements
      const movements = lines
        .map((l: any) => ({ l, qty: qtyOf(l) }))
        .filter(({ qty }: any) => qty > 0)
        .map(({ l, qty }: any) => ({
          direction: 'in',
          item_key: itemKey({ description: l.description, dn: l.dn, pn: l.pn, sn: l.sn, length_m: l.length_m }),
          description: l.description || (l.dn ? `DN${l.dn}` : 'פריט'),
          category: guessCategory(l.description),
          dn: l.dn ?? null, pn: l.pn ?? null, sn: l.sn ?? null, length_m: l.length_m ?? null,
          unit: l.unit || null, qty,
          project_id: order.project_id || null,
          source_type: 'purchase_receipt', receipt_id: r.id,
          created_by: user?.id || null,
        }));
      if (movements.length) {
        const { error: mvErr } = await supabase.from('inventory_movements').insert(movements);
        if (mvErr) alert(`הקליטה אושרה אך עדכון המלאי נכשל: ${mvErr.message}`);
      }

      // 4. Miri: book the supplier invoice
      const { data: members } = await supabase.from('team_members').select('id, name').eq('active', true);
      const miri = (members || []).find((m: any) => m.name.includes('מירי'));
      await supabase.from('alerts').insert({
        project_id: order.project_id || null,
        type: 'task',
        message: `לקלוט חשבונית ספק: תעודת רכש ${recNo || ''} (${order.projects?.name || order.project_name || ''}) אושרה — החשבונית ממתינה לקליטה במסך היבוא.`,
        is_resolved: false,
        assigned_to: miri?.id || null,
      });

      // 5. Discrepancies → a task for the office
      const gaps = lines.filter((l: any) => l.ordered_qty != null && qtyOf(l) !== Number(l.ordered_qty));
      if (gaps.length) {
        await supabase.from('alerts').insert({
          project_id: order.project_id || null,
          type: 'task',
          message: `פערי קבלה בתעודת רכש ${recNo || ''}: ${gaps.slice(0, 3).map((l: any) => `${l.description || 'פריט'} הוזמן ${l.ordered_qty} התקבל ${qtyOf(l)}`).join(' · ')}${gaps.length > 3 ? ` ועוד ${gaps.length - 3}` : ''} — לברר מול הספק לפני קליטת החשבונית.`,
          is_resolved: false,
        });
      }
      onUpdate();
    } finally { setBusy(false); }
  }

  async function remove() {
    if (!window.confirm('למחוק את טיוטת הקליטה?')) return;
    await supabase.from('purchase_receipts').delete().eq('id', r.id);
    onUpdate();
  }

  return (
    <div className="bg-white border border-line-subtle rounded-lg">
      <div className="px-3 py-2 flex items-center justify-between cursor-pointer" onClick={() => setOpen(!open)}>
        <div className="flex items-center gap-2 text-[13px]">
          <span className="font-semibold text-content-body" dir="ltr">{r.receipt_number || 'טיוטה'}</span>
          <span className="text-content-muted">{fmtDate(r.received_at)}</span>
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-neutral-100 text-content-muted">{r.location === 'site' ? 'באתר הלקוח' : 'במפעל'}</span>
        </div>
        <div className="flex items-center gap-1.5">
          {r.status === 'confirmed'
            ? <span className="text-[11px] px-2 py-0.5 rounded-full bg-success-soft text-success font-semibold"><Icon name="confirm" size={11} /> נקלט למלאי{r.verifier_name ? ` · ${r.verifier_name}` : ''}</span>
            : <span className="text-[11px] px-2 py-0.5 rounded-full bg-warning-soft text-warning font-semibold">טיוטה — ממתין לאימות</span>}
          <Icon name={open ? 'caretUp' : 'caretDown'} size={12} />
        </div>
      </div>

      {open && (
        <div className="border-t border-line-subtle px-3 py-2 space-y-2">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="text-neutral-400 text-[11px] text-right">
                <th className="font-medium py-1">פריט</th>
                <th className="font-medium py-1 text-center">הוזמן</th>
                <th className="font-medium py-1 text-center">התקבל</th>
                <th className="font-medium py-1 text-center">פער</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l: any) => {
                const rec = qtyOf(l);
                const gap = l.ordered_qty != null ? rec - Number(l.ordered_qty) : null;
                return (
                  <tr key={l.id} className="border-t border-line-subtle">
                    <td className="py-1.5">
                      <span dir="ltr">{l.dn ? `DN${l.dn} ` : ''}</span>{l.description || l.material_no || '—'}
                    </td>
                    <td className="py-1.5 text-center text-content-muted" dir="ltr">{l.ordered_qty ?? '—'}{l.unit ? ` ${l.unit}` : ''}</td>
                    <td className="py-1.5 text-center">
                      {r.status === 'draft' && canEdit ? (
                        <input type="number" dir="ltr"
                          value={edited[l.id] !== undefined ? edited[l.id] : (l.received_qty ?? '')}
                          onChange={(e) => setEdited((p) => ({ ...p, [l.id]: e.target.value }))}
                          className="w-20 border border-line-subtle rounded px-1 py-0.5 text-center" />
                      ) : <span dir="ltr">{l.received_qty}</span>}
                    </td>
                    <td className="py-1.5 text-center">
                      {gap == null ? '—' : gap === 0
                        ? <span className="text-success"><Icon name="confirm" size={12} /></span>
                        : <span className="font-bold text-danger" dir="ltr">{gap > 0 ? `+${gap}` : gap}</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {r.status === 'draft' && canEdit && (
            <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-line-subtle">
              <input value={verifier} onChange={(e) => setVerifier(e.target.value)}
                placeholder={r.location === 'site' ? 'שם המוודא באתר (זמיר)' : 'שם המוודא במפעל'}
                className="flex-1 min-w-[160px] border border-line-subtle rounded px-2 py-1 text-[12px]" />
              <button disabled={busy} onClick={confirmReceipt} className="text-[12px] bg-success text-white px-4 py-1.5 rounded-lg hover:opacity-90 disabled:opacity-50 font-semibold">
                <Icon name="confirm" size={13} /> אשר קליטה למלאי
              </button>
              <button disabled={busy} onClick={remove} className="text-[12px] text-danger hover:underline">מחק טיוטה</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
