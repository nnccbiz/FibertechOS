'use client';

// Per-project import tracker — Nurit's follow-up sheet (ISKOOR sample in
// docs/דוגמת מעקב יבוא איסכור) as a live screen: a row per container /
// delivery note grouped by LOT, a column per ordered item, ordered /
// delivered / to be delivered at the bottom. Every value opens the document it
// was taken from (file icon); every cell is edited in place like the projects
// list (click → edit → Enter / leaving the cell saves); a LOT still at sea shows
// its expected arrival and live vessel tracking.

import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { buildTracker, isFutureLot, SHIPMENT_STATUS_HE, type TrackerGroup, type TrackerRow } from '@/lib/import-tracker';
import {
  saveLotField, saveRowField, saveItemLineNo, createTrackerRow, deleteTrackerRow, NEW_LOT,
  type EditCtx, type LotField, type RowField, type NewRowDraft,
} from '@/lib/import-tracker-edit';
import { exportTrackerXlsx } from '@/lib/import-tracker-xlsx';
import { deriveReceivedStatus } from '@/lib/import-status';
import SearchableSelect from '@/components/ui/SearchableSelect';
import POViewModal from '@/components/import/POViewModal';
import VesselTracker from '@/components/import/VesselTracker';
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

// Days from today to an ISO date (negative = past).
function daysUntil(iso: string): number {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  const t = new Date(); t.setHours(0, 0, 0, 0);
  return Math.round((new Date(y, m - 1, d).getTime() - t.getTime()) / 864e5);
}

