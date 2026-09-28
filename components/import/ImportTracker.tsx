'use client';

// Per-project import tracker — Nurit's follow-up sheet (ISKOOR sample in
// docs/דוגמת מעקב יבוא איסכור) as a live screen: a row per container /
// delivery note grouped by LOT, a column per ordered item, ordered /
// delivered / to be delivered at the bottom, and what is still missing per
// order. Every value opens the document it was taken from.

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { buildTracker, SHIPMENT_STATUS_HE, type TrackerGroup } from '@/lib/import-tracker';
import { exportTrackerXlsx } from '@/lib/import-tracker-xlsx';
import { deriveReceivedStatus, orderShortfall } from '@/lib/import-status';
import SearchableSelect from '@/components/ui/SearchableSelect';
import POViewModal from '@/components/import/POViewModal';
import Icon from '@/components/ui/Icon';

const STOCK = '__stock__';
const fmtQ = (v: number) => v.toLocaleString('en-US', { maximumFractionDigits: 3 });
const fmtD = (d?: string | null) => (d ? new Date(d).toLocaleDateString('he-IL') : '');
function money(v: any, currency = 'USD') {
  const x = parseFloat(v);
  if (isNaN(x)) return '';
  try { return new Intl.NumberFormat('he-IL', { style: 'currency', currency, maximumFractionDigits: 2 }).format(x); }
  catch { return `${x} ${currency}`; }
}

/**
 * Mark / unmark an order item complete by hand, then re-derive the order's
 * receipt status (same rule as SmartUpload; closed / cancelled untouched).
 */
export async function toggleItemComplete(item: any, order: any, data: any): Promise<string | null> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const marking = !item.completed_at;
  const patch = marking
    ? { completed_at: new Date().toISOString(), completed_by: user?.id || null }
    : { completed_at: null, completed_by: null };
  const { error } = await supabase.from('import_order_items').update(patch).eq('id', item.id);
  if (error) return error.message;
  if (order && order.status !== 'closed' && order.status !== 'cancelled') {
    const items = (data.items || []).filter((i: any) => i.import_order_id === order.id)
      .map((i: any) => (i.id === item.id ? { ...i, ...patch } : i));
    const packing = (data.packing || []).filter((p: any) => p.import_order_id === order.id);
    const derived = deriveReceivedStatus(items, packing);
    const next = derived === 'received' ? 'received'
      : derived === 'partially_received' ? 'partially_received'
      : null;
    if (next && next !== order.status) {
      await supabase.from('import_orders').update({ status: next, updated_at: new Date().toISOString() }).eq('id', order.id);
    }
  }
  return null;
}

