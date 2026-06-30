'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { reconcileDocuments, Proposal, ExtractResult } from '@/lib/import-reconcile';

const DOC_LABEL: Record<string, string> = {
  email: '📧 אימייל', order_confirmation: 'אישור הזמנה', proforma_invoice: 'פרופורמה (PI)',
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
  return <input type={type} value={value ?? ''} placeholder={ph} dir={ltr ? 'ltr' : 'rtl'} onChange={(e) => onChange(e.target.value)} className={`border border-gray-200 rounded px-1.5 py-1 text-[12px] ${w}`} />;
}

export default function SmartUpload({ data, onClose, onSaved }: any) {
  const supabase = createClient();
  const [files, setFiles] = useState<File[]>([]);
  const [phase, setPhase] = useState<'pick' | 'extracting' | 'review' | 'saving'>('pick');
  const [p, setP] = useState<Proposal | null>(null);
  const [rawResults, setRawResults] = useState<ExtractResult[]>([]);
  const [projectId, setProjectId] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [err, setErr] = useState('');

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

  function addFiles(list: FileList | null) { if (list) setFiles((prev) => [...prev, ...Array.from(list)]); }

  async function extract() {
    setErr(''); setPhase('extracting');
    try {
      const payload = await Promise.all(files.map(async (f) => ({ name: f.name, mimeType: f.type, base64: await fileToBase64(f) })));
      const res = await fetch('/api/import/extract', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ files: payload }) });
      const json = await res.json();
      if (!res.ok) { setErr(json.error || 'שגיאת חילוץ'); setPhase('pick'); return; }
      const results: ExtractResult[] = json.results || [];
      setRawResults(results);
      const prop = reconcileDocuments(results);
      setP(prop);
      if (prop.order.project_name) {
        const m = data.projects.find((pr: any) => (pr.name || '').trim() && prop.order.project_name!.toLowerCase().includes((pr.name || '').toLowerCase().slice(0, 6)));
        if (m) setProjectId(m.id);
      }
      setPhase('review');
    } catch (e: any) { setErr(e?.message || 'שגיאה'); setPhase('pick'); }
  }

  async function save() {
    if (!p) return;
    setPhase('saving'); setErr('');
    try {
      const ordersTotal = p.items.reduce((s, it) => s + (Number(it.ordered_qty) || 0) * (Number(it.unit_price) || 0), 0);

      let orderId: string;
      const existingOrder = p.order.supplier_order_no ? data.orders.find((o: any) => o.supplier_order_no === p.order.supplier_order_no) : null;
      if (existingOrder) {
        orderId = existingOrder.id;
        if (projectId && !existingOrder.project_id) await supabase.from('import_orders').update({ project_id: projectId, is_stock: false }).eq('id', orderId);
      } else {
        const { data: o, error } = await supabase.from('import_orders').insert({
          supplier_id: supplierId || null, project_id: projectId || null, is_stock: !projectId,
          supplier_order_no: p.order.supplier_order_no, supplier_project_no: p.order.supplier_project_no,
          project_name: p.order.project_name, currency: p.order.currency || 'USD',
          incoterms: p.order.incoterms, payment_terms: p.order.payment_terms,
          total_amount: Math.round(ordersTotal * 100) / 100, status: 'in_transit',
        }).select().single();
        if (error) throw error;
        orderId = o.id;
        if (p.items.length) {
          await supabase.from('import_order_items').insert(p.items.map((it, idx) => ({
            import_order_id: orderId, line_no: n(it.line_no), material_no: it.material_no || null, description: it.description || '',
            dn: it.dn || null, pn: it.pn || null, sn: it.sn || null, ordered_qty: n(it.ordered_qty) ?? 0, unit: it.unit || 'M', unit_price: n(it.unit_price), sort_order: idx,
          })));
        }
      }
      const { data: orderItems } = await supabase.from('import_order_items').select('*').eq('import_order_id', orderId);

      let shipmentId: string | null = null;
      if (p.shipment.bl_number || p.containers.length) {
        const ex = p.shipment.bl_number ? data.shipments.find((s: any) => s.bl_number === p.shipment.bl_number) : null;
        if (ex) shipmentId = ex.id;
        else {
          const { data: s, error } = await supabase.from('import_shipments').insert({ supplier_id: supplierId || null, ...p.shipment, status: 'arrived' }).select().single();
          if (error) throw error; shipmentId = s.id;
        }
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

      if (p.packingLines.length) {
        await supabase.from('import_packing_lines').insert(p.packingLines.map((pl) => {
          const oi = (orderItems || []).find((i: any) => (pl.material_no && i.material_no === pl.material_no) || (pl.dn && i.dn === pl.dn));
          return {
            delivery_note_no: pl.delivery_note_no || null, container_id: pl.container_number ? (contByNum[norm(pl.container_number)] || null) : null,
            import_order_id: orderId, import_order_item_id: oi?.id || null, material_no: pl.material_no || null, description: pl.description || '',
            dn: pl.dn || null, shipped_qty: n(pl.shipped_qty) ?? 0, unit: pl.unit || 'M', pieces: n(pl.pieces),
            loading_date: pl.loading_date || null, discharge_date: pl.discharge_date || null,
          };
        }));
      }

      const { data: exInv } = await supabase.from('import_invoices').select('invoice_no').eq('import_order_id', orderId);
      const haveInv = new Set((exInv || []).map((i: any) => i.invoice_no));
      const newInv = p.invoices.filter((iv) => iv.invoice_no && !haveInv.has(iv.invoice_no));
      if (newInv.length) await supabase.from('import_invoices').insert(newInv.map((iv) => ({
        import_order_id: orderId, shipment_id: shipmentId, invoice_no: iv.invoice_no, invoice_type: iv.invoice_type || 'commercial',
        invoice_date: iv.invoice_date || null, currency: iv.currency || p.order.currency || 'USD',
        net_value: n(iv.net_value), freight: n(iv.freight), down_payment: n(iv.down_payment), final_amount: n(iv.final_amount), delivery_notes: iv.delivery_notes || null,
      })));

      const { data: exCoa } = await supabase.from('import_coa').select('coa_no').eq('import_order_id', orderId);
      const haveCoa = new Set((exCoa || []).map((c: any) => c.coa_no));
      const newCoa = p.coa.filter((c) => c.coa_no && !haveCoa.has(c.coa_no));
      if (newCoa.length) await supabase.from('import_coa').insert(newCoa.map((c) => ({
        import_order_id: orderId, coa_no: c.coa_no, coa_date: c.coa_date || null, dn: c.dn || null, pn: c.pn || null, sn: c.sn || null,
        delivery_notes: c.delivery_notes || null, passed: c.passed,
      })));

      const typeByName: Record<string, string> = Object.fromEntries(p.docs.map((d) => [d.name, d.doc_type]));
      for (const f of files) {
        const dtype = typeByName[f.name] || 'other';
        const owner = dtype === 'bl' ? 'shipment_id' : 'import_order_id';
        const ownerId = dtype === 'bl' ? shipmentId : orderId;
        if (!ownerId) continue;
        const path = `import/${owner}/${ownerId}/${dtype}_${Date.now()}_${f.name}`;
        const { error: upErr } = await supabase.storage.from('project-files').upload(path, f);
        if (upErr) continue;
        await supabase.from('import_documents').insert({ [owner]: ownerId, doc_type: dtype, file_name: f.name, file_path: path });
      }

      onSaved();
    } catch (e: any) { setErr(e?.message || 'שגיאה בשמירה'); setPhase('review'); }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" dir="rtl" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-4xl max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-800">⚡ העלאה חכמה — מסמכי לוט</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
        </div>
        {err && <div className="bg-red-50 text-red-700 text-[13px] rounded-lg px-3 py-2 mb-3">{err}</div>}

        {phase === 'pick' && (
          <div>
            <p className="text-[13px] text-gray-500 mb-3">גררי או בחרי את כל מסמכי הלוט (חשבונית, BL, תעודות משלוח, COA). רקסי תזהה ותתאים — ותוכלי לערוך הכל לפני שמירה.</p>
            <label className="block border-2 border-dashed border-gray-300 rounded-xl p-8 text-center cursor-pointer hover:border-[#1a56db] hover:bg-blue-50/30">
              <p className="text-3xl mb-2">📥</p><p className="text-[13px] text-gray-600">בחרי קבצים (PDF / תמונה)</p>
              <input type="file" multiple className="hidden" accept=".pdf,.png,.jpg,.jpeg" onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
            </label>
            {files.length > 0 && <div className="mt-3 space-y-1">{files.map((f, i) => (
              <div key={i} className="flex items-center justify-between text-[12px] bg-gray-50 rounded px-2 py-1"><span dir="ltr" className="truncate">{f.name}</span><button onClick={() => setFiles(files.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-600">✕</button></div>
            ))}</div>}
            <div className="flex gap-2 mt-4">
              <button onClick={extract} disabled={!files.length} className="bg-[#1a56db] text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-40">⚡ חלץ והתאם ({files.length})</button>
              <button onClick={onClose} className="text-sm px-4 py-2 rounded-lg border border-gray-200 text-gray-600">ביטול</button>
            </div>
          </div>
        )}

        {phase === 'extracting' && <p className="text-center text-gray-500 py-12">רקסי מחלצת ומתאימה... ⏳</p>}
        {phase === 'saving' && <p className="text-center text-gray-500 py-12">שומר... ⏳</p>}

        {phase === 'review' && p && (
          <div className="space-y-4">
            <p className="text-[12px] text-gray-500">בדקי וערכי לפי הצורך — אפשר לשנות כל שדה, להוסיף ולמחוק שורות. השמירה רק אחרי אישורך.</p>
            {p.warnings.length > 0 && <div className="bg-amber-50 text-amber-800 text-[12px] rounded-lg px-3 py-2">{p.warnings.map((w, i) => <div key={i}>⚠️ {w}</div>)}</div>}

            <Section title="מסמכים שזוהו">
              <div className="flex flex-wrap gap-2">
                {p.docs.map((d, i) => <span key={i} className="text-[11px] bg-blue-50 text-blue-700 rounded px-2 py-1">{DOC_LABEL[d.doc_type] || d.doc_type}: <span dir="ltr">{d.name}</span></span>)}
                {rawResults.filter((r) => r.error).map((r, i) => <span key={i} className="text-[11px] bg-red-50 text-red-600 rounded px-2 py-1" dir="ltr">{r.name} ✕</span>)}
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
                  <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="w-full text-[12px] border border-gray-200 rounded px-1.5 py-1">
                    <option value="">— מלאי / ללא פרויקט —</option>{data.projects.map((pr: any) => <option key={pr.id} value={pr.id}>{pr.name || pr.client_name}</option>)}
                  </select>
                </L>
                <L l="ספק">
                  <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className="w-full text-[12px] border border-gray-200 rounded px-1.5 py-1">
                    <option value="">— בחר —</option>{data.suppliers.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </L>
              </div>
            </Section>

            <Section title="פריטים" onAdd={() => addRow('items', { material_no: '', description: '', dn: '', pn: '', sn: '', ordered_qty: '', unit: 'M', unit_price: '' })}>
              <table className="w-full text-[12px]">
                <thead><tr className="text-gray-400 text-[10px] text-right"><th>חומר</th><th>תיאור</th><th>DN</th><th>PN</th><th>SN</th><th>כמות</th><th>יח'</th><th>מחיר</th><th></th></tr></thead>
                <tbody>{p.items.map((it, i) => (
                  <tr key={i} className="border-t border-gray-100">
                    <td><I value={it.material_no} onChange={(v: any) => setRow('items', i, 'material_no', v)} w="w-16" ltr /></td>
                    <td><I value={it.description} onChange={(v: any) => setRow('items', i, 'description', v)} w="w-full" /></td>
                    <td><I value={it.dn} onChange={(v: any) => setRow('items', i, 'dn', v)} w="w-12" ltr /></td>
                    <td><I value={it.pn} onChange={(v: any) => setRow('items', i, 'pn', v)} w="w-10" ltr /></td>
                    <td><I value={it.sn} onChange={(v: any) => setRow('items', i, 'sn', v)} w="w-14" ltr /></td>
                    <td><I value={it.ordered_qty} onChange={(v: any) => setRow('items', i, 'ordered_qty', v)} w="w-16" type="number" /></td>
                    <td><I value={it.unit} onChange={(v: any) => setRow('items', i, 'unit', v)} w="w-10" ltr /></td>
                    <td><I value={it.unit_price} onChange={(v: any) => setRow('items', i, 'unit_price', v)} w="w-16" type="number" /></td>
                    <td><button onClick={() => delRow('items', i)} className="text-red-400 hover:text-red-600">✕</button></td>
                  </tr>
                ))}</tbody>
              </table>
            </Section>

            <Section title="משלוח">
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
                <thead><tr className="text-gray-400 text-[10px] text-right"><th>מספר מכולה</th><th>חותם</th><th>סוג</th><th>משקל</th><th>צינורות</th><th></th></tr></thead>
                <tbody>{p.containers.map((c, i) => (
                  <tr key={i} className="border-t border-gray-100">
                    <td><I value={c.container_number} onChange={(v: any) => setRow('containers', i, 'container_number', v)} w="w-32" ltr /></td>
                    <td><I value={c.seal_number} onChange={(v: any) => setRow('containers', i, 'seal_number', v)} w="w-24" ltr /></td>
                    <td><I value={c.container_type} onChange={(v: any) => setRow('containers', i, 'container_type', v)} w="w-20" ltr /></td>
                    <td><I value={c.gross_weight} onChange={(v: any) => setRow('containers', i, 'gross_weight', v)} w="w-20" type="number" /></td>
                    <td><I value={c.pieces} onChange={(v: any) => setRow('containers', i, 'pieces', v)} w="w-14" type="number" /></td>
                    <td><button onClick={() => delRow('containers', i)} className="text-red-400 hover:text-red-600">✕</button></td>
                  </tr>
                ))}</tbody>
              </table>
            </Section>

            <Section title="תכולה לפי מכולה (תעודות משלוח)" onAdd={() => addRow('packingLines', { delivery_note_no: '', container_number: '', material_no: '', dn: '', shipped_qty: '', unit: 'M', pieces: '' })}>
              <table className="w-full text-[12px]">
                <thead><tr className="text-gray-400 text-[10px] text-right"><th>ת. משלוח</th><th>מכולה</th><th>חומר</th><th>DN</th><th>כמות</th><th>יח'</th><th></th></tr></thead>
                <tbody>{p.packingLines.map((pl, i) => (
                  <tr key={i} className="border-t border-gray-100">
                    <td><I value={pl.delivery_note_no} onChange={(v: any) => setRow('packingLines', i, 'delivery_note_no', v)} w="w-24" ltr /></td>
                    <td><I value={pl.container_number} onChange={(v: any) => setRow('packingLines', i, 'container_number', v)} w="w-28" ltr /></td>
                    <td><I value={pl.material_no} onChange={(v: any) => setRow('packingLines', i, 'material_no', v)} w="w-16" ltr /></td>
                    <td><I value={pl.dn} onChange={(v: any) => setRow('packingLines', i, 'dn', v)} w="w-12" ltr /></td>
                    <td><I value={pl.shipped_qty} onChange={(v: any) => setRow('packingLines', i, 'shipped_qty', v)} w="w-16" type="number" /></td>
                    <td><I value={pl.unit} onChange={(v: any) => setRow('packingLines', i, 'unit', v)} w="w-10" ltr /></td>
                    <td><button onClick={() => delRow('packingLines', i)} className="text-red-400 hover:text-red-600">✕</button></td>
                  </tr>
                ))}</tbody>
              </table>
            </Section>

            <Section title="חשבוניות" onAdd={() => addRow('invoices', { invoice_no: '', invoice_type: 'commercial', invoice_date: '', net_value: '', freight: '', final_amount: '', currency: p.order.currency || 'USD' })}>
              <table className="w-full text-[12px]">
                <thead><tr className="text-gray-400 text-[10px] text-right"><th>מספר</th><th>סוג</th><th>תאריך</th><th>נטו</th><th>freight</th><th>סופי</th><th></th></tr></thead>
                <tbody>{p.invoices.map((iv, i) => (
                  <tr key={i} className="border-t border-gray-100">
                    <td><I value={iv.invoice_no} onChange={(v: any) => setRow('invoices', i, 'invoice_no', v)} w="w-28" ltr /></td>
                    <td><select value={iv.invoice_type} onChange={(e) => setRow('invoices', i, 'invoice_type', e.target.value)} className="border border-gray-200 rounded px-1 py-1 text-[12px]"><option value="commercial">CI</option><option value="proforma">PI</option><option value="advance">מקדמה</option></select></td>
                    <td><I value={iv.invoice_date} onChange={(v: any) => setRow('invoices', i, 'invoice_date', v)} w="w-28" type="date" /></td>
                    <td><I value={iv.net_value} onChange={(v: any) => setRow('invoices', i, 'net_value', v)} w="w-20" type="number" /></td>
                    <td><I value={iv.freight} onChange={(v: any) => setRow('invoices', i, 'freight', v)} w="w-16" type="number" /></td>
                    <td><I value={iv.final_amount} onChange={(v: any) => setRow('invoices', i, 'final_amount', v)} w="w-20" type="number" /></td>
                    <td><button onClick={() => delRow('invoices', i)} className="text-red-400 hover:text-red-600">✕</button></td>
                  </tr>
                ))}</tbody>
              </table>
            </Section>

            <Section title="תעודות אנליזה (COA)" onAdd={() => addRow('coa', { coa_no: '', coa_date: '', dn: '', pn: '', sn: '', delivery_notes: '', passed: true })}>
              <table className="w-full text-[12px]">
                <thead><tr className="text-gray-400 text-[10px] text-right"><th>מספר</th><th>תאריך</th><th>DN</th><th>PN</th><th>SN</th><th>ת. משלוח</th><th></th></tr></thead>
                <tbody>{p.coa.map((c, i) => (
                  <tr key={i} className="border-t border-gray-100">
                    <td><I value={c.coa_no} onChange={(v: any) => setRow('coa', i, 'coa_no', v)} w="w-20" ltr /></td>
                    <td><I value={c.coa_date} onChange={(v: any) => setRow('coa', i, 'coa_date', v)} w="w-28" type="date" /></td>
                    <td><I value={c.dn} onChange={(v: any) => setRow('coa', i, 'dn', v)} w="w-12" ltr /></td>
                    <td><I value={c.pn} onChange={(v: any) => setRow('coa', i, 'pn', v)} w="w-10" ltr /></td>
                    <td><I value={c.sn} onChange={(v: any) => setRow('coa', i, 'sn', v)} w="w-14" ltr /></td>
                    <td><I value={c.delivery_notes} onChange={(v: any) => setRow('coa', i, 'delivery_notes', v)} w="w-32" ltr /></td>
                    <td><button onClick={() => delRow('coa', i)} className="text-red-400 hover:text-red-600">✕</button></td>
                  </tr>
                ))}</tbody>
              </table>
            </Section>

            <div className="flex gap-2 pt-2 border-t border-gray-100 sticky bottom-0 bg-white">
              <button onClick={save} className="bg-green-600 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-green-700">✓ אשר ושמור</button>
              <button onClick={() => setPhase('pick')} className="text-sm px-4 py-2 rounded-lg border border-gray-200 text-gray-600">חזרה</button>
              <button onClick={onClose} className="text-sm px-4 py-2 rounded-lg text-gray-500 mr-auto">ביטול</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Section({ title, children, onAdd }: any) {
  return (
    <div className="border border-gray-200 rounded-xl p-3">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[12px] font-semibold text-gray-600">{title}</p>
        {onAdd && <button onClick={onAdd} className="text-[11px] text-[#1a56db] hover:underline">+ הוסף שורה</button>}
      </div>
      <div className="overflow-x-auto">{children}</div>
    </div>
  );
}
function L({ l, children }: any) {
  return <label className="block"><span className="text-[11px] text-gray-400">{l}</span><div className="mt-0.5">{children}</div></label>;
}