export default function ImportTracker({ data, canEdit, canDelete, onUpdate, initialProjectId }: {
  data: any; canEdit: boolean; canDelete?: boolean; onUpdate: () => void; initialProjectId?: string | null;
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

  // A project asked for from outside (approved-quotes row / project page) wins
  // once; afterwards the user's own pick stays across data reloads.
  const [projectId, setProjectId] = useState<string>('');
  const [userPicked, setUserPicked] = useState(false);
  const lastInit = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const valid = (id?: string | null) => !!id && projects.some((p) => p.id === id);
    const initChanged = initialProjectId !== lastInit.current;
    lastInit.current = initialProjectId;
    if (initChanged) setUserPicked(false);
    const fallback = projects.find((p) => p.hasPacking)?.id || projects[0]?.id || '';
    setProjectId((cur) => (initChanged && valid(initialProjectId) ? initialProjectId! : valid(cur) ? cur : fallback));
  }, [projects, initialProjectId]);
  const requestedMissing = !userPicked && !!initialProjectId && !projects.some((p) => p.id === initialProjectId);
  const requestedName = requestedMissing ? ((data.projects || []).find((p: any) => p.id === initialProjectId)?.name || '') : '';

  const orders = useMemo(
    () => liveOrders.filter((o: any) => (projectId === STOCK ? !o.project_id : o.project_id === projectId)),
    [data, projectId],
  );
  const model = useMemo(() => buildTracker(orders, data), [orders, data]);
  const projectName = projects.find((p) => p.id === projectId)?.name || '';

  const [poView, setPoView] = useState<any | null>(null);
  const [busyItem, setBusyItem] = useState<string | null>(null);
  const [trackingLot, setTrackingLot] = useState<string | null>(null);
  const [draft, setDraft] = useState<NewRowDraft | null>(null);
  const [draftSaving, setDraftSaving] = useState(false);

  const ctx: EditCtx = { supabase, data, orders };

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

  // Every inline save: run, reload on success, hand the error back to the cell.
  async function run(fn: () => Promise<void>): Promise<string | null> {
    try { await fn(); onUpdate(); return null; }
    catch (e: any) { return e?.message || 'שגיאה בשמירה'; }
  }
  const lot = (g: TrackerGroup, f: LotField) => (v: string) => run(() => saveLotField(ctx, g, f, v));
  const cell = (row: TrackerRow, g: TrackerGroup, f: RowField) => (v: string) => run(() => saveRowField(ctx, row, g, model.columns, f, v));

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

  async function removeRow(row: TrackerRow) {
    if (!confirm(`למחוק את השורה (תעודה ${row.deliveryNote || '—'} · מכולה ${row.container?.container_number || '—'})? הכמויות שלה יוסרו מהמעקב.`)) return;
    if (!confirm('בטוח? לא ניתן לשחזר. (החשבונית, ה-COA והמכולה עצמם לא יימחקו.)')) return;
    const err = await run(() => deleteTrackerRow(ctx, row));
    if (err) alert('שגיאה במחיקה: ' + err);
  }

  async function saveDraft() {
    if (!draft) return;
    setDraftSaving(true);
    const err = await run(() => createTrackerRow(ctx, model.columns, draft));
    setDraftSaving(false);
    if (err) { alert(err); return; }
    setDraft(null);
  }

  if (!projects.length) {
    return <div className="bg-white rounded-xl border border-line-subtle p-8 text-center text-content-muted text-sm">אין עדיין הזמנות יבוא שנשלחו לספק.</div>;
  }
  const lotShipments = model.groups.map((g) => g.shipment).filter(Boolean);

  const { columns, groups, unmatchedTotal } = model;
  const hasUnmatched = unmatchedTotal > 0;
  const coaCols = Math.max(model.maxCoa, 1) + (canEdit ? 1 : 0); // + one empty COA slot to add into
  const orderSpans: { order: any; label: string; span: number }[] = [];
  for (const c of columns) {
    const last = orderSpans[orderSpans.length - 1];
    if (last && last.order.id === c.order.id) last.span++;
    else orderSpans.push({ order: c.order, label: c.orderLabel, span: 1 });
  }
  const itemsOf = (orderId: string) => (data.items || []).filter((i: any) => i.import_order_id === orderId);
  const tailCols = 1 + coaCols + (canEdit ? 1 : 0);
  const totalCols = 11 + columns.length + (hasUnmatched ? 1 : 0) + tailCols;
  const statusOptions = Object.entries(SHIPMENT_STATUS_HE).map(([value, label]) => ({ value, label }));

  const th = 'px-2 py-1.5 font-medium text-[11px] text-content-muted whitespace-nowrap border-b border-line-subtle';
  const td = 'px-2 py-1.5 whitespace-nowrap border-b border-line-subtle';
  const din = 'border border-line-subtle rounded px-1 py-0.5 text-[12px] bg-white';

  function newDraft(): NewRowDraft {
    return {
      shipmentId: lotShipments[lotShipments.length - 1]?.id || NEW_LOT, newLotLabel: '',
      dn: '', container: '', invoice_date: '', invoice_no: '', invoice_value: '', qty: {}, coa: '',
    };
  }

  return (
    <div className="space-y-4">
      {/* Project picker + actions */}
      <div className="bg-white rounded-xl border border-line-subtle px-4 py-3 flex flex-wrap items-center gap-3">
        <span className="text-[13px] font-semibold text-content-body"><Icon name="projects" size={16} /> פרויקט</span>
        <SearchableSelect
          value={projectId}
          onChange={(v: string) => { setProjectId(v); setUserPicked(true); setDraft(null); }}
          options={projects.map((p) => ({ value: p.id, label: p.name }))}
          className="min-w-[240px] border border-line-subtle rounded-lg px-2 py-1.5 text-[13px] bg-white"
        />
        <div className="mr-auto flex items-center gap-2">
          {canEdit && orders.length > 0 && columns.length > 0 && !draft && (
            <button onClick={() => setDraft(newDraft())} className="text-[13px] font-semibold bg-primary text-white px-3 py-1.5 rounded-lg hover:bg-primary-700">
              <Icon name="add" size={16} /> הוספת שורה
            </button>
          )}
          <button
            onClick={() => exportTrackerXlsx(model, projectName)}
            disabled={!columns.length && !groups.length}
            className="text-[13px] font-semibold bg-success text-white px-3 py-1.5 rounded-lg hover:opacity-90 disabled:opacity-40"
          >
            <Icon name="excel" size={16} /> ייצוא לאקסל
          </button>
        </div>
      </div>

      {requestedMissing && (
        <div className="bg-warning-soft text-warning text-[13px] rounded-lg px-3 py-2">
          <Icon name="info" size={14} /> לפרויקט {requestedName ? `"${requestedName}"` : 'שנבחר'} אין עדיין הזמנת יבוא שנשלחה לספק (הזמנה שעדיין בהכנה נמצאת ברכש), ולכן אין לו טבלת מעקב. מוצג פרויקט אחר.
        </div>
      )}

      {hasUnmatched && (
        <div className="bg-warning-soft text-warning text-[12px] rounded-lg px-3 py-2">
          <Icon name="warning" size={14} /> {fmtQ(unmatchedTotal)} מ׳ בתעודות המשלוח לא שויכו לפריט בהזמנה (עמודת "לא משויך") ולכן אינם נספרים ביתרה. אפשר לשייך אותם בהעלאה החכמה.
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
                {columns.map((c) => (
                  <th key={c.item.id} className={`${th} text-center`}>
                    <Cell
                      canEdit={canEdit} value={c.item.line_no != null ? String(c.item.line_no) : ''} display={c.lineLabel}
                      type="number" width="w-14" placeholder="שורה"
                      onSave={(v) => run(() => saveItemLineNo(supabase, c.item.id, v))}
                    />
                  </th>
                ))}
                {hasUnmatched && <th className={th} />}
                <th colSpan={tailCols} className={th} />
              </tr>
              <tr>
                <th colSpan={11} className={th} />
                {orderSpans.map((s, k) => (
                  <th key={k} colSpan={s.span} className={`${th} text-center text-content-body border-x border-line-subtle`} dir="ltr">{s.label}</th>
                ))}
                {hasUnmatched && <th className={th} />}
                <th colSpan={tailCols} className={th} />
              </tr>
              <tr>
                {['סטטוס', 'LOT', 'BL', 'תאריך שחרור', 'ETA', 'אספקה ללקוח', 'Date of INV', 'DN', 'Invoice no.', 'Invoice value', 'Container no.'].map((h) => (
                  <th key={h} className={th}>{h}</th>
                ))}
                {columns.map((c) => <th key={c.item.id} className={`${th} text-center text-content-strong`} dir="ltr" title={c.item.description}>{c.label}</th>)}
                {hasUnmatched && <th className={`${th} text-warning`}>לא משויך</th>}
                <th className={th}>ת.מ רכש</th>
                {Array.from({ length: coaCols }, (_, k) => <th key={k} className={th}>COA{k + 1}</th>)}
                {canEdit && <th className={th} />}
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <Fragment key={g.key}>
                {g.rows.map((row, idx) => {
                const s = g.shipment;
                const span = g.rows.length;
                const future = isFutureLot(s);
                const days = s?.eta ? daysUntil(s.eta) : null;
                return (
                  <tr key={row.key} className={idx === 0 ? 'border-t-2 border-line-strong' : ''}>
                    {idx === 0 && (
                      <>
                        <td rowSpan={span} className={`${td} align-top text-content-body`}>
                          <div className="font-semibold">
                            <Cell canEdit={canEdit} type="select" options={statusOptions} value={s?.status || 'booked'} display={g.status || '—'} onSave={lot(g, 'status')} />
                          </div>
                          {future && (
                            <div className="mt-1 space-y-0.5 text-[11px] font-normal whitespace-normal min-w-[130px]">
                              <div className="text-content-muted flex items-center gap-1">
                                <Icon name="ship" size={12} />
                                <Cell canEdit={canEdit} value={s.vessel_name || ''} ltr placeholder="+ אוניה" width="w-32" onSave={lot(g, 'vessel_name')} />
                              </div>
                              <div className={days != null && days < 0 ? 'text-warning font-semibold' : 'text-azure-600 font-semibold'}>
                                {s.eta
                                  ? <>הגעה צפויה {fmtD(s.eta)}{days != null && (days > 0 ? ` · בעוד ${days} ימים` : days === 0 ? ' · היום' : ` · עבר ב-${-days} ימים`)}</>
                                  : 'מועד הגעה לא ידוע'}
                              </div>
                              {s.vessel_name && (
                                <button
                                  onClick={() => setTrackingLot(trackingLot === g.key ? null : g.key)}
                                  className={`text-[11px] px-2 py-0.5 rounded-full border ${trackingLot === g.key ? 'bg-azure-600 text-white border-azure-600' : 'bg-azure-100 text-azure-600 border-azure'}`}
                                >
                                  <Icon name="satellite" size={12} /> אתר ספינה
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                        <td rowSpan={span} className={`${td} align-top font-semibold`}>
                          <Cell canEdit={canEdit} value={s?.lot_label || ''} display={s?.lot_label || (g.key === 'none' ? 'ללא LOT' : '')} ltr placeholder="LOT" onSave={lot(g, 'lot_label')} />
                        </td>
                        <td rowSpan={span} className={`${td} align-top`}>
                          <Cell canEdit={canEdit} value={s?.bl_number || ''} ltr docId={g.blDocId} onOpen={openDoc} onSave={lot(g, 'bl_number')} />
                        </td>
                        <td rowSpan={span} className={`${td} align-top`}>
                          <Cell canEdit={canEdit} type="date" value={s?.released_at || ''} display={fmtD(s?.released_at)} onSave={lot(g, 'released_at')} />
                        </td>
                        <td rowSpan={span} className={`${td} align-top`}>
                          <Cell canEdit={canEdit} type="date" value={s?.eta || ''} display={fmtD(s?.eta)} docId={g.blDocId} onOpen={openDoc} onSave={lot(g, 'eta')} />
                        </td>
                        <td rowSpan={span} className={`${td} align-top`}>
                          <Cell canEdit={canEdit} type="date" value={s?.customer_delivery_date || ''} display={fmtD(s?.customer_delivery_date)} onSave={lot(g, 'customer_delivery_date')} />
                        </td>
                      </>
                    )}
                    <td className={td}>
                      <Cell canEdit={canEdit} type="date" value={row.invoice?.invoice_date || ''} display={fmtD(row.invoice?.invoice_date)} docId={row.invoiceDocId} onOpen={openDoc} onSave={cell(row, g, 'invoice_date')} />
                    </td>
                    <td className={td}>
                      <Cell canEdit={canEdit} value={row.deliveryNote || ''} ltr docId={row.packingDocId} onOpen={openDoc} onSave={cell(row, g, 'dn')} />
                    </td>
                    <td className={td}>
                      <Cell canEdit={canEdit} value={row.invoice?.invoice_no || ''} ltr docId={row.invoiceDocId} onOpen={openDoc} onSave={cell(row, g, 'invoice_no')} />
                    </td>
                    <td className={td}>
                      <Cell
                        canEdit={canEdit} type="number" ltr docId={row.invoiceDocId} onOpen={openDoc}
                        value={row.invoice ? String(row.invoice.final_amount ?? row.invoice.net_value ?? '') : ''}
                        display={row.invoice ? money(row.invoice.final_amount ?? row.invoice.net_value, row.invoice.currency || 'USD') : ''}
                        onSave={cell(row, g, 'invoice_value')}
                      />
                    </td>
                    <td className={td}>
                      <Cell canEdit={canEdit} value={row.container?.container_number || ''} ltr width="w-32" docId={row.packingDocId} onOpen={openDoc} onSave={cell(row, g, 'container')} />
                    </td>
                    {columns.map((c) => (
                      <td key={c.item.id} className={`${td} text-center font-mono`}>
                        <Cell
                          canEdit={canEdit} type="number" ltr docId={row.qty[c.item.id] ? row.packingDocId : null} onOpen={openDoc}
                          value={row.qty[c.item.id] ? String(row.qty[c.item.id]) : ''}
                          display={row.qty[c.item.id] ? fmtQ(row.qty[c.item.id]) : ''}
                          onSave={cell(row, g, `qty:${c.item.id}`)}
                        />
                      </td>
                    ))}
                    {hasUnmatched && (
                      <td className={`${td} text-center font-mono text-warning`}>
                        {row.unmatched ? <Cell canEdit={false} value={fmtQ(row.unmatched)} ltr docId={row.packingDocId} onOpen={openDoc} /> : ''}
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
                      // Existing certificates are editable; one empty slot after them adds a new one.
                      if (!c && k !== row.coa.length) return <td key={k} className={td} />;
                      return (
                        <td key={k} className={td}>
                          <Cell
                            canEdit={canEdit} ltr docId={c?.docId || null} onOpen={openDoc}
                            value={c?.coa.coa_no || ''} display={c ? (c.coa.coa_no || (c.coa.dn ? `DN${c.coa.dn}` : 'COA')) : ''}
                            onSave={cell(row, g, `coa:${k}`)}
                          />
                        </td>
                      );
                    })}
                    {canEdit && (
                      <td className={td}>
                        {canDelete && (
                          <button onClick={() => removeRow(row)} className="text-neutral-300 hover:text-danger" title="מחיקת השורה">
                            <Icon name="delete" size={14} />
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                );
                })}
                {trackingLot === g.key && g.shipment?.vessel_name && (
                  <tr>
                    <td colSpan={totalCols} className="px-2 pt-2 border-b border-line-subtle">
                      <VesselTracker vesselName={g.shipment.vessel_name} />
                    </td>
                  </tr>
                )}
                </Fragment>
              ))}

              {/* New row — typed straight into the sheet */}
              {draft && (
                <tr className="bg-primary-50 border-t-2 border-primary">
                  <td className={td}><span className="text-[11px] font-semibold text-primary">שורה חדשה</span></td>
                  <td className={td} colSpan={5}>
                    <div className="flex items-center gap-1">
                      <select className={din} value={draft.shipmentId} onChange={(e) => setDraft({ ...draft, shipmentId: e.target.value })}>
                        {lotShipments.map((s: any) => <option key={s.id} value={s.id}>{s.lot_label || s.bl_number || 'LOT ללא שם'}</option>)}
                        <option value="">ללא LOT</option>
                        <option value={NEW_LOT}>+ LOT חדש</option>
                      </select>
                      {draft.shipmentId === NEW_LOT && (
                        <input className={`${din} w-20`} dir="ltr" placeholder="LOT5" value={draft.newLotLabel} onChange={(e) => setDraft({ ...draft, newLotLabel: e.target.value })} />
                      )}
                    </div>
                  </td>
                  <td className={td}><input type="date" className={din} value={draft.invoice_date} onChange={(e) => setDraft({ ...draft, invoice_date: e.target.value })} /></td>
                  <td className={td}><input className={`${din} w-24`} dir="ltr" placeholder="DN" value={draft.dn} onChange={(e) => setDraft({ ...draft, dn: e.target.value })} /></td>
                  <td className={td}><input className={`${din} w-24`} dir="ltr" value={draft.invoice_no} onChange={(e) => setDraft({ ...draft, invoice_no: e.target.value })} /></td>
                  <td className={td}><input className={`${din} w-20`} dir="ltr" inputMode="decimal" value={draft.invoice_value} onChange={(e) => setDraft({ ...draft, invoice_value: e.target.value })} /></td>
                  <td className={td}><input className={`${din} w-28`} dir="ltr" placeholder="מכולה" value={draft.container} onChange={(e) => setDraft({ ...draft, container: e.target.value })} /></td>
                  {columns.map((c) => (
                    <td key={c.item.id} className={`${td} text-center`}>
                      <input className={`${din} w-16 text-center`} dir="ltr" inputMode="decimal" value={draft.qty[c.item.id] || ''} onChange={(e) => setDraft({ ...draft, qty: { ...draft.qty, [c.item.id]: e.target.value } })} />
                    </td>
                  ))}
                  {hasUnmatched && <td className={td} />}
                  <td className={td} />
                  <td className={td}><input className={`${din} w-20`} dir="ltr" placeholder="COA" value={draft.coa} onChange={(e) => setDraft({ ...draft, coa: e.target.value })} /></td>
                  {Array.from({ length: coaCols - 1 }, (_, k) => <td key={k} className={td} />)}
                  <td className={td}>
                    <div className="flex items-center gap-1.5">
                      <button onClick={saveDraft} disabled={draftSaving} className="text-success hover:opacity-80 disabled:opacity-40" title="שמור שורה"><Icon name="confirm" size={16} /></button>
                      <button onClick={() => setDraft(null)} disabled={draftSaving} className="text-content-muted hover:text-danger" title="ביטול"><Icon name="close" size={16} /></button>
                    </div>
                  </td>
                </tr>
              )}
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
                <td colSpan={tailCols} className={td} />
              </tr>
              <tr>
                <td colSpan={11} className={`${td} font-semibold text-left`} dir="ltr">delivered</td>
                {columns.map((c) => <td key={c.item.id} className={`${td} text-center font-mono`} dir="ltr">{fmtQ(c.shipped)}</td>)}
                {hasUnmatched && <td className={`${td} text-center font-mono text-warning`} dir="ltr">{fmtQ(unmatchedTotal)}</td>}
                <td colSpan={tailCols} className={td} />
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
                <td colSpan={tailCols} className={td} />
              </tr>
            </tfoot>
          </table>
        )}
      </div>
      <p className="text-[11px] text-neutral-400">
        {canEdit ? 'לחיצה על תא פותחת אותו לעריכה — Enter או יציאה מהתא שומרים, Esc מבטל. ' : ''}
        <Icon name="file" size={10} /> ליד ערך פותח את מסמך המקור שממנו נלקח (תעודת משלוח, חשבונית, BL או COA); ערך בלי אייקון הוזן ידנית. הכמות שהוזמנה ו-ת.מ רכש פותחים את הזמנת הרכש.
      </p>

      {poView && (
        <POViewModal order={poView} items={itemsOf(poView.id)} projectName={poView.projects?.name || null} onClose={() => setPoView(null)} />
      )}
    </div>
  );
}

/**
 * A tracker cell, edited in place like the projects list: click the value →
 * input (autofocus) → Enter / leaving the cell saves, Esc cancels. A value
 * taken from a document carries a file icon that opens it; for a user without
 * edit rights the value itself opens the document.
 */
function Cell({ value, display, type = 'text', options, ltr, width, placeholder, canEdit, docId, onOpen, onSave }: {
  value: string;
  display?: string;
  type?: 'text' | 'number' | 'date' | 'select';
  options?: { value: string; label: string }[];
  ltr?: boolean;
  width?: string;
  placeholder?: string;
  canEdit: boolean;
  docId?: string | null;
  onOpen?: (id: string | null) => void;
  onSave?: (v: string) => Promise<string | null>;
}) {
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState('');
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  // Closed once saved or cancelled: a blur fired while the input unmounts must
  // neither save a cancelled value nor save twice (a second qty save would add a line).
  const closed = useRef(true);
  const shown = display ?? value;
  function open() { setV(value || ''); closed.current = false; setEditing(true); }
  function cancel() { closed.current = true; setEditing(false); }
  const dir = ltr ? 'ltr' : undefined;

  async function commit(next: string) {
    if (busy.current || closed.current) return;
    if (next.trim() === (value || '').trim()) { cancel(); return; }
    busy.current = true; setSaving(true);
    const err = onSave ? await onSave(next) : null;
    busy.current = false; setSaving(false);
    if (err) { alert('שגיאה בשמירה: ' + err); return; }
    cancel();
  }

  if (editing) {
    if (type === 'select') {
      return (
        <select autoFocus value={v} disabled={saving} onChange={(e) => { setV(e.target.value); commit(e.target.value); }} onBlur={() => !busy.current && cancel()}
          className="border border-primary rounded px-1 py-0.5 text-[12px] focus:outline-none">
          {(options || []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      );
    }
    return (
      <input
        autoFocus type={type === 'date' ? 'date' : 'text'} inputMode={type === 'number' ? 'decimal' : undefined}
        value={v} dir={dir} disabled={saving}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => commit(v)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); commit(v); }
          if (e.key === 'Escape') cancel();
        }}
        className={`${width || (type === 'date' ? 'w-32' : 'w-24')} border border-primary rounded px-1 py-0.5 text-[12px] focus:outline-none`}
      />
    );
  }

  const docBtn = docId && shown && onOpen ? (
    <button onClick={() => onOpen(docId)} className="text-azure hover:text-azure-600 shrink-0" title="פתח את מסמך המקור"><Icon name="file" size={12} /></button>
  ) : null;

  if (!canEdit) {
    if (!shown) return null;
    return docId && onOpen
      ? <button onClick={() => onOpen(docId)} dir={dir} className="text-azure hover:underline decoration-dotted" title="פתח את מסמך המקור">{shown}</button>
      : <span dir={dir}>{shown}</span>;
  }
  return (
    <span className="inline-flex items-center gap-1">
      <span
        onClick={open}
        dir={dir}
        title="לחץ לעריכה"
        className={`cursor-pointer rounded px-0.5 hover:bg-primary-50 hover:text-primary inline-block min-w-[2.5rem] min-h-[1.25em] ${shown ? (docId ? 'text-azure' : '') : 'text-neutral-300'}`}
      >
        {shown || (placeholder ? <span className="text-[11px]">{placeholder}</span> : '')}
      </span>
      {docBtn}
    </span>
  );
}