export default function ImportTracker({ data, canEdit, onUpdate, initialProjectId }: {
  data: any; canEdit: boolean; onUpdate: () => void; initialProjectId?: string | null;
}) {
  const supabase = createClient();
  const liveOrders = (data.orders || []).filter((o: any) => o.status !== 'cancelled');

  // Import projects = projects with a live (sent) order; stock orders together.
  const projects = useMemo(() => {
    const m = new Map<string, { id: string; name: string; hasPacking: boolean }>();
    for (const o of liveOrders) {
      const id = o.project_id || STOCK;
      const name = o.project_id ? (o.projects?.name || o.project_name || 'פרויקט') : 'מלאי (ללא פרויקט)';
      const cur = m.get(id) || { id, name, hasPacking: false };
      if ((data.packing || []).some((p: any) => p.import_order_id === o.id)) cur.hasPacking = true;
      m.set(id, cur);
    }
    return [...m.values()].sort((a, b) => a.name.localeCompare(b.name, 'he'));
  }, [data]);

  const [projectId, setProjectId] = useState<string>('');
  useEffect(() => {
    if (projectId && projects.some((p) => p.id === projectId)) return;
    const init = initialProjectId && projects.some((p) => p.id === initialProjectId) ? initialProjectId : null;
    setProjectId(init || projects.find((p) => p.hasPacking)?.id || projects[0]?.id || '');
  }, [projects, initialProjectId]);

  const orders = useMemo(
    () => liveOrders.filter((o: any) => (projectId === STOCK ? !o.project_id : o.project_id === projectId)),
    [data, projectId],
  );
  const model = useMemo(() => buildTracker(orders, data), [orders, data]);
  const projectName = projects.find((p) => p.id === projectId)?.name || '';

  const [poView, setPoView] = useState<any | null>(null);
  const [editLot, setEditLot] = useState<TrackerGroup | null>(null);
  const [busyItem, setBusyItem] = useState<string | null>(null);

  // Safari-safe: open the tab synchronously in the click, point it after the signed URL resolves.
  function openDoc(docId: string | null) {
    const doc = docId ? (data.docs || []).find((d: any) => d.id === docId) : null;
    if (!doc) return;
    const w = window.open('about:blank', '_blank');
    supabase.storage.from('project-files').createSignedUrl(doc.file_path, 600).then(({ data: s }) => {
      if (s?.signedUrl) { if (w) w.location.href = s.signedUrl; else window.open(s.signedUrl, '_blank'); }
      else { w?.close(); alert('לא ניתן לפתוח את המסמך'); }
    });
  }

  async function toggleComplete(item: any, order: any) {
    const msg = item.completed_at
      ? 'לבטל את הסימון "הושלם" לפריט זה? הוא יחזור להיחשב חסר.'
      : 'לסמן את הפריט כהושלם למרות שהכמות שנשלחה קטנה מהמוזמן?';
    if (!confirm(msg)) return;
    setBusyItem(item.id);
    const err = await toggleItemComplete(item, order, data);
    setBusyItem(null);
    if (err) { alert('שגיאה: ' + err); return; }
    onUpdate();
  }

  if (!projects.length) {
    return <div className="bg-white rounded-xl border border-line-subtle p-8 text-center text-content-muted text-sm">אין עדיין הזמנות יבוא שנשלחו לספק.</div>;
  }

  const { columns, groups, unmatchedTotal } = model;
  const hasUnmatched = unmatchedTotal > 0;
  const coaCols = Math.max(model.maxCoa, 1);
  const orderSpans: { order: any; label: string; span: number }[] = [];
  for (const c of columns) {
    const last = orderSpans[orderSpans.length - 1];
    if (last && last.order.id === c.order.id) last.span++;
    else orderSpans.push({ order: c.order, label: c.orderLabel, span: 1 });
  }
  const itemsOf = (orderId: string) => (data.items || []).filter((i: any) => i.import_order_id === orderId);

  const th = 'px-2 py-1.5 font-medium text-[11px] text-content-muted whitespace-nowrap border-b border-line-subtle';
  const td = 'px-2 py-1.5 whitespace-nowrap border-b border-line-subtle';

  return (
    <div className="space-y-4">
      {/* Project picker + export */}
      <div className="bg-white rounded-xl border border-line-subtle px-4 py-3 flex flex-wrap items-center gap-3">
        <span className="text-[13px] font-semibold text-content-body"><Icon name="projects" size={16} /> פרויקט</span>
        <SearchableSelect
          value={projectId}
          onChange={setProjectId}
          options={projects.map((p) => ({ value: p.id, label: p.name }))}
          className="min-w-[240px] border border-line-subtle rounded-lg px-2 py-1.5 text-[13px] bg-white"
        />
        <button
          onClick={() => exportTrackerXlsx(model, projectName)}
          disabled={!columns.length && !groups.length}
          className="mr-auto text-[13px] font-semibold bg-success text-white px-3 py-1.5 rounded-lg hover:opacity-90 disabled:opacity-40"
        >
          <Icon name="excel" size={16} /> ייצוא לאקסל
        </button>
      </div>

      {/* What is still missing, per order */}
      <div className="grid gap-2 md:grid-cols-2">
        {orders.map((o: any) => {
          const rows = orderShortfall(itemsOf(o.id), (data.packing || []).filter((p: any) => p.import_order_id === o.id));
          const missing = rows.filter((r) => !r.complete);
          const label = [o.po_number, o.supplier_order_no && `ספק ${o.supplier_order_no}`, o.suppliers?.name].filter(Boolean).join(' · ') || 'הזמנה';
          return (
            <div key={o.id} className={`rounded-xl border px-3 py-2.5 ${missing.length ? 'bg-warning-soft border-warning-soft' : 'bg-success-soft border-success-soft'}`}>
              <div className="flex items-center justify-between gap-2 mb-1">
                <button onClick={() => setPoView(o)} className="text-[13px] font-semibold text-content-strong hover:underline text-right" dir="ltr">{label}</button>
                <span className={`text-[11px] font-semibold ${missing.length ? 'text-warning' : 'text-success'}`}>
                  {rows.length === 0 ? 'אין פריטים בהזמנה' : missing.length ? `חסר להשלמה: ${missing.length} פריטים` : <><Icon name="success" size={12} /> הושלמה מול הספק</>}
                </span>
              </div>
              {missing.length > 0 && (
                <ul className="text-[12px] text-content-body space-y-0.5">
                  {missing.map((r) => (
                    <li key={r.item.id} className="flex justify-between gap-2">
                      <span className="truncate" title={r.item.description}>{columns.find((c) => c.item.id === r.item.id)?.label || r.item.description}</span>
                      <span className="font-mono text-warning" dir="ltr">{fmtQ(r.remaining)} / {fmtQ(r.ordered)} {r.item.unit || ''}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>

      {hasUnmatched && (
        <div className="bg-warning-soft text-warning text-[12px] rounded-lg px-3 py-2">
          <Icon name="warning" size={14} /> {fmtQ(unmatchedTotal)} מ׳ בתעודות המשלוח לא שויכו לפריט בהזמנה (עמודת "לא משויך") ולכן אינם נספרים בחסר להשלמה. אפשר לשייך אותם בהעלאה החכמה.
        </div>
      )}

      {/* The sheet */}
      <div className="bg-white rounded-xl border border-line-subtle overflow-x-auto">
        {groups.length === 0 && columns.length === 0 ? (
          <p className="text-center text-content-muted text-sm py-10">אין עדיין נתונים לפרויקט זה — העלי את מסמכי הלוט בהעלאה החכמה.</p>
        ) : (
          <table className="text-[12px] border-collapse min-w-full">
            <thead className="bg-neutral-50 text-right">
              <tr>
                <th colSpan={11} className={th} />
                {columns.map((c) => <th key={c.item.id} className={`${th} text-center`}>{c.lineLabel}</th>)}
                {hasUnmatched && <th className={th} />}
                <th colSpan={1 + coaCols} className={th} />
              </tr>
              <tr>
                <th colSpan={11} className={th} />
                {orderSpans.map((s, k) => (
                  <th key={k} colSpan={s.span} className={`${th} text-center text-content-body border-x border-line-subtle`} dir="ltr">{s.label}</th>
                ))}
                {hasUnmatched && <th className={th} />}
                <th colSpan={1 + coaCols} className={th} />
              </tr>
              <tr>
                {['סטטוס', 'LOT', 'BL', 'תאריך שחרור', 'ETA', 'אספקה ללקוח', 'Date of INV', 'DN', 'Invoice no.', 'Invoice value', 'Container no.'].map((h) => (
                  <th key={h} className={th}>{h}</th>
                ))}
                {columns.map((c) => <th key={c.item.id} className={`${th} text-center text-content-strong`} dir="ltr" title={c.item.description}>{c.label}</th>)}
                {hasUnmatched && <th className={`${th} text-warning`}>לא משויך</th>}
                <th className={th}>ת.מ רכש</th>
                {Array.from({ length: coaCols }, (_, k) => <th key={k} className={th}>COA{k + 1}</th>)}
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => g.rows.map((row, idx) => {
                const s = g.shipment;
                const span = g.rows.length;
                return (
                  <tr key={row.key} className={idx === 0 ? 'border-t-2 border-line-strong' : ''}>
                    {idx === 0 && (
                      <>
                        <td rowSpan={span} className={`${td} align-top font-semibold text-content-body`}>{g.status}</td>
                        <td rowSpan={span} className={`${td} align-top`}>
                          <div className="flex items-center gap-1">
                            <span className="font-semibold" dir="ltr">{s?.lot_label || (g.key === 'none' ? 'ללא LOT' : '—')}</span>
                            {canEdit && s && (
                              <button onClick={() => setEditLot(g)} className="text-content-muted hover:text-primary" title="עריכת פרטי LOT"><Icon name="edit" size={14} /></button>
                            )}
                          </div>
                        </td>
                        <td rowSpan={span} className={`${td} align-top`}><Val docId={g.blDocId} onOpen={openDoc} ltr>{s?.bl_number}</Val></td>
                        <td rowSpan={span} className={`${td} align-top`}>{fmtD(s?.released_at)}</td>
                        <td rowSpan={span} className={`${td} align-top`}><Val docId={g.blDocId} onOpen={openDoc}>{fmtD(s?.eta)}</Val></td>
                        <td rowSpan={span} className={`${td} align-top`}>{fmtD(s?.customer_delivery_date)}</td>
                      </>
                    )}
                    <td className={td}><Val docId={row.invoiceDocId} onOpen={openDoc}>{fmtD(row.invoice?.invoice_date)}</Val></td>
                    <td className={td}><Val docId={row.packingDocId} onOpen={openDoc} ltr>{row.deliveryNote}</Val></td>
                    <td className={td}><Val docId={row.invoiceDocId} onOpen={openDoc} ltr>{row.invoice?.invoice_no}</Val></td>
                    <td className={td}><Val docId={row.invoiceDocId} onOpen={openDoc} ltr>{row.invoice ? money(row.invoice.final_amount ?? row.invoice.net_value, row.invoice.currency || 'USD') : ''}</Val></td>
                    <td className={td}><Val docId={row.packingDocId} onOpen={openDoc} ltr>{row.container?.container_number}</Val></td>
                    {columns.map((c) => (
                      <td key={c.item.id} className={`${td} text-center font-mono`}>
                        {row.qty[c.item.id] ? <Val docId={row.packingDocId} onOpen={openDoc} ltr>{fmtQ(row.qty[c.item.id])}</Val> : ''}
                      </td>
                    ))}
                    {hasUnmatched && (
                      <td className={`${td} text-center font-mono text-warning`}>
                        {row.unmatched ? <Val docId={row.packingDocId} onOpen={openDoc} ltr>{fmtQ(row.unmatched)}</Val> : ''}
                      </td>
                    )}
                    <td className={td}>
                      {row.order && (
                        <button onClick={() => setPoView(row.order)} className="text-azure hover:underline font-mono" dir="ltr" title="פתח את הזמנת הרכש">
                          {row.order.po_number || row.order.supplier_order_no || 'PO'}
                        </button>
                      )}
                    </td>
                    {Array.from({ length: coaCols }, (_, k) => {
                      const c = row.coa[k];
                      return (
                        <td key={k} className={td}>
                          {c && <Val docId={c.docId} onOpen={openDoc} ltr>{c.coa.coa_no || (c.coa.dn ? `DN${c.coa.dn}` : 'COA')}</Val>}
                        </td>
                      );
                    })}
                  </tr>
                );
              }))}
            </tbody>
            <tfoot className="bg-neutral-50">
              <tr className="border-t-2 border-line-strong">
                <td colSpan={11} className={`${td} font-semibold text-left`} dir="ltr">Ordered quantity</td>
                {columns.map((c) => (
                  <td key={c.item.id} className={`${td} text-center font-mono`}>
                    <button onClick={() => setPoView(c.order)} className="text-azure hover:underline" dir="ltr" title="פתח את הזמנת הרכש">{fmtQ(c.ordered)}</button>
                  </td>
                ))}
                {hasUnmatched && <td className={td} />}
                <td colSpan={1 + coaCols} className={td} />
              </tr>
              <tr>
                <td colSpan={11} className={`${td} font-semibold text-left`} dir="ltr">delivered</td>
                {columns.map((c) => <td key={c.item.id} className={`${td} text-center font-mono`} dir="ltr">{fmtQ(c.shipped)}</td>)}
                {hasUnmatched && <td className={`${td} text-center font-mono text-warning`} dir="ltr">{fmtQ(unmatchedTotal)}</td>}
                <td colSpan={1 + coaCols} className={td} />
              </tr>
              <tr>
                <td colSpan={11} className={`${td} font-semibold text-left`} dir="ltr">to be delivered</td>
                {columns.map((c) => (
                  <td key={c.item.id} className={`${td} text-center`}>
                    <div className={`font-mono font-semibold ${c.complete ? 'text-success' : 'text-warning'}`} dir="ltr">
                      {c.remaining < 0 ? `+${fmtQ(-c.remaining)}` : fmtQ(c.remaining)}
                    </div>
                    {c.manual && <div className="text-[10px] text-success">הושלם ידנית</div>}
                    {!c.manual && c.complete && <div className="text-[10px] text-success"><Icon name="success" size={10} /> הושלם</div>}
                    {canEdit && (c.manual || !c.complete) && (
                      <button
                        onClick={() => toggleComplete(c.item, c.order)}
                        disabled={busyItem === c.item.id}
                        className="text-[10px] text-primary hover:underline disabled:opacity-40"
                      >
                        {c.manual ? 'בטל סימון' : 'סמן כהושלם'}
                      </button>
                    )}
                  </td>
                ))}
                {hasUnmatched && <td className={td} />}
                <td colSpan={1 + coaCols} className={td} />
              </tr>
            </tfoot>
          </table>
        )}
      </div>
      <p className="text-[11px] text-neutral-400">
        ערך בכחול נפתח במסמך המקור שממנו נלקח (תעודת משלוח, חשבונית, BL, COA או הזמנת הרכש). סטטוס, LOT, תאריך שחרור ואספקה ללקוח נקלטים ידנית (<Icon name="edit" size={10} />).
      </p>

      {poView && (
        <POViewModal order={poView} items={itemsOf(poView.id)} projectName={poView.projects?.name || null} onClose={() => setPoView(null)} />
      )}
      {editLot?.shipment && (
        <LotEditModal shipment={editLot.shipment} onClose={() => setEditLot(null)} onSaved={() => { setEditLot(null); onUpdate(); }} />
      )}
    </div>
  );
}

/** A value that opens its source document; plain text when none is linked. */
function Val({ docId, onOpen, ltr, children }: { docId: string | null; onOpen: (id: string | null) => void; ltr?: boolean; children: any }) {
  if (children == null || children === '') return null;
  if (!docId) return <span dir={ltr ? 'ltr' : undefined} title="אין מסמך מקור מקושר">{children}</span>;
  return (
    <button onClick={() => onOpen(docId)} dir={ltr ? 'ltr' : undefined} className="text-azure hover:underline decoration-dotted" title="פתח את מסמך המקור">
      {children}
    </button>
  );
}

function LotEditModal({ shipment, onClose, onSaved }: { shipment: any; onClose: () => void; onSaved: () => void }) {
  const supabase = createClient();
  const [f, setF] = useState({
    lot_label: shipment.lot_label || '', bl_number: shipment.bl_number || '', status: shipment.status || 'booked',
    eta: shipment.eta || '', released_at: shipment.released_at || '', customer_delivery_date: shipment.customer_delivery_date || '',
  });
  const [saving, setSaving] = useState(false);
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));
  async function save() {
    setSaving(true);
    const blank = (v: string) => (v.trim() ? v.trim() : null);
    const { error } = await supabase.from('import_shipments').update({
      lot_label: blank(f.lot_label), bl_number: blank(f.bl_number), status: f.status,
      eta: blank(f.eta), released_at: blank(f.released_at), customer_delivery_date: blank(f.customer_delivery_date),
      updated_at: new Date().toISOString(),
    }).eq('id', shipment.id);
    setSaving(false);
    if (error) { alert('שגיאה בשמירה: ' + error.message); return; }
    onSaved();
  }
  const inp = 'w-full border border-line-subtle rounded-lg px-2 py-1.5 text-[13px]';
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl p-5 w-full max-w-md" dir="rtl" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-bold text-content-strong mb-3">פרטי LOT</h3>
        <div className="grid grid-cols-2 gap-3">
          <label className="block"><span className="text-[11px] text-content-muted">שם LOT</span><input className={inp} dir="ltr" value={f.lot_label} onChange={(e) => set('lot_label', e.target.value)} placeholder="LOT3a" /></label>
          <label className="block"><span className="text-[11px] text-content-muted">BL</span><input className={inp} dir="ltr" value={f.bl_number} onChange={(e) => set('bl_number', e.target.value)} /></label>
          <label className="block"><span className="text-[11px] text-content-muted">סטטוס משלוח</span>
            <select className={inp} value={f.status} onChange={(e) => set('status', e.target.value)}>
              {Object.entries(SHIPMENT_STATUS_HE).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </label>
          <label className="block"><span className="text-[11px] text-content-muted">ETA</span><input type="date" className={inp} value={f.eta} onChange={(e) => set('eta', e.target.value)} /></label>
          <label className="block"><span className="text-[11px] text-content-muted">תאריך שחרור</span><input type="date" className={inp} value={f.released_at} onChange={(e) => set('released_at', e.target.value)} /></label>
          <label className="block"><span className="text-[11px] text-content-muted">תאריך אספקה ללקוח</span><input type="date" className={inp} value={f.customer_delivery_date} onChange={(e) => set('customer_delivery_date', e.target.value)} /></label>
        </div>
        <p className="text-[11px] text-neutral-400 mt-2">הסטטוס בטבלה נגזר מכאן: תאריך אספקה ← "סופק", תאריך שחרור ← "השתחרר", אחרת סטטוס המשלוח.</p>
        <div className="flex gap-2 mt-4">
          <button onClick={save} disabled={saving} className="bg-primary text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-primary-700 disabled:opacity-40">{saving ? 'שומר…' : 'שמור'}</button>
          <button onClick={onClose} className="text-sm px-4 py-2 rounded-lg border border-line-subtle text-content-body">ביטול</button>
        </div>
      </div>
    </div>
  );
}
