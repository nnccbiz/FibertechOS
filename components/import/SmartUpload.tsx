'use client';

import { useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { reconcileDocuments, Proposal, ExtractResult } from '@/lib/import-reconcile';
import { deriveReceivedStatus } from '@/lib/import-status';
import { matchOrderItem, pipeVariant, VARIANT_LABEL } from '@/lib/import-match';
import { filesFromDrop, materializeFiles, safeExt, EMPTY_DROP_HINT } from '@/lib/dropped-files';
import SearchableSelect from '@/components/ui/SearchableSelect';
import Icon from '@/components/ui/Icon';

// Only these reach Gemini (the extract route rejects anything else).
const ACCEPTED_RE = /\.(pdf|png|jpe?g)$/i;

const DOC_LABEL: Record<string, string> = {
  email: 'אימייל', order_confirmation: 'אישור הזמנה', proforma_invoice: 'פרופורמה (PI)',
  commercial_invoice: 'חשבונית (CI)', packing_list: 'תעודת משלוח', bl: 'שטר מטען (BL)',
  coa: 'תעודת אנליזה', other: 'אחר',
};
const norm = (s: string) => (s || '').replace(/\s+/g, '').toUpperCase();
const n = (v: any) => (v === '' || v == null ? null : Number(v));
function fileToBase64(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(',')[1] || '');
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

// compact input
function I({ value, onChange, w = '', ltr = false, type = 'text', ph = '' }: any) {
  return <input type={type} value={value ?? ''} placeholder={ph} dir={ltr ? 'ltr' : 'rtl'} onChange={(e) => onChange(e.target.value)} className={`border border-line-subtle rounded px-1.5 py-1 text-[12px] ${w}`} />;
}

export default function SmartUpload({ data, onClose, onSaved }: any) {
  const supabase = createClient();
  const [files, setFiles] = useState<File[]>([]);
  const [phase, setPhase] = useState<'pick' | 'extracting' | 'review' | 'saving'>('pick');
  const [p, setP] = useState<Proposal | null>(null);
  const [rawResults, setRawResults] = useState<ExtractResult[]>([]);
  const [projectId, setProjectIdRaw] = useState('');
  const [supplierId, setSupplierId] = useState('');
  // '' = open a new order / shipment from the documents; otherwise the id of
  // the existing PO / LOT the documents belong to.
  const [orderChoice, setOrderChoiceRaw] = useState('');
  const [shipmentChoice, setShipmentChoice] = useState('');
  const [err, setErr] = useState('');
  // Projects the lot belongs to — passed to the extractor as context so Roxy
  // can recognise our project name inside the supplier's wording.
  const [hintProjects, setHintProjects] = useState<{ id: string; name: string }[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const dragDepth = useRef(0);

  // ---- proposal editing helpers ----
  function setHdr(section: 'order' | 'shipment', field: string, value: any) {
    setP((prev) => prev ? { ...prev, [section]: { ...(prev as any)[section], [field]: value } } : prev);
  }
  function setRow(section: keyof Proposal, idx: number, field: string, value: any) {
    setP((prev) => { if (!prev) return prev; const arr = [...(prev as any)[section]]; arr[idx] = { ...arr[idx], [field]: value }; return { ...prev, [section]: arr } as Proposal; });
  }
  function addRow(section: keyof Proposal, tmpl: any) {
    setP((prev) => prev ? ({ ...prev, [section]: [...(prev as any)[section], tmpl] }) as Proposal : prev);
  }
  function delRow(section: keyof Proposal, idx: number) {
    setP((prev) => prev ? ({ ...prev, [section]: (prev as any)[section].filter((_: any, i: number) => i !== idx) }) as Proposal : prev);
  }

  // ---- linking to what already exists ----
  const liveOrders = (data.orders || []).filter((o: any) => o.status !== 'cancelled');
  const orderOptions = projectId ? liveOrders.filter((o: any) => o.project_id === projectId) : liveOrders;
  const chosenItems = useMemo(
    () => (orderChoice ? (data.items || []).filter((i: any) => i.import_order_id === orderChoice) : []),
    [orderChoice, data.items],
  );

  // Paperwork already recorded in the system — shown as a red alert on review
  // and confirmed again on save (a re-sent email must never slip in silently).
  const duplicates = useMemo(() => {
    if (!p) return [] as string[];
    const out: string[] = [];
    const when = (d?: string) => (d ? ` (נקלט ${new Date(d).toLocaleDateString('he-IL')})` : '');
    for (const iv of p.invoices) {
      const hit = iv.invoice_no && (data.invoices || []).find((x: any) => norm(x.invoice_no || '') === norm(iv.invoice_no));
      if (hit) out.push(`חשבונית ${iv.invoice_no}${when(hit.created_at)}`);
    }
    const bl = p.shipment.bl_number && (data.shipments || []).find((x: any) => norm(x.bl_number || '') === norm(p.shipment.bl_number || ''));
    if (bl) out.push(`שטר מטען (BL) ${p.shipment.bl_number}${when(bl.created_at)}`);
    const dns = Array.from(new Set(p.packingLines.map((pl) => (pl.delivery_note_no || '').trim()).filter(Boolean)));
    for (const dn of dns) {
      const hit = (data.packing || []).find((x: any) => norm(x.delivery_note_no || '') === norm(dn));
      if (hit) out.push(`תעודת משלוח ${dn}${when(hit.created_at)}`);
    }
    const conts = Array.from(new Set(p.packingLines.map((pl) => (pl.container_number || '').trim()).filter(Boolean)));
    for (const cn of conts) {
      const c = (data.containers || []).find((x: any) => norm(x.container_number || '') === norm(cn)
        && (data.packing || []).some((pl: any) => pl.container_id === x.id));
      if (c) out.push(`מכולה ${cn} — כבר רשומות לה כמויות${when(c.created_at)}`);
    }
    for (const d of p.docs) {
      if (!d.doc_number) continue;
      const hit = (data.docs || []).find((x: any) => x.doc_type === d.doc_type && norm(x.doc_number || '') === norm(d.doc_number || ''));
      if (hit && !out.some((m) => m.includes(d.doc_number!))) out.push(`מסמך ${d.doc_number} (${DOC_LABEL[d.doc_type] || d.doc_type})${when(hit.created_at)}`);
    }
    return Array.from(new Set(out));
  }, [p, data]);

  function itemLabel(it: any) {
    const spec = [it.dn && `DN${it.dn}`, it.pn && `PN${it.pn}`, it.sn && `SN${it.sn}`].filter(Boolean).join(' ');
    return `${spec || it.description || '—'} · ${VARIANT_LABEL[pipeVariant(it.description)]} · ${it.ordered_qty ?? 0} ${it.unit || ''}`.trim();
  }

  // Auto-match every delivery-note line to an item of the chosen order.
  function autoMatch(prop: Proposal, orderId: string): Proposal {
    const items = orderId ? (data.items || []).filter((i: any) => i.import_order_id === orderId) : [];
    return {
      ...prop,
      packingLines: prop.packingLines.map((pl) => ({ ...pl, item_id: orderId ? (matchOrderItem(pl, items).id || '') : '' })),
    };
  }

  // The documents already recorded on an order? Same supplier invoice no, or
  // the same BL whose LOT already carries one of our orders.
  function priorRecordOf(prop: Proposal): { orderId: string; why: string } | null {
    const live = new Set(liveOrders.map((o: any) => o.id));
    for (const iv of prop.invoices) {
      const no = norm(iv.invoice_no || '');
      if (!no) continue;
      const hit = (data.invoices || []).find((x: any) => norm(x.invoice_no || '') === no && live.has(x.import_order_id));
      if (hit) return { orderId: hit.import_order_id, why: `חשבונית ${iv.invoice_no}` };
    }
    const bl = norm(prop.shipment.bl_number || '');
    if (bl) {
      const ship = (data.shipments || []).find((x: any) => norm(x.bl_number || '') === bl);
      if (ship) {
        const byInv = (data.invoices || []).find((x: any) => x.shipment_id === ship.id && live.has(x.import_order_id));
        const contIds = new Set((data.containers || []).filter((c: any) => c.shipment_id === ship.id).map((c: any) => c.id));
        const byPack = (data.packing || []).find((pl: any) => contIds.has(pl.container_id) && live.has(pl.import_order_id));
        const oid = byInv?.import_order_id || byPack?.import_order_id;
        if (oid) return { orderId: oid, why: `BL ${prop.shipment.bl_number}` };
      }
    }
    return null;
  }

  function defaultOrderFor(prop: Proposal, projId: string): string {
    const so = (prop.order.supplier_order_no || '').trim();
    if (so) {
      const bySo = liveOrders.find((o: any) => (o.supplier_order_no || '').trim() === so);
      if (bySo) return bySo.id;
    }
    const prior = priorRecordOf(prop);
    if (prior) return prior.orderId;
    const pool = liveOrders.filter((o: any) => projId && o.project_id === projId);
    return pool.length === 1 ? pool[0].id : '';
  }

  // Shipments already carrying this order's containers (its earlier LOTs).
  function shipmentsOfOrder(orderId: string) {
    const contIds = new Set((data.packing || []).filter((pl: any) => pl.import_order_id === orderId).map((pl: any) => pl.container_id));
    const shipIds = new Set((data.containers || []).filter((c: any) => contIds.has(c.id)).map((c: any) => c.shipment_id).filter(Boolean));
    return (data.shipments || []).filter((s: any) => shipIds.has(s.id));
  }

  function defaultShipmentFor(prop: Proposal, orderId: string): string {
    const bl = (prop.shipment.bl_number || '').trim();
    if (bl) {
      const byBl = (data.shipments || []).find((s: any) => (s.bl_number || '').trim() === bl);
      if (byBl) return byBl.id;
    }
    const lot = norm(prop.shipment.lot_label || '');
    if (lot && orderId) {
      const byLot = shipmentsOfOrder(orderId).find((s: any) => norm(s.lot_label || '') === lot);
      if (byLot) return byLot.id;
    }
    return '';
  }

  function setOrderChoice(id: string) {
    setOrderChoiceRaw(id);
    if (p) { const next = autoMatch(p, id); setP(next); setShipmentChoice(defaultShipmentFor(next, id)); }
  }
  function setProjectId(id: string) {
    setProjectIdRaw(id);
    if (p) setOrderChoice(defaultOrderFor(p, id));
  }

  // Accepts a FileList (picker) or an array (drag-drop), skipping unsupported
  // types and duplicates of files already staged.
  function addFiles(list: FileList | File[] | null) {
    if (!list) return;
    const incoming = Array.from(list);
    const rejected = incoming.filter((f) => !ACCEPTED_RE.test(f.name));
    const ok = incoming.filter((f) => ACCEPTED_RE.test(f.name));
    if (rejected.length) setErr(`הקבצים הבאים אינם נתמכים לחילוץ (רק PDF / תמונה): ${rejected.map((f) => f.name).join(', ')}`);
    else setErr('');
    setFiles((prev) => {
      const seen = new Set(prev.map((f) => `${f.name}|${f.size}`));
      return [...prev, ...ok.filter((f) => !seen.has(`${f.name}|${f.size}`))];
    });
  }

  async function onDrop(e: React.DragEvent) {
    e.preventDefault();
    dragDepth.current = 0;
    setDragOver(false);
    const dropped = filesFromDrop(e.dataTransfer);
    if (!dropped.length) { setErr(`הגרירה לא העבירה קובץ. ${EMPTY_DROP_HINT}`); return; }
    // Read the bytes NOW — WebKit invalidates cross-app drag blobs fast.
    const { stable, empty } = await materializeFiles(dropped);
    if (empty.length) setErr(`הקבצים הבאים הגיעו ריקים מהגרירה: ${empty.join(', ')}. ${EMPTY_DROP_HINT}`);
    if (stable.length) addFiles(stable);
  }

  async function extract() {
    setErr(''); setPhase('extracting');
    try {
      const payload = await Promise.all(files.map(async (f) => ({ name: f.name, mimeType: f.type, base64: await fileToBase64(f) })));
      const res = await fetch('/api/import/extract', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: payload, projectHints: hintProjects.map((h) => h.name).filter(Boolean) }),
      });
      const json = await res.json();
      if (!res.ok) { setErr(json.error || 'שגיאת חילוץ'); setPhase('pick'); return; }
      const results: ExtractResult[] = json.results || [];
      setRawResults(results);
      const prop = reconcileDocuments(results);
      // Link to a system project: a single stated project wins; with several,
      // match the extracted name against them; otherwise fall back to a fuzzy
      // match over all projects (previous behaviour).
      let projId = '';
      if (hintProjects.length === 1) {
        projId = hintProjects[0].id;
      } else if (prop.order.project_name) {
        const extracted = prop.order.project_name.toLowerCase();
        const pool = hintProjects.length ? hintProjects : data.projects;
        const m = pool.find((pr: any) => (pr.name || '').trim() && extracted.includes((pr.name || '').toLowerCase().slice(0, 6)));
        if (m) projId = m.id;
      }
      // An existing PO (by the supplier's sales-order no, or the project's only
      // live order) — so the documents land on Nitzan's PO instead of a copy.
      const ordId = defaultOrderFor(prop, projId);
      // Same invoice / BL already recorded → say so up front (re-sent email, same LOT).
      const prior = priorRecordOf(prop);
      if (prior) {
        const o = liveOrders.find((x: any) => x.id === prior.orderId);
        const label = [o?.po_number, o?.projects?.name].filter(Boolean).join(' · ') || 'הזמנה קיימת';
        prop.warnings.unshift(`${prior.why} כבר נקלטו במערכת (${label}) — ייתכן שאלה אותם מסמכים שכבר הועלו. ההעלאה שויכה לאותה הזמנה; שורות שכבר קיימות ידולגו.`);
        if (!projId && o?.project_id) projId = o.project_id;
      }
      const matched = autoMatch(prop, ordId);
      setProjectIdRaw(projId);
      setOrderChoiceRaw(ordId);
      setShipmentChoice(defaultShipmentFor(matched, ordId));
      setP(matched);
      setPhase('review');
    } catch (e: any) { setErr(e?.message || 'שגיאה'); setPhase('pick'); }
  }

  async function save() {
    if (!p) return;
    if (duplicates.length && !confirm(
      `שים לב — מסמכים אלה כבר נקלטו במערכת:\n\n• ${duplicates.join('\n• ')}\n\n` +
      'להמשיך בשמירה? שורות וחשבוניות שכבר קיימות ידולגו, אבל כל מה שחדש במסמכים יתווסף.',
    )) return;
    setPhase('saving'); setErr('');
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const ordersTotal = p.items.reduce((s, it) => s + (Number(it.ordered_qty) || 0) * (Number(it.unit_price) || 0), 0);

      // ---- order: the chosen existing PO, else a new order from the documents ----
      let orderId: string;
      const existingOrder = orderChoice ? liveOrders.find((o: any) => o.id === orderChoice) : null;
      if (existingOrder) {
        orderId = existingOrder.id;
        // Remember the supplier's numbers on our PO so the next upload finds it alone.
        const patch: any = {};
        if (projectId && !existingOrder.project_id) { patch.project_id = projectId; patch.is_stock = false; }
        if (p.order.supplier_order_no && !existingOrder.supplier_order_no) patch.supplier_order_no = p.order.supplier_order_no;
        if (p.order.supplier_project_no && !existingOrder.supplier_project_no) patch.supplier_project_no = p.order.supplier_project_no;
        if (Object.keys(patch).length) await supabase.from('import_orders').update(patch).eq('id', orderId);
      } else {
        const { data: o, error } = await supabase.from('import_orders').insert({
          supplier_id: supplierId || null, project_id: projectId || null, is_stock: !projectId,
          supplier_order_no: p.order.supplier_order_no, supplier_project_no: p.order.supplier_project_no,
          project_name: p.order.project_name, currency: p.order.currency || 'USD',
          incoterms: p.order.incoterms, payment_terms: p.order.payment_terms,
          total_amount: Math.round(ordersTotal * 100) / 100, status: 'in_transit',
          // Smart-upload orders come from supplier documents — already sent.
          po_sent_at: new Date().toISOString(),
        }).select().single();
        if (error) throw error;
        orderId = o.id;
        if (p.items.length) {
          const { error: itErr } = await supabase.from('import_order_items').insert(p.items.map((it, idx) => ({
            import_order_id: orderId, line_no: n(it.line_no), material_no: it.material_no || null, description: it.description || '',
            dn: it.dn || null, pn: it.pn || null, sn: it.sn || null, ordered_qty: n(it.ordered_qty) ?? 0, unit: it.unit || 'M', unit_price: n(it.unit_price), sort_order: idx,
          })));
          if (itErr) throw itErr;
        }
      }
      const { data: orderItems } = await supabase.from('import_order_items').select('*').eq('import_order_id', orderId);

      // ---- shipment (LOT): the chosen one, else a new one when there is anything to hold ----
      let shipmentId: string | null = shipmentChoice || null;
      const shipFields: any = Object.fromEntries(Object.entries(p.shipment).map(([k, v]) => [k, v === '' ? null : v]));
      if (shipmentId) {
        const ex = (data.shipments || []).find((s: any) => s.id === shipmentId) || {};
        const patch: any = {};
        for (const [k, v] of Object.entries(shipFields)) if (v != null && (ex as any)[k] == null) patch[k] = v;
        if (Object.keys(patch).length) await supabase.from('import_shipments').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', shipmentId);
      } else if (shipFields.bl_number || shipFields.lot_label || p.containers.length) {
        const { data: s, error } = await supabase.from('import_shipments').insert({ supplier_id: supplierId || null, ...shipFields, status: 'arrived' }).select().single();
        if (error) throw error; shipmentId = s.id;
      }

      const contByNum: Record<string, string> = {};
      let existingConts: any[] = [];
      if (shipmentId) { const { data: ec } = await supabase.from('import_containers').select('*').eq('shipment_id', shipmentId); existingConts = ec || []; }
      for (const c of p.containers) {
        if (!c.container_number) continue;
        const k = norm(c.container_number);
        const ex = existingConts.find((x: any) => norm(x.container_number) === k);
        if (ex) { contByNum[k] = ex.id; continue; }
        const { data: ins, error } = await supabase.from('import_containers').insert({
          shipment_id: shipmentId, container_number: c.container_number, seal_number: c.seal_number || null,
          container_type: c.container_type || null, gross_weight: n(c.gross_weight), pieces: n(c.pieces),
        }).select().single();
        if (error) throw error; contByNum[k] = ins.id; existingConts.push(ins);
      }

      // ---- source files first, so every extracted row can point at its document ----
      const docMeta: Record<string, { doc_type: string; doc_number: string | null }> =
        Object.fromEntries(p.docs.map((d) => [d.name, { doc_type: d.doc_type, doc_number: d.doc_number }]));
      const docIdByName: Record<string, string> = {};
      const failedUploads: string[] = [];
      for (const [idx, f] of files.entries()) {
        const meta = docMeta[f.name] || { doc_type: 'other', doc_number: null };
        const dtype = meta.doc_type;
        const owner = dtype === 'bl' ? 'shipment_id' : 'import_order_id';
        const ownerId = dtype === 'bl' ? shipmentId : orderId;
        if (!ownerId) continue;
        // Same document already on file for this order / LOT → link to it, don't record it twice.
        const existingDoc = meta.doc_number
          ? (data.docs || []).find((x: any) => x.doc_type === dtype && x[owner] === ownerId && norm(x.doc_number || '') === norm(meta.doc_number || ''))
          : null;
        if (existingDoc) { docIdByName[f.name] = existingDoc.id; continue; }
        // ASCII-only storage key (a Hebrew file name is rejected as "Invalid key").
        const path = `import/${owner}/${ownerId}/${dtype}_${Date.now()}_${idx}.${safeExt(f)}`;
        const { error: upErr } = await supabase.storage.from('project-files').upload(path, f);
        if (upErr) { failedUploads.push(f.name); continue; }
        const plForDoc = p.packingLines.find((pl) => pl.source_name === f.name && pl.container_number);
        const { data: docRow, error: docErr } = await supabase.from('import_documents').insert({
          [owner]: ownerId, doc_type: dtype, doc_number: meta.doc_number, file_name: f.name, file_path: path,
          container_id: plForDoc ? (contByNum[norm(plForDoc.container_number)] || null) : null,
          uploaded_by: user?.id || null,
        }).select('id').single();
        if (docErr) { failedUploads.push(f.name); continue; }
        docIdByName[f.name] = docRow.id;
      }

      // ---- delivery-note lines — skip lines already recorded by an earlier upload ----
      let skipped = 0;
      if (p.packingLines.length) {
        // Identity of a recorded line: delivery note + container + material + qty
        // (a multi-container packing list has no delivery-note number).
        const dns = Array.from(new Set(p.packingLines.map((pl) => (pl.delivery_note_no || '').trim()).filter(Boolean)));
        const contIds = Array.from(new Set(Object.values(contByNum)));
        const cols = 'delivery_note_no, container_id, material_no, shipped_qty';
        const [byDn, byCont] = await Promise.all([
          dns.length ? supabase.from('import_packing_lines').select(cols).in('delivery_note_no', dns) : Promise.resolve({ data: [] as any[] }),
          contIds.length ? supabase.from('import_packing_lines').select(cols).in('container_id', contIds) : Promise.resolve({ data: [] as any[] }),
        ]);
        const lineKey = (dn: any, cid: any, mat: any, q: any) => `${String(dn || '').trim()}|${cid || ''}|${String(mat || '').trim()}|${Number(q) || 0}`;
        const seen = new Set([...(byDn.data || []), ...(byCont.data || [])].map((x: any) => lineKey(x.delivery_note_no, x.container_id, x.material_no, x.shipped_qty)));
        const rows: any[] = [];
        const learned: Record<string, string> = {}; // order item id → supplier material no
        for (const pl of p.packingLines) {
          const cid = pl.container_number ? (contByNum[norm(pl.container_number)] || null) : null;
          const key = lineKey(pl.delivery_note_no, cid, pl.material_no, n(pl.shipped_qty) ?? 0);
          if ((pl.delivery_note_no || cid) && seen.has(key)) { skipped++; continue; }
          seen.add(key);
          // Existing PO → the user's pick in the review table; new order → match by material/spec.
          const itemId = existingOrder ? (pl.item_id || null) : (matchOrderItem(pl, orderItems || []).id);
          const item = itemId ? (orderItems || []).find((i: any) => i.id === itemId) : null;
          if (item && !item.material_no && pl.material_no) learned[item.id] = String(pl.material_no).trim();
          rows.push({
            delivery_note_no: pl.delivery_note_no || null, container_id: pl.container_number ? (contByNum[norm(pl.container_number)] || null) : null,
            import_order_id: orderId, import_order_item_id: itemId, material_no: pl.material_no || null, description: pl.description || '',
            dn: pl.dn || null, shipped_qty: n(pl.shipped_qty) ?? 0, unit: pl.unit || 'M', pieces: n(pl.pieces),
            loading_date: pl.loading_date || null, discharge_date: pl.discharge_date || null,
            supplier_order_item: pl.supplier_order_item || null,
            source_document_id: pl.source_name ? (docIdByName[pl.source_name] || null) : null,
          });
        }
        if (rows.length) {
          const { error: plErr } = await supabase.from('import_packing_lines').insert(rows);
          if (plErr) throw plErr;
        }
        // Learn: the supplier's material no onto our item, so the next delivery
        // note of this order matches by material alone.
        const taken = new Set((orderItems || []).map((i: any) => (i.material_no || '').trim()).filter(Boolean));
        for (const [id, mat] of Object.entries(learned)) {
          if (taken.has(mat)) continue;
          taken.add(mat);
          await supabase.from('import_order_items').update({ material_no: mat }).eq('id', id);
          const it = (orderItems || []).find((i: any) => i.id === id);
          if (it) it.material_no = mat;
        }
      }

      // Derive receipt status from packing coverage (all items complete → received,
      // some → partially_received). Manual 'closed' is a terminal override and is
      // never auto-changed; a fully-received order is never downgraded.
      {
        const curStatus = existingOrder?.status || 'in_transit';
        if (curStatus !== 'closed' && curStatus !== 'cancelled') {
          const { data: allPacking } = await supabase.from('import_packing_lines').select('*').eq('import_order_id', orderId);
          const derived = deriveReceivedStatus(orderItems || [], allPacking || []);
          const next = derived === 'received' ? 'received'
            : (derived === 'partially_received' && curStatus !== 'received') ? 'partially_received'
            : null;
          if (next && next !== curStatus) {
            await supabase.from('import_orders').update({ status: next, updated_at: new Date().toISOString() }).eq('id', orderId);
          }
        }
      }

      const { data: exInv } = await supabase.from('import_invoices').select('invoice_no').eq('import_order_id', orderId);
      const haveInv = new Set((exInv || []).map((i: any) => i.invoice_no));
      const newInv = p.invoices.filter((iv) => iv.invoice_no && !haveInv.has(iv.invoice_no));
      if (newInv.length) {
        const { error: invErr } = await supabase.from('import_invoices').insert(newInv.map((iv) => ({
          import_order_id: orderId, shipment_id: shipmentId, invoice_no: iv.invoice_no, invoice_type: iv.invoice_type || 'commercial',
          invoice_date: iv.invoice_date || null, currency: iv.currency || p.order.currency || 'USD',
          net_value: n(iv.net_value), freight: n(iv.freight), down_payment: n(iv.down_payment), final_amount: n(iv.final_amount), delivery_notes: iv.delivery_notes || null,
          source_document_id: iv.source_name ? (docIdByName[iv.source_name] || null) : null,
        })));
        if (invErr) throw invErr;
      }

      const { data: exCoa } = await supabase.from('import_coa').select('coa_no').eq('import_order_id', orderId);
      const haveCoa = new Set((exCoa || []).map((c: any) => c.coa_no));
      const newCoa = p.coa.filter((c) => c.coa_no && !haveCoa.has(c.coa_no));
      if (newCoa.length) {
        const { error: coaErr } = await supabase.from('import_coa').insert(newCoa.map((c) => ({
          import_order_id: orderId, coa_no: c.coa_no, coa_date: c.coa_date || null, dn: c.dn || null, pn: c.pn || null, sn: c.sn || null,
          delivery_notes: c.delivery_notes || null, passed: c.passed,
          source_document_id: c.source_name ? (docIdByName[c.source_name] || null) : null,
        })));
        if (coaErr) throw coaErr;
      }

      const notes: string[] = [];
      if (skipped) notes.push(`${skipped} שורות מתעודות משלוח שכבר נקלטו בעבר דולגו (לא נספרו פעמיים).`);
      if (failedUploads.length) notes.push(`קבצי מקור שלא נשמרו: ${failedUploads.join(', ')} — הנתונים נשמרו, אך הקישור למסמך חסר.`);
      if (notes.length) alert(notes.join('\n'));
      onSaved();
    } catch (e: any) { setErr(e?.message || 'שגיאה בשמירה'); setPhase('review'); }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" dir="rtl" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-4xl max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-content-strong"><Icon name="zap" size={20} /> העלאה חכמה — מסמכי לוט</h2>
          <button onClick={onClose} className="text-neutral-400 hover:text-content-body"><Icon name="close" size={20} /></button>
        </div>
        {err && <div className="bg-danger-soft text-danger text-[13px] rounded-lg px-3 py-2 mb-3">{err}</div>}

        {phase === 'pick' && (
          <div>
            <p className="text-[13px] text-content-muted mb-3">גררי או בחרי את כל מסמכי הלוט ביחד (חשבונית, BL, תעודות משלוח, COA). רקסי תזהה ותתאים — ותוכלי לערוך הכל לפני שמירה.</p>
            <label
              onDragEnter={(e) => {
                if (!e.dataTransfer?.types?.includes('Files')) return;
                e.preventDefault(); dragDepth.current += 1; setDragOver(true);
              }}
              onDragOver={(e) => {
                if (!e.dataTransfer?.types?.includes('Files')) return;
                e.preventDefault(); e.dataTransfer.dropEffect = 'copy';
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                dragDepth.current = Math.max(0, dragDepth.current - 1);
                if (dragDepth.current === 0) setDragOver(false);
              }}
              onDrop={onDrop}
              className={`block border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${dragOver ? 'border-primary bg-primary-50 ring-2 ring-primary-100' : 'border-line-strong hover:border-primary hover:bg-primary-50'}`}
            >
              <p className="mb-2 text-primary"><Icon name="inbox" size={32} /></p>
              <p className="text-[13px] text-content-body">{dragOver ? 'שחררי כאן את כל המסמכים' : 'גררי לכאן כמה מסמכים ביחד, או לחצי לבחירה (PDF / תמונה)'}</p>
              <input type="file" multiple className="hidden" accept=".pdf,.png,.jpg,.jpeg" onChange={(e) => { const picked = Array.from(e.target.files || []); e.target.value = ''; addFiles(picked); }} />
            </label>

            {/* Project context for the extractor — the supplier writes the
                project name in his own wording; giving Roxy our names lets her
                match it instead of guessing. */}
            <div className="mt-3 bg-neutral-50 border border-line-subtle rounded-lg px-3 py-2">
              <p className="text-[12px] font-semibold text-content-body mb-1.5">
                <Icon name="projects" size={14} /> לאילו פרויקטים שייכים המסמכים? <span className="font-normal text-neutral-400">(לא חובה — עוזר לרקסי לזהות)</span>
              </p>
              <SearchableSelect
                value=""
                onChange={(v: string) => {
                  const pr = data.projects.find((x: any) => x.id === v);
                  if (pr && !hintProjects.some((h) => h.id === pr.id)) {
                    setHintProjects([...hintProjects, { id: pr.id, name: pr.name || '' }]);
                  }
                }}
                className="w-full border border-line-subtle rounded-lg px-2 py-1 text-[12px] bg-white"
                placeholder="+ הוסיפי פרויקט"
                options={data.projects
                  .filter((pr: any) => !hintProjects.some((h) => h.id === pr.id))
                  .map((pr: any) => ({ value: pr.id, label: pr.name }))}
              />
              {hintProjects.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {hintProjects.map((h) => (
                    <span key={h.id} className="inline-flex items-center gap-1 text-[11px] bg-azure-100 text-azure-600 rounded-lg px-2 py-1">
                      {h.name}
                      <button onClick={() => setHintProjects(hintProjects.filter((x) => x.id !== h.id))} className="hover:text-danger"><Icon name="close" size={12} /></button>
                    </span>
                  ))}
                </div>
              )}
            </div>
            {files.length > 0 && (
              <div className="flex items-center justify-between mt-3 mb-1">
                <span className="text-[12px] font-semibold text-content-body">{files.length} קבצים נבחרו</span>
                <button onClick={() => setFiles([])} className="text-[11px] text-neutral-400 hover:text-danger">נקה הכל</button>
              </div>
            )}
            {files.length > 0 && <div className="space-y-1">{files.map((f, i) => (
              <div key={i} className="flex items-center justify-between text-[12px] bg-neutral-50 rounded px-2 py-1"><span dir="ltr" className="truncate">{f.name}</span><button onClick={() => setFiles(files.filter((_, j) => j !== i))} className="text-danger hover:text-danger"><Icon name="close" size={16} /></button></div>
            ))}</div>}
            <div className="flex gap-2 mt-4">
              <button onClick={extract} disabled={!files.length} className="bg-primary text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-primary-700 disabled:opacity-40"><Icon name="zap" size={16} /> חלץ והתאם ({files.length})</button>
              <button onClick={onClose} className="text-sm px-4 py-2 rounded-lg border border-line-subtle text-content-body">ביטול</button>
            </div>
          </div>
        )}

        {phase === 'extracting' && <p className="text-center text-content-muted py-12">רקסי מחלצת ומתאימה... <Icon name="loading" size={16} /></p>}
        {phase === 'saving' && <p className="text-center text-content-muted py-12">שומר... <Icon name="loading" size={16} /></p>}

        {phase === 'review' && p && (
          <div className="space-y-4">
            <p className="text-[12px] text-content-muted">בדקי וערכי לפי הצורך — אפשר לשנות כל שדה, להוסיף ולמחוק שורות. השמירה רק אחרי אישורך.</p>
            {duplicates.length > 0 && (
              <div className="bg-danger-soft text-danger rounded-lg px-3 py-2.5 border-2 border-danger">
                <p className="text-[13px] font-bold mb-1"><Icon name="warning" size={16} /> נמצאו מסמכים שכבר נקלטו במערכת — ייתכן שזו העלאה כפולה</p>
                <ul className="text-[12px] list-disc pr-5 space-y-0.5">{duplicates.map((d, i) => <li key={i}>{d}</li>)}</ul>
                <p className="text-[11px] mt-1">אם אלה אותם מסמכים — לחצי "ביטול". בשמירה תתבקשי לאשר שוב; מה שכבר קיים ידולג.</p>
              </div>
            )}
            {p.warnings.length > 0 && <div className="bg-warning-soft text-warning text-[12px] rounded-lg px-3 py-2">{p.warnings.map((w, i) => <div key={i}><Icon name="warning" size={14} /> {w}</div>)}</div>}

            <Section title="מסמכים שזוהו">
              <div className="flex flex-wrap gap-2">
                {p.docs.map((d, i) => <span key={i} className="text-[11px] bg-azure-100 text-azure-600 rounded px-2 py-1">{DOC_LABEL[d.doc_type] || d.doc_type}: <span dir="ltr">{d.name}</span></span>)}
                {rawResults.filter((r) => r.error).map((r, i) => <span key={i} className="text-[11px] bg-danger-soft text-danger rounded px-2 py-1" dir="ltr">{r.name} <Icon name="close" size={12} /></span>)}
              </div>
            </Section>

            <Section title="הזמנה">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-2">
                <L l="הזמנת ספק"><I value={p.order.supplier_order_no} onChange={(v: any) => setHdr('order', 'supplier_order_no', v)} w="w-full" ltr /></L>
                <L l="פרויקט (אצל הספק)"><I value={p.order.project_name} onChange={(v: any) => setHdr('order', 'project_name', v)} w="w-full" /></L>
                <L l="מטבע"><I value={p.order.currency} onChange={(v: any) => setHdr('order', 'currency', v)} w="w-full" ltr /></L>
                <L l="Incoterms"><I value={p.order.incoterms} onChange={(v: any) => setHdr('order', 'incoterms', v)} w="w-full" /></L>
                <L l="תנאי תשלום"><I value={p.order.payment_terms} onChange={(v: any) => setHdr('order', 'payment_terms', v)} w="w-full" /></L>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <L l="שייך לפרויקט במערכת">
                  <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="w-full text-[12px] border border-line-subtle rounded px-1.5 py-1">
                    <option value="">— מלאי / ללא פרויקט —</option>{data.projects.map((pr: any) => <option key={pr.id} value={pr.id}>{pr.name}</option>)}
                  </select>
                </L>
                <L l="ספק">
                  <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className="w-full text-[12px] border border-line-subtle rounded px-1.5 py-1">
                    <option value="">— בחר —</option>{data.suppliers.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </L>
              </div>
              <div className={`mt-2 rounded-lg px-2.5 py-2 border ${orderChoice ? 'bg-success-soft border-success-soft' : 'bg-warning-soft border-warning-soft'}`}>
                <L l="שייך להזמנת רכש קיימת">
                  <select value={orderChoice} onChange={(e) => setOrderChoice(e.target.value)} className="w-full text-[12px] border border-line-subtle rounded px-1.5 py-1 bg-white">
                    <option value="">— הזמנה חדשה מהמסמכים —</option>
                    {orderOptions.map((o: any) => (
                      <option key={o.id} value={o.id}>
                        {[o.po_number, o.supplier_order_no, o.projects?.name, o.suppliers?.name].filter(Boolean).join(' · ') || o.id}
                      </option>
                    ))}
                  </select>
                </L>
                <p className={`text-[11px] mt-1 ${orderChoice ? 'text-success' : 'text-warning'}`}>
                  {orderChoice
                    ? 'המסמכים יירשמו על הזמנת הרכש הזו, ומספר הזמנת הספק יישמר עליה לזיהוי אוטומטי בהעלאה הבאה.'
                    : 'לא נבחרה הזמנה קיימת — תיפתח הזמנה חדשה. אם ניצן כבר שלח הזמנת רכש לספק, בחרי אותה כאן כדי שלא תיווצר כפילות.'}
                </p>
              </div>
            </Section>

            <Section title="פריטים" onAdd={() => addRow('items', { material_no: '', description: '', dn: '', pn: '', sn: '', ordered_qty: '', unit: 'M', unit_price: '' })}>
              <table className="w-full text-[12px]">
                <thead><tr className="text-neutral-400 text-[10px] text-right"><th>חומר</th><th>תיאור</th><th>DN</th><th>PN</th><th>SN</th><th>כמות</th><th>יח'</th><th>מחיר</th><th></th></tr></thead>
                <tbody>{p.items.map((it, i) => (
                  <tr key={i} className="border-t border-line-subtle">
                    <td><I value={it.material_no} onChange={(v: any) => setRow('items', i, 'material_no', v)} w="w-16" ltr /></td>
                    <td><I value={it.description} onChange={(v: any) => setRow('items', i, 'description', v)} w="w-full" /></td>
                    <td><I value={it.dn} onChange={(v: any) => setRow('items', i, 'dn', v)} w="w-12" ltr /></td>
                    <td><I value={it.pn} onChange={(v: any) => setRow('items', i, 'pn', v)} w="w-10" ltr /></td>
                    <td><I value={it.sn} onChange={(v: any) => setRow('items', i, 'sn', v)} w="w-14" ltr /></td>
                    <td><I value={it.ordered_qty} onChange={(v: any) => setRow('items', i, 'ordered_qty', v)} w="w-16" type="number" /></td>
                    <td><I value={it.unit} onChange={(v: any) => setRow('items', i, 'unit', v)} w="w-10" ltr /></td>
                    <td><I value={it.unit_price} onChange={(v: any) => setRow('items', i, 'unit_price', v)} w="w-16" type="number" /></td>
                    <td><button onClick={() => delRow('items', i)} className="text-danger hover:text-danger"><Icon name="close" size={16} /></button></td>
                  </tr>
                ))}</tbody>
              </table>
            </Section>

            <Section title="משלוח (LOT)">
              <div className="grid grid-cols-2 gap-2 mb-2">
                <L l="שייך ל-LOT קיים">
                  <select value={shipmentChoice} onChange={(e) => setShipmentChoice(e.target.value)} className="w-full text-[12px] border border-line-subtle rounded px-1.5 py-1">
                    <option value="">— LOT חדש —</option>
                    {(orderChoice ? shipmentsOfOrder(orderChoice) : []).concat(
                      (data.shipments || []).filter((s: any) => s.id === shipmentChoice && !(orderChoice && shipmentsOfOrder(orderChoice).some((x: any) => x.id === s.id))),
                    ).map((s: any) => (
                      <option key={s.id} value={s.id}>{[s.lot_label, s.bl_number && `BL ${s.bl_number}`, s.vessel_name].filter(Boolean).join(' · ') || 'משלוח ללא פרטים'}</option>
                    ))}
                  </select>
                </L>
                <L l="שם ה-LOT (כמו בגיליון המעקב)"><I value={p.shipment.lot_label} onChange={(v: any) => setHdr('shipment', 'lot_label', v)} w="w-full" ltr ph="LOT3a" /></L>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <L l="BL / Booking"><I value={p.shipment.bl_number} onChange={(v: any) => setHdr('shipment', 'bl_number', v)} w="w-full" ltr /></L>
                <L l="חברת ספנות"><I value={p.shipment.carrier} onChange={(v: any) => setHdr('shipment', 'carrier', v)} w="w-full" ltr /></L>
                <L l="אוניה"><I value={p.shipment.vessel_name} onChange={(v: any) => setHdr('shipment', 'vessel_name', v)} w="w-full" ltr /></L>
                <L l="הפלגה"><I value={p.shipment.voyage_no} onChange={(v: any) => setHdr('shipment', 'voyage_no', v)} w="w-full" ltr /></L>
                <L l="נמל טעינה"><I value={p.shipment.port_loading} onChange={(v: any) => setHdr('shipment', 'port_loading', v)} w="w-full" ltr /></L>
                <L l="נמל פריקה"><I value={p.shipment.port_discharge} onChange={(v: any) => setHdr('shipment', 'port_discharge', v)} w="w-full" ltr /></L>
                <L l="ETD"><I value={p.shipment.etd} onChange={(v: any) => setHdr('shipment', 'etd', v)} w="w-full" type="date" /></L>
                <L l="ETA"><I value={p.shipment.eta} onChange={(v: any) => setHdr('shipment', 'eta', v)} w="w-full" type="date" /></L>
              </div>
            </Section>

            <Section title="מכולות" onAdd={() => addRow('containers', { container_number: '', seal_number: '', container_type: '', gross_weight: '', pieces: '' })}>
              <table className="w-full text-[12px]">
                <thead><tr className="text-neutral-400 text-[10px] text-right"><th>מספר מכולה</th><th>חותם</th><th>סוג</th><th>משקל</th><th>צינורות</th><th></th></tr></thead>
                <tbody>{p.containers.map((c, i) => (
                  <tr key={i} className="border-t border-line-subtle">
                    <td><I value={c.container_number} onChange={(v: any) => setRow('containers', i, 'container_number', v)} w="w-32" ltr /></td>
                    <td><I value={c.seal_number} onChange={(v: any) => setRow('containers', i, 'seal_number', v)} w="w-24" ltr /></td>
                    <td><I value={c.container_type} onChange={(v: any) => setRow('containers', i, 'container_type', v)} w="w-20" ltr /></td>
                    <td><I value={c.gross_weight} onChange={(v: any) => setRow('containers', i, 'gross_weight', v)} w="w-20" type="number" /></td>
                    <td><I value={c.pieces} onChange={(v: any) => setRow('containers', i, 'pieces', v)} w="w-14" type="number" /></td>
                    <td><button onClick={() => delRow('containers', i)} className="text-danger hover:text-danger"><Icon name="close" size={16} /></button></td>
                  </tr>
                ))}</tbody>
              </table>
            </Section>

            <Section title="תכולה לפי מכולה (תעודות משלוח)" onAdd={() => addRow('packingLines', { delivery_note_no: '', container_number: '', material_no: '', dn: '', shipped_qty: '', unit: 'M', pieces: '', item_id: '' })}>
              {orderChoice && p.packingLines.some((pl) => !pl.item_id) && (
                <p className="text-[11px] text-warning mb-1.5"><Icon name="warning" size={12} /> שורות מסומנות בכתום לא שויכו לפריט בהזמנה — בחרי פריט, אחרת הכמות לא תיספר ב"חסר להשלמה".</p>
              )}
              <table className="w-full text-[12px]">
                <thead><tr className="text-neutral-400 text-[10px] text-right"><th>ת. משלוח</th><th>מכולה</th><th>חומר</th><th>DN</th><th>כמות</th><th>יח'</th><th>פריט בהזמנה</th><th></th></tr></thead>
                <tbody>{p.packingLines.map((pl, i) => (
                  <tr key={i} className={`border-t border-line-subtle ${orderChoice && !pl.item_id ? 'bg-warning-soft' : ''}`}>
                    <td><I value={pl.delivery_note_no} onChange={(v: any) => setRow('packingLines', i, 'delivery_note_no', v)} w="w-24" ltr /></td>
                    <td><I value={pl.container_number} onChange={(v: any) => setRow('packingLines', i, 'container_number', v)} w="w-28" ltr /></td>
                    <td><I value={pl.material_no} onChange={(v: any) => setRow('packingLines', i, 'material_no', v)} w="w-16" ltr /></td>
                    <td><I value={pl.dn} onChange={(v: any) => setRow('packingLines', i, 'dn', v)} w="w-12" ltr /></td>
                    <td><I value={pl.shipped_qty} onChange={(v: any) => setRow('packingLines', i, 'shipped_qty', v)} w="w-16" type="number" /></td>
                    <td><I value={pl.unit} onChange={(v: any) => setRow('packingLines', i, 'unit', v)} w="w-10" ltr /></td>
                    <td>
                      {orderChoice ? (
                        <select value={pl.item_id || ''} onChange={(e) => setRow('packingLines', i, 'item_id', e.target.value)}
                          className={`max-w-[220px] border rounded px-1 py-1 text-[11px] ${pl.item_id ? 'border-line-subtle' : 'border-warning text-warning'}`}
                          title={pl.description || ''}>
                          <option value="">— לא משויך —</option>
                          {chosenItems.map((it: any) => <option key={it.id} value={it.id}>{itemLabel(it)}</option>)}
                        </select>
                      ) : <span className="text-[11px] text-neutral-400">לפי מק"ט</span>}
                    </td>
                    <td><button onClick={() => delRow('packingLines', i)} className="text-danger hover:text-danger"><Icon name="close" size={16} /></button></td>
                  </tr>
                ))}</tbody>
              </table>
            </Section>

            <Section title="חשבוניות" onAdd={() => addRow('invoices', { invoice_no: '', invoice_type: 'commercial', invoice_date: '', net_value: '', freight: '', final_amount: '', currency: p.order.currency || 'USD' })}>
              <table className="w-full text-[12px]">
                <thead><tr className="text-neutral-400 text-[10px] text-right"><th>מספר</th><th>סוג</th><th>תאריך</th><th>נטו</th><th>freight</th><th>סופי</th><th></th></tr></thead>
                <tbody>{p.invoices.map((iv, i) => (
                  <tr key={i} className="border-t border-line-subtle">
                    <td><I value={iv.invoice_no} onChange={(v: any) => setRow('invoices', i, 'invoice_no', v)} w="w-28" ltr /></td>
                    <td><select value={iv.invoice_type} onChange={(e) => setRow('invoices', i, 'invoice_type', e.target.value)} className="border border-line-subtle rounded px-1 py-1 text-[12px]"><option value="commercial">CI</option><option value="proforma">PI</option><option value="advance">מקדמה</option></select></td>
                    <td><I value={iv.invoice_date} onChange={(v: any) => setRow('invoices', i, 'invoice_date', v)} w="w-28" type="date" /></td>
                    <td><I value={iv.net_value} onChange={(v: any) => setRow('invoices', i, 'net_value', v)} w="w-20" type="number" /></td>
                    <td><I value={iv.freight} onChange={(v: any) => setRow('invoices', i, 'freight', v)} w="w-16" type="number" /></td>
                    <td><I value={iv.final_amount} onChange={(v: any) => setRow('invoices', i, 'final_amount', v)} w="w-20" type="number" /></td>
                    <td><button onClick={() => delRow('invoices', i)} className="text-danger hover:text-danger"><Icon name="close" size={16} /></button></td>
                  </tr>
                ))}</tbody>
              </table>
            </Section>

            <Section title="תעודות אנליזה (COA)" onAdd={() => addRow('coa', { coa_no: '', coa_date: '', dn: '', pn: '', sn: '', delivery_notes: '', passed: true })}>
              <table className="w-full text-[12px]">
                <thead><tr className="text-neutral-400 text-[10px] text-right"><th>מספר</th><th>תאריך</th><th>DN</th><th>PN</th><th>SN</th><th>ת. משלוח</th><th></th></tr></thead>
                <tbody>{p.coa.map((c, i) => (
                  <tr key={i} className="border-t border-line-subtle">
                    <td><I value={c.coa_no} onChange={(v: any) => setRow('coa', i, 'coa_no', v)} w="w-20" ltr /></td>
                    <td><I value={c.coa_date} onChange={(v: any) => setRow('coa', i, 'coa_date', v)} w="w-28" type="date" /></td>
                    <td><I value={c.dn} onChange={(v: any) => setRow('coa', i, 'dn', v)} w="w-12" ltr /></td>
                    <td><I value={c.pn} onChange={(v: any) => setRow('coa', i, 'pn', v)} w="w-10" ltr /></td>
                    <td><I value={c.sn} onChange={(v: any) => setRow('coa', i, 'sn', v)} w="w-14" ltr /></td>
                    <td><I value={c.delivery_notes} onChange={(v: any) => setRow('coa', i, 'delivery_notes', v)} w="w-32" ltr /></td>
                    <td><button onClick={() => delRow('coa', i)} className="text-danger hover:text-danger"><Icon name="close" size={16} /></button></td>
                  </tr>
                ))}</tbody>
              </table>
            </Section>

            <div className="flex gap-2 pt-2 border-t border-line-subtle sticky bottom-0 bg-white">
              <button onClick={save} className="bg-success text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-success"><Icon name="confirm" size={16} /> אשר ושמור</button>
              <button onClick={() => setPhase('pick')} className="text-sm px-4 py-2 rounded-lg border border-line-subtle text-content-body">חזרה</button>
              <button onClick={onClose} className="text-sm px-4 py-2 rounded-lg text-content-muted mr-auto">ביטול</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Section({ title, children, onAdd }: any) {
  return (
    <div className="border border-line-subtle rounded-xl p-3">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[12px] font-semibold text-content-body">{title}</p>
        {onAdd && <button onClick={onAdd} className="text-[11px] text-primary hover:underline">+ הוסף שורה</button>}
      </div>
      <div className="overflow-x-auto">{children}</div>
    </div>
  );
}
function L({ l, children }: any) {
  return <label className="block"><span className="text-[11px] text-neutral-400">{l}</span><div className="mt-0.5">{children}</div></label>;
}
