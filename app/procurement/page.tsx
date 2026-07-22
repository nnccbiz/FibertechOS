'use client';

/**
 * רכש — Nitzan's procurement desk. A purchase order is born here (from a signed
 * quote's supplier cost input), edited here, exported as a branded PDF, and
 * only when explicitly marked "הועבר לספק" (po_sent_at stamped) it moves on to
 * the /import module. Gated by the import module permission.
 */
import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { usePermissions } from '@/lib/auth/permissions-context';
import SearchableSelect from '@/components/ui/SearchableSelect';
import Icon from '@/components/ui/Icon';
import PODocument, { type PODocumentHandle } from '@/components/procurement/PODocument';

const CURRENCIES = ['USD', 'EUR', 'GBP', 'ILS'];

function money(v: number | string | null | undefined, currency: string) {
  const n = Number(v) || 0;
  const cur = currency || 'ILS';
  try {
    return new Intl.NumberFormat(cur === 'ILS' ? 'he-IL' : 'en-US', { style: 'currency', currency: cur, maximumFractionDigits: 0 }).format(n);
  } catch {
    return `${n.toLocaleString()} ${cur}`;
  }
}
function fmtDate(d: string | null | undefined) {
  return d ? new Date(d).toLocaleDateString('he-IL') : '—';
}

function Empty({ text }: { text: string }) {
  return <p className="text-sm text-neutral-400 text-center py-6">{text}</p>;
}

const hasHebrew = (s: string | null | undefined) => /[֐-׿]/.test(s || '');

// Standard PO terms — seeded into every new PO's notes; Nitzan edits freely.
// Foreign-currency POs go to foreign suppliers → English; domestic → Hebrew.
const DEFAULT_PO_NOTES_EN = [
  '1. Upon invoice submission, the supplier shall provide quality certificates for all supplied goods.',
  '2. The goods shall be packed on wooden pallets.',
  '3. During packing, the supplier shall provide Fibertech with photos and details of the packing, to allow Fibertech to prepare for unloading.',
  '4. This order is subject to compliance with the agreed time schedule. Any deviation from the agreed schedule will incur penalties, which will be deducted from the payment due to the supplier for the goods.',
].join('\n');
const DEFAULT_PO_NOTES_HE = [
  '1. בעת הגשת החשבונית הספק ימציא תעודות איכות לכלל הטובין שסופקו.',
  '2. הטובין יומכלו על גבי משטחי עץ.',
  '3. בעת ההמכלה הספק ידאג להמציא לפיברטק תמונות ומידע על ההמכלה לטובת היערכות פיברטק לפריקה.',
  '4. הזמנה זו כפופה לעמידה בלוח הזמנים, חריגה מלוח הזמנים המוסכם תגרור קנסות אשר יקוזזו מתשלום אותו פיברטק צריכה לשלם לספק בגין הטובין.',
].join('\n');
const defaultPoNotes = (currency: string | null | undefined) => (currency === 'ILS' ? DEFAULT_PO_NOTES_HE : DEFAULT_PO_NOTES_EN);

// ============================================================
// Translation window — Hebrew free text → editable English, side by side.
// Gemini (mode:'text') translates; Nitzan reviews/edits each line, then
// "החל" writes the English back into the PO editor fields.
// ============================================================
type TranslateField = { key: string; label: string; text: string };

function TranslateModal({ fields, onApply, onClose }: {
  fields: TranslateField[];
  onApply: (values: { key: string; value: string }[]) => void;
  onClose: () => void;
}) {
  const [translations, setTranslations] = useState<string[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const SEP = '\n###\n';
        const prompt = `Translate the following Hebrew texts into professional English suitable for a purchase order sent to a foreign supplier. Keep technical terms, product codes (DN, PN, SN, GRP), numbers and units exactly as they are. Return ONLY the translations, in the same order, separated by a line containing exactly ###. No numbering, no commentary.\n\n${fields.map((f) => f.text).join(SEP)}`;
        const res = await fetch('/api/ai', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode: 'text', message: prompt }),
        });
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok || !data.text) { setError(data.error || 'התרגום נכשל — נסה שוב.'); return; }
        const parts = String(data.text).split(/\n?\s*#{3,}\s*\n?/).map((s: string) => s.trim());
        setTranslations(fields.map((_, i) => parts[i] ?? ''));
      } catch {
        if (!cancelled) setError('התרגום נכשל — בדוק חיבור ונסה שוב.');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center overflow-y-auto p-4" onClick={onClose}>
      <div className="bg-white rounded-xl max-w-[900px] w-full my-8" onClick={(e) => e.stopPropagation()} dir="rtl">
        <div className="flex items-center justify-between px-5 py-3 border-b border-line-subtle">
          <p className="font-bold text-content-strong"><Icon name="ai" size={18} /> תרגום לאנגלית</p>
          <button onClick={onClose} className="text-content-muted hover:text-content-strong px-2"><Icon name="close" size={18} /></button>
        </div>
        <div className="p-5">
          {error ? (
            <p className="text-sm text-danger text-center py-8">{error}</p>
          ) : !translations ? (
            <p className="text-sm text-neutral-400 text-center py-8"><Icon name="loading" size={16} /> מתרגם…</p>
          ) : (
            <>
              <p className="text-[12px] text-neutral-400 mb-3">בדוק וערוך את התרגום לפני ההחלה — האנגלית תחליף את הטקסט בעורך ההזמנה.</p>
              <div className="space-y-3 max-h-[55vh] overflow-y-auto pl-1">
                {fields.map((f, i) => (
                  <div key={f.key} className="grid grid-cols-2 gap-3 items-start">
                    <div>
                      <p className="text-[11px] text-neutral-400 mb-1">{f.label} — מקור</p>
                      <div className="text-[13px] text-content-body bg-neutral-50 border border-line-subtle rounded-lg px-3 py-2 whitespace-pre-line">{f.text}</div>
                    </div>
                    <div>
                      <p className="text-[11px] text-neutral-400 mb-1">English — ניתן לעריכה</p>
                      <textarea
                        value={translations[i]}
                        onChange={(e) => setTranslations((prev) => prev!.map((t, j) => (j === i ? e.target.value : t)))}
                        dir="ltr"
                        rows={Math.max(2, Math.ceil((translations[i] || '').length / 60))}
                        className="w-full text-[13px] border border-line-subtle rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary"
                      />
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex justify-end gap-2 mt-4">
                <button onClick={onClose} className="text-[13px] px-4 py-2 rounded-lg bg-neutral-100 text-content-body hover:bg-neutral-200">ביטול</button>
                <button
                  onClick={() => onApply(fields.map((f, i) => ({ key: f.key, value: translations[i] || '' })))}
                  className="text-[13px] font-semibold px-4 py-2 rounded-lg bg-primary text-white hover:bg-primary-700"
                >
                  <Icon name="confirm" size={14} /> החל את התרגומים
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ProcurementPage() {
  const supabase = createClient();
  const { canAccess } = usePermissions();
  const canView = canAccess('import', 'view');
  const canEdit = canAccess('import', 'edit');
  const canDelete = canAccess('import', 'full');

  const [loading, setLoading] = useState(true);
  const [signedQuotes, setSignedQuotes] = useState<any[]>([]);
  const [allOrderQuoteIds, setAllOrderQuoteIds] = useState<Set<string>>(new Set());
  const [exemptQuoteIds, setExemptQuoteIds] = useState<Set<string>>(new Set());
  const [draftPOs, setDraftPOs] = useState<any[]>([]);
  const [sentPOs, setSentPOs] = useState<any[]>([]);
  const [itemsByPO, setItemsByPO] = useState<Record<string, any[]>>({});
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [msByQuote, setMsByQuote] = useState<Record<string, string>>({});
  const [creatingPO, setCreatingPO] = useState<string | null>(null);
  const [expandedPO, setExpandedPO] = useState<string | null>(null);
  const [showSent, setShowSent] = useState(false);

  async function load() {
    const [ordRes, supRes, projRes, custOrdRes, exemptRes, sqRes] = await Promise.all([
      supabase.from('import_orders').select('*, suppliers(id, name, contact_name)').order('created_at', { ascending: false }),
      supabase.from('suppliers').select('id, name, contact_name, currency').order('name'),
      supabase.from('projects').select('id, name').order('name'),
      supabase.from('orders').select('id, quote_id, ms_number'),
      supabase.from('import_quote_exemptions').select('quote_id'),
      supabase.from('quotes').select('id, project_id, quote_number, client_name, total_amount, currency, cost_input_id, sent_at, updated_at').eq('status', 'signed').order('updated_at', { ascending: false }),
    ]);
    const orders = ordRes.data || [];
    const drafts = orders.filter((o: any) => !o.po_sent_at);
    setDraftPOs(drafts);
    setSentPOs(orders.filter((o: any) => o.po_sent_at));
    setAllOrderQuoteIds(new Set(orders.map((o: any) => o.quote_id).filter(Boolean)));
    setExemptQuoteIds(new Set((exemptRes.data || []).map((e: any) => e.quote_id)));
    setSuppliers(supRes.data || []);
    setProjects(projRes.data || []);
    setSignedQuotes(sqRes.data || []);
    const ms: Record<string, string> = {};
    (custOrdRes.data || []).forEach((o: any) => { if (o.quote_id && o.ms_number) ms[o.quote_id] = o.ms_number; });
    setMsByQuote(ms);

    const draftIds = drafts.map((o: any) => o.id);
    if (draftIds.length) {
      const { data: its } = await supabase.from('import_order_items').select('*').in('import_order_id', draftIds).order('sort_order');
      const map: Record<string, any[]> = {};
      (its || []).forEach((it: any) => { (map[it.import_order_id] = map[it.import_order_id] || []).push(it); });
      setItemsByPO(map);
    } else {
      setItemsByPO({});
    }
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  const projNameById: Record<string, string> = {};
  projects.forEach((p) => { projNameById[p.id] = p.name; });

  const pendingQuotes = signedQuotes.filter((q) => !allOrderQuoteIds.has(q.id) && !exemptQuoteIds.has(q.id));

  // One-click PO from the quote's supplier cost input. Guarded against
  // double-click; opens the editor on the new PO immediately.
  async function createPO(q: any) {
    if (creatingPO) return;
    setCreatingPO(q.id);
    try {
      if (!q.cost_input_id) { alert('להצעה אין תמחור ספק מקושר — לא ניתן ליצור הזמנת רכש אוטומטית.'); return; }
      const [{ data: ci }, { data: items }] = await Promise.all([
        supabase.from('cost_inputs').select('source_name, currency, payment_terms').eq('id', q.cost_input_id).single(),
        supabase.from('cost_input_items').select('*').eq('cost_input_id', q.cost_input_id).order('sort_order'),
      ]);
      if (!items?.length) { alert('התמחור המקושר ריק — אין שורות להזמנה.'); return; }
      const itemCur = items.find((i: any) => i.original_currency && i.original_currency !== 'ILS')?.original_currency;
      const currency = (ci?.currency && ci.currency !== 'ILS') ? ci.currency : (itemCur || 'ILS');

      // Supplier: normalize away "(העתק)" copies, match by name, create if new.
      let supplierId: string | null = null;
      const supName = (ci?.source_name || '').replace(/\s*\(העתק\)/g, '').trim();
      if (supName) {
        const existing = suppliers.find((s) => s.name?.trim().toLowerCase() === supName.toLowerCase())
          || suppliers.find((s) => s.name && (supName.includes(s.name.trim()) || s.name.trim().includes(supName)));
        if (existing) supplierId = existing.id;
        else {
          const { data: ns } = await supabase.from('suppliers').insert({ name: supName, currency }).select('id').single();
          supplierId = ns?.id || null;
        }
      }
      const { data: custOrder } = await supabase.from('orders').select('id, ms_number').eq('quote_id', q.id).maybeSingle();
      // PO number mirrors the approved quote's number with HM → PO
      // (same convention as customer orders' HM → HZ); RPC fallback otherwise.
      let poNumber: string | null = q.quote_number ? q.quote_number.replace(/^HM/, 'PO') : null;
      if (!poNumber) {
        const { data: rpcNum } = await supabase.rpc('next_doc_number', { p_kind: 'po' });
        poNumber = rpcNum || null;
      }
      const unitPrice = (it: any) => Number(it.original_price) || Number(it.cost_price) || 0;
      const total = items.reduce((sum: number, it: any) => sum + unitPrice(it) * (Number(it.quantity) || 0), 0);

      const { data: po, error } = await supabase.from('import_orders').insert({
        supplier_id: supplierId,
        project_id: q.project_id || null,
        project_name: projNameById[q.project_id] || null,
        quote_id: q.id,
        customer_order_id: custOrder?.id || null,
        po_number: poNumber || null,
        currency,
        payment_terms: ci?.payment_terms || null,
        total_amount: Math.round(total * 100) / 100,
        order_date: new Date().toISOString().slice(0, 10),
        status: 'planned',
        origin: 'manual_from_quote',
        procurement_type: currency === 'ILS' ? 'domestic' : 'import',
        notes: defaultPoNotes(currency),
      }).select('id').single();
      if (error || !po) { alert(`שגיאה ביצירת ההזמנה: ${error?.message}`); return; }

      const { error: itemsErr } = await supabase.from('import_order_items').insert(items.map((it: any, idx: number) => ({
        import_order_id: po.id,
        line_no: idx + 1,
        description: it.product_name || null,
        dn: String(it.dn_size || '').replace(/\D/g, '') || null,
        pn: it.pn != null ? String(it.pn) : null,
        sn: it.sn != null ? String(it.sn) : null,
        unit: it.unit || null,
        ordered_qty: Number(it.quantity) || 0,
        unit_price: unitPrice(it),
        sort_order: idx,
      })));
      if (itemsErr) alert(`ההזמנה נוצרה אך שורותיה לא נשמרו: ${itemsErr.message}`);
      await load();
      setExpandedPO(po.id);
    } finally {
      setCreatingPO(null);
    }
  }

  if (loading) {
    return <div className="p-6" dir="rtl"><p className="text-neutral-400 text-center py-12">טוען רכש...</p></div>;
  }
  if (!canView) {
    return <div className="p-6" dir="rtl"><p className="text-neutral-400 text-center py-12">אין לך הרשאה לצפות במודול הרכש.</p></div>;
  }

  return (
    <div className="p-6 max-w-6xl mx-auto" dir="rtl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-content-strong"><Icon name="procurement" size={24} /> רכש</h1>
          <p className="text-sm text-content-muted mt-1">הפקת הזמנות רכש מהזמנות חתומות — עריכה, PDF והעברה לספק</p>
        </div>
        <a href="/import" className="text-sm text-primary hover:underline"><Icon name="import" size={16} /> ליבוא ←</a>
      </div>

      {/* Signed quotes waiting for a PO */}
      <section className="mb-8">
        <h2 className="text-lg font-bold text-content-body mb-3"><Icon name="inbox" size={20} /> ממתין להזמנת רכש ({pendingQuotes.length})</h2>
        {pendingQuotes.length === 0 ? <Empty text="אין הזמנות חתומות שממתינות להזמנת רכש 🎉" /> : (
          <div className="bg-white rounded-xl border border-line-subtle overflow-hidden">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="bg-neutral-50 text-neutral-400 text-[11px] text-right">
                  <th className="font-medium py-2 px-3">הצעה</th>
                  <th className="font-medium py-2 px-3">מ"ס</th>
                  <th className="font-medium py-2 px-3">פרויקט</th>
                  <th className="font-medium py-2 px-3">לקוח</th>
                  <th className="font-medium py-2 px-3">סכום</th>
                  <th className="font-medium py-2 px-3"></th>
                </tr>
              </thead>
              <tbody>
                {pendingQuotes.map((q) => (
                  <tr key={q.id} className="border-t border-line-subtle hover:bg-neutral-50">
                    <td className="py-2 px-3 font-mono text-content-muted" dir="ltr">{q.quote_number || '—'}</td>
                    <td className="py-2 px-3 font-mono text-content-muted" dir="ltr">{msByQuote[q.id] || '—'}</td>
                    <td className="py-2 px-3 text-content-body">
                      {q.project_id ? <a href={`/projects/${q.project_id}`} className="text-primary hover:underline">{projNameById[q.project_id] || '—'}</a> : '—'}
                    </td>
                    <td className="py-2 px-3 text-content-body">{q.client_name || '—'}</td>
                    <td className="py-2 px-3 text-content-body">{money(q.total_amount, q.currency || 'ILS')}</td>
                    <td className="py-2 px-3 text-left">
                      {canEdit && (
                        <button
                          onClick={() => createPO(q)}
                          disabled={!!creatingPO}
                          className="text-[12px] font-semibold text-white bg-primary px-3 py-1.5 rounded-lg hover:bg-primary-700 disabled:opacity-50"
                        >
                          {creatingPO === q.id ? <><Icon name="loading" size={12} /> יוצר…</> : <><Icon name="add" size={12} /> צור הזמנת רכש</>}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* POs in preparation */}
      <section className="mb-8">
        <h2 className="text-lg font-bold text-content-body mb-3"><Icon name="note" size={20} /> הזמנות רכש בהכנה ({draftPOs.length})</h2>
        {draftPOs.length === 0 ? <Empty text="אין הזמנות רכש בהכנה. צור אחת מהרשימה למעלה." /> : (
          <div className="space-y-3">
            {draftPOs.map((po) => (
              <POCard
                key={po.id}
                po={po}
                items={itemsByPO[po.id] || []}
                suppliers={suppliers}
                projNameById={projNameById}
                msByQuote={msByQuote}
                quoteNumber={signedQuotes.find((q) => q.id === po.quote_id)?.quote_number || null}
                expanded={expandedPO === po.id}
                onToggle={() => setExpandedPO(expandedPO === po.id ? null : po.id)}
                canEdit={canEdit}
                canDelete={canDelete}
                onUpdate={load}
              />
            ))}
          </div>
        )}
      </section>

      {/* Recently sent — context + jump to import */}
      <section>
        <button onClick={() => setShowSent(!showSent)} className="text-lg font-bold text-content-body mb-3 flex items-center gap-2 hover:text-primary">
          <Icon name="send" size={20} /> הועברו לספק ({sentPOs.length}) <Icon name={showSent ? 'caretUp' : 'caretDown'} size={14} />
        </button>
        {showSent && (
          sentPOs.length === 0 ? <Empty text="עדיין לא הועברו הזמנות לספק." /> : (
            <div className="bg-white rounded-xl border border-line-subtle overflow-hidden">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="bg-neutral-50 text-neutral-400 text-[11px] text-right">
                    <th className="font-medium py-2 px-3">מס׳ הזמנה</th>
                    <th className="font-medium py-2 px-3">ספק</th>
                    <th className="font-medium py-2 px-3">פרויקט</th>
                    <th className="font-medium py-2 px-3">סכום</th>
                    <th className="font-medium py-2 px-3">הועברה לספק</th>
                    <th className="font-medium py-2 px-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {sentPOs.slice(0, 15).map((po) => (
                    <tr key={po.id} className="border-t border-line-subtle hover:bg-neutral-50">
                      <td className="py-2 px-3 font-mono text-content-muted" dir="ltr">{po.po_number || po.supplier_order_no || '—'}</td>
                      <td className="py-2 px-3 text-content-body" dir="ltr">{po.suppliers?.name || '—'}</td>
                      <td className="py-2 px-3 text-content-body">{po.project_name || projNameById[po.project_id] || '—'}</td>
                      <td className="py-2 px-3 text-content-body">{money(po.total_amount, po.currency || 'ILS')}</td>
                      <td className="py-2 px-3 text-content-muted">{fmtDate(po.po_sent_at)}</td>
                      <td className="py-2 px-3 text-left"><a href="/import" className="text-[12px] text-primary hover:underline">מעקב ביבוא ←</a></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </section>
    </div>
  );
}

// ============================================================
// PO card — inline editor + PDF + send-to-supplier
// ============================================================
function POCard({ po, items, suppliers, projNameById, msByQuote, quoteNumber, expanded, onToggle, canEdit, canDelete, onUpdate }: any) {
  const supabase = createClient();
  const [form, setForm] = useState<any>(null);
  const [rows, setRows] = useState<any[]>([]);
  const [quoteItems, setQuoteItems] = useState<any[] | null>(null);
  const [deletedRowIds, setDeletedRowIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [showPdf, setShowPdf] = useState(false);
  const [translateFields, setTranslateFields] = useState<TranslateField[] | null>(null);
  const pdfRef = useRef<PODocumentHandle>(null);

  // Editable copy — reset whenever the card opens or fresh data arrives.
  useEffect(() => {
    if (!expanded) return;
    setForm({
      supplier_id: po.supplier_id || '',
      currency: po.currency || 'USD',
      order_date: po.order_date || new Date().toISOString().slice(0, 10),
      delivery_date: po.delivery_date || '',
      payment_terms: po.payment_terms || '',
      incoterms: po.incoterms || '',
      project_name: po.project_name || projNameById[po.project_id] || '',
      // Older POs created before the default terms existed get them on open.
      notes: po.notes || defaultPoNotes(po.currency),
    });
    setRows(items.map((it: any) => ({ ...it })));
    setDeletedRowIds([]);
  }, [expanded, po, items]);

  // The customer-approved quote lines — the reference the PO is checked against.
  useEffect(() => {
    if (!expanded || !po.quote_id) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('quote_items')
        .select('product_name, dn_size, pn, sn, quantity, unit')
        .eq('quote_id', po.quote_id);
      if (!cancelled) setQuoteItems(data || []);
    })();
    return () => { cancelled = true; };
  }, [expanded, po.quote_id]);

  // Item identity = product signature + DN|PN|SN. The signature (product name
  // with lengths/numbers stripped) is essential: the same DN carries several
  // distinct products (GRP pipe, rocker, Reka coupling, wall coupling), and
  // matching on DN|PN|SN alone wrongly merges them — producing wrong quantities
  // and hiding items the customer didn't order.
  const prodSig = (s: any) => String(s ?? '')
    .toLowerCase()
    .replace(/l\s*=?\s*[\d.]+\s*m?\b/g, ' ')   // strip length tokens (L=5.7m)
    .replace(/[\d.]+/g, ' ')                    // strip remaining numbers
    .replace(/[^a-z֐-׿]+/g, ' ')      // keep letters (latin + hebrew)
    .trim()
    .replace(/\s+/g, ' ');
  const specKey = (desc: any, dn: any, pn: any, sn: any) => {
    const n = (v: any) => { const x = parseInt(String(v ?? '').replace(/\D/g, ''), 10); return isNaN(x) ? '' : x; };
    const d = n(dn);
    if (d === '') return null;
    return `${prodSig(desc)}|${d}|${n(pn)}|${n(sn)}`;
  };
  const specLabel = (k: string) => {
    const [sig, d, p, s] = k.split('|');
    const words = sig.split(' ').filter(Boolean).slice(0, 3).join(' ');
    return `DN${d}${p ? ` PN${p}` : ''}${s ? ` SN${Number(s).toLocaleString('en-US')}` : ''}${words ? ` · ${words}` : ''}`;
  };

  // Aggregate quote quantities per spec, compare against the live PO rows.
  // Overlapping specs with different totals = anomaly; specs the customer
  // approved that are absent from the PO = missing.
  const quoteAgg = (() => {
    if (!quoteItems?.length) return null;
    const m = new Map<string, number>();
    quoteItems.forEach((qi) => {
      const k = specKey(qi.product_name, qi.dn_size, qi.pn, qi.sn);
      if (!k) return;
      m.set(k, (m.get(k) || 0) + (Number(qi.quantity) || 0));
    });
    return m.size ? m : null;
  })();

  const comparison = (() => {
    if (!quoteAgg || !form) return null;
    const poAgg = new Map<string, { qty: number; rowIdxs: number[] }>();
    rows.forEach((r, idx) => {
      const k = specKey(r.description, r.dn, r.pn, r.sn);
      if (!k) return;
      const e = poAgg.get(k) || { qty: 0, rowIdxs: [] };
      e.qty += Number(r.ordered_qty) || 0;
      e.rowIdxs.push(idx);
      poAgg.set(k, e);
    });
    const mismatches: { k: string; quoteQty: number; poQty: number }[] = [];
    const missing: { k: string; quoteQty: number }[] = [];
    quoteAgg.forEach((qQty, k) => {
      const p = poAgg.get(k);
      if (!p) missing.push({ k, quoteQty: qQty });
      else if (Math.abs(p.qty - qQty) > 0.001) mismatches.push({ k, quoteQty: qQty, poQty: p.qty });
    });
    // PO specs the customer did NOT order (not in the signed quote) — to remove.
    const extras: { k: string; poQty: number }[] = [];
    poAgg.forEach((v, k) => { if (!quoteAgg.has(k)) extras.push({ k, poQty: v.qty }); });
    return { mismatches, missing, extras, poAgg };
  })();
  const hasAnomaly = !!comparison && (comparison.mismatches.length > 0 || comparison.missing.length > 0 || comparison.extras.length > 0);

  // Pull the approved quantities into matching PO rows (unique-match only);
  // stays local until שמור.
  function pullQuantitiesFromQuote() {
    if (!quoteAgg || !comparison) return;
    let applied = 0; const skipped: string[] = [];
    setRows((prev) => {
      const next = prev.map((r) => ({ ...r }));
      quoteAgg.forEach((qQty, k) => {
        const p = comparison.poAgg.get(k);
        if (!p) return;
        if (p.rowIdxs.length === 1) {
          if (Math.abs((Number(next[p.rowIdxs[0]].ordered_qty) || 0) - qQty) > 0.001) {
            next[p.rowIdxs[0]].ordered_qty = qQty;
            applied++;
          }
        } else if (Math.abs(p.qty - qQty) > 0.001) {
          skipped.push(specLabel(k));
        }
      });
      return next;
    });
    setTimeout(() => {
      let msg = applied > 0 ? `עודכנו כמויות ב-${applied} שורות מתוך ההצעה המאושרת. זכור לשמור.` : 'הכמויות כבר תואמות להצעה המאושרת.';
      if (skipped.length) msg += `\nדולגו (כמה שורות לאותו מפרט — עדכן ידנית): ${skipped.join(', ')}`;
      alert(msg);
    }, 0);
  }

  const currency = form?.currency || po.currency || 'ILS';
  const liveRows = form ? rows : items;
  const total = liveRows.reduce((s: number, it: any) => s + (Number(it.unit_price) || 0) * (Number(it.ordered_qty) || 0), 0);
  const supplier = suppliers.find((s: any) => s.id === (form?.supplier_id || po.supplier_id)) || po.suppliers || null;

  function setRow(idx: number, key: string, val: any) {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, [key]: val } : r)));
  }
  function addRow() {
    setRows((prev) => [...prev, { id: null, description: '', dn: '', pn: '', sn: '', unit: 'יח׳', ordered_qty: 1, unit_price: 0, sort_order: prev.length }]);
  }
  function removeRow(idx: number) {
    setRows((prev) => {
      const r = prev[idx];
      if (r?.id) setDeletedRowIds((d) => [...d, r.id]);
      return prev.filter((_, i) => i !== idx);
    });
  }

  async function save(): Promise<boolean> {
    if (!form) return false;
    setSaving(true);
    try {
      const newTotal = Math.round(rows.reduce((s, it) => s + (Number(it.unit_price) || 0) * (Number(it.ordered_qty) || 0), 0) * 100) / 100;
      const { error } = await supabase.from('import_orders').update({
        supplier_id: form.supplier_id || null,
        currency: form.currency,
        order_date: form.order_date || null,
        delivery_date: form.delivery_date || null,
        payment_terms: form.payment_terms || null,
        incoterms: form.incoterms || null,
        project_name: form.project_name || null,
        notes: form.notes || null,
        total_amount: newTotal,
        procurement_type: form.currency === 'ILS' ? 'domestic' : 'import',
        updated_at: new Date().toISOString(),
      }).eq('id', po.id);
      if (error) { alert(`שמירת ההזמנה נכשלה: ${error.message}`); return false; }

      if (deletedRowIds.length) {
        const { error: delErr } = await supabase.from('import_order_items').delete().in('id', deletedRowIds);
        if (delErr) { alert(`מחיקת שורות נכשלה: ${delErr.message}`); return false; }
      }
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const payload = {
          description: r.description || null,
          dn: r.dn || null, pn: r.pn || null, sn: r.sn || null,
          unit: r.unit || null,
          ordered_qty: Number(r.ordered_qty) || 0,
          unit_price: Number(r.unit_price) || 0,
          line_no: i + 1, sort_order: i,
        };
        if (r.id) {
          const { error: upErr } = await supabase.from('import_order_items').update(payload).eq('id', r.id);
          if (upErr) { alert(`שמירת שורה ${i + 1} נכשלה: ${upErr.message}`); return false; }
        } else {
          const { error: insErr } = await supabase.from('import_order_items').insert({ ...payload, import_order_id: po.id });
          if (insErr) { alert(`הוספת שורה ${i + 1} נכשלה: ${insErr.message}`); return false; }
        }
      }
      await onUpdate();
      return true;
    } finally {
      setSaving(false);
    }
  }

  async function sendToSupplier() {
    if (!confirm(`להעביר את הזמנת רכש ${po.po_number || ''} לספק?\nההזמנה תעבור למעקב במודול היבוא.`)) return;
    setSending(true);
    try {
      const saved = await save();
      if (!saved) return;
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from('import_orders').update({
        po_sent_at: new Date().toISOString(),
        po_sent_by: user?.id || null,
        status: po.status === 'draft' ? 'planned' : po.status,
        reviewed_at: po.reviewed_at || new Date().toISOString(),
        reviewed_by: po.reviewed_by || user?.id || null,
      }).eq('id', po.id);
      if (error) { alert(`ההעברה נכשלה: ${error.message}`); return; }
      await onUpdate();
    } finally {
      setSending(false);
    }
  }

  // Collect every Hebrew free-text field on the PO for the translation window.
  function openTranslate() {
    const f: TranslateField[] = [];
    if (hasHebrew(form?.project_name)) f.push({ key: 'project_name', label: 'שם הפרויקט', text: form.project_name });
    if (hasHebrew(form?.notes)) f.push({ key: 'notes', label: 'הערות', text: form.notes });
    if (hasHebrew(form?.payment_terms)) f.push({ key: 'payment_terms', label: 'תנאי תשלום', text: form.payment_terms });
    rows.forEach((r, idx) => {
      if (hasHebrew(r.description)) f.push({ key: `desc-${idx}`, label: `שורה ${idx + 1}`, text: r.description });
    });
    if (f.length === 0) { alert('אין טקסט בעברית לתרגום — כל השדות כבר באנגלית.'); return; }
    setTranslateFields(f);
  }

  function applyTranslations(values: { key: string; value: string }[]) {
    values.forEach(({ key, value }) => {
      if (!value.trim()) return;
      if (key === 'notes') setForm((prev: any) => ({ ...prev, notes: value }));
      else if (key === 'project_name') setForm((prev: any) => ({ ...prev, project_name: value }));
      else if (key === 'payment_terms') setForm((prev: any) => ({ ...prev, payment_terms: value }));
      else if (key.startsWith('desc-')) {
        const idx = parseInt(key.slice(5), 10);
        setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, description: value } : r)));
      }
    });
    setTranslateFields(null);
  }

  // One-click anomaly repair, in this order (everything stays local until שמור):
  // 1. Complete missing PN/SN on PO rows that unambiguously match an approved
  //    spec (same product + DN, blank PN/SN) — the usual root cause when the
  //    supplier pricing lacked pn/sn.
  // 2. Align quantities to the approved quote (unique-row match per spec).
  // 3. Add rows for approved specs still absent from the PO (price 0).
  // 4. REMOVE PO rows whose spec isn't in the signed quote at all — the items
  //    the customer ended up not ordering.
  function autoFixAnomalies() {
    if (!quoteAgg) return;
    const report: string[] = [];
    const next = rows.map((r) => ({ ...r }));
    const delIds: string[] = [];

    const buildAgg = () => {
      const m = new Map<string, { qty: number; rowIdxs: number[] }>();
      next.forEach((r, idx) => {
        const k = specKey(r.description, r.dn, r.pn, r.sn);
        if (!k) return;
        const e = m.get(k) || { qty: 0, rowIdxs: [] };
        e.qty += Number(r.ordered_qty) || 0;
        e.rowIdxs.push(idx);
        m.set(k, e);
      });
      return m;
    };

    // 1. metadata completion — same product + DN, PO row missing PN/SN.
    let agg = buildAgg();
    quoteAgg.forEach((qQty, k) => {
      if (agg.has(k)) return;
      const [qsig, d, p, s] = k.split('|');
      const candidates = Array.from(agg.keys()).filter((pk) => {
        if (quoteAgg.has(pk)) return false;
        const [psig, pd, pp, ps] = pk.split('|');
        if (psig !== qsig || pd !== d) return false;
        if (pp !== '' && pp !== p) return false;
        if (ps !== '' && ps !== s) return false;
        return pp === '' || ps === '';
      });
      const exactQty = candidates.filter((pk) => Math.abs(agg.get(pk)!.qty - qQty) <= 0.001);
      const chosen = exactQty.length === 1 ? exactQty[0] : (candidates.length === 1 ? candidates[0] : null);
      if (!chosen) return;
      const fixedRows = agg.get(chosen)!.rowIdxs;
      fixedRows.forEach((idx) => {
        if (!String(next[idx].pn || '').trim() && p) next[idx].pn = p;
        if (!String(next[idx].sn || '').trim() && s) next[idx].sn = s;
      });
      report.push(`שורות ${fixedRows.map((i) => i + 1).join(', ')}: הושלמו PN/SN חסרים (${specLabel(k)}) — עכשיו תואמות להצעה.`);
      agg = buildAgg();
    });

    // 2. quantity alignment
    agg = buildAgg();
    quoteAgg.forEach((qQty, k) => {
      const e = agg.get(k);
      if (!e || Math.abs(e.qty - qQty) <= 0.001) return;
      if (e.rowIdxs.length === 1) {
        report.push(`שורה ${e.rowIdxs[0] + 1}: כמות ${specLabel(k)} עודכנה מ-${(Number(next[e.rowIdxs[0]].ordered_qty) || 0).toLocaleString()} ל-${qQty.toLocaleString()} לפי ההצעה.`);
        next[e.rowIdxs[0]].ordered_qty = qQty;
      } else {
        report.push(`⚠ שורות ${e.rowIdxs.map((i) => i + 1).join(', ')} (${specLabel(k)}): כמה שורות לאותו מפרט — עדכן כמות ידנית (בהצעה ${qQty.toLocaleString()}).`);
      }
    });

    // 3. still-missing specs → new rows
    agg = buildAgg();
    quoteAgg.forEach((qQty, k) => {
      if (agg.has(k)) return;
      const [, d, p, s] = k.split('|');
      const qi = (quoteItems || []).find((x: any) => specKey(x.product_name, x.dn_size, x.pn, x.sn) === k);
      next.push({
        id: null, description: qi?.product_name || `DN${d}`, dn: d, pn: p, sn: s,
        unit: qi?.unit || 'מטר', ordered_qty: qQty, unit_price: 0, sort_order: next.length,
      });
      report.push(`⚠ שורה ${next.length} (חדשה): נוסף מפרט ${specLabel(k)} בכמות ${qQty.toLocaleString()} — יש להזין מחיר ספק.`);
    });

    // 4. remove PO rows whose spec isn't in the signed quote (customer dropped them)
    for (let idx = next.length - 1; idx >= 0; idx--) {
      const r = next[idx];
      const k = specKey(r.description, r.dn, r.pn, r.sn);
      if (k && !quoteAgg.has(k)) {
        if (r.id) delIds.push(r.id);
        next.splice(idx, 1);
        report.push(`שורה ${idx + 1}: הוסרה (${specLabel(k)}, כמות ${(Number(r.ordered_qty) || 0).toLocaleString()}) — לא קיימת בהצעה החתומה.`);
      }
    }

    if (report.length === 0) { alert('אין מה לתקן — ההזמנה כבר תואמת להצעה החתומה.'); return; }
    setRows(next);
    if (delIds.length) setDeletedRowIds((prev) => [...prev, ...delIds]);
    alert(`בוצע תיקון (בדוק את השורות ולחץ שמור):\n\n${report.join('\n')}`);
  }

  async function deletePO() {
    if (!confirm(`למחוק את הזמנת רכש ${po.po_number || ''}? פעולה זו אינה הפיכה.`)) return;
    await supabase.from('import_order_items').delete().eq('import_order_id', po.id);
    const { error } = await supabase.from('import_orders').delete().eq('id', po.id);
    if (error) { alert(`המחיקה נכשלה: ${error.message}`); return; }
    await onUpdate();
  }

  const inp = 'w-full border border-line-subtle rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary';
  const cellInp = 'w-full border border-transparent hover:border-line-subtle focus:border-primary rounded px-1 py-0.5 text-[12px] focus:outline-none bg-transparent';

  return (
    <div className="bg-white rounded-xl border border-line-subtle overflow-hidden">
      {/* Card header */}
      <button onClick={onToggle} className="w-full flex items-center justify-between px-4 py-3 hover:bg-neutral-50 text-right">
        <span className="flex items-center gap-3 flex-wrap">
          <span className="font-mono font-bold text-content-strong" dir="ltr">{po.po_number || 'ללא מספר'}</span>
          <span className="text-[12px] px-2 py-0.5 rounded-full font-semibold bg-warning-soft text-warning">בהכנה</span>
          {po.origin === 'auto_from_quote' && <span className="text-[11px] text-neutral-400">נוצרה אוטומטית מחתימה</span>}
          <span className="text-sm text-content-body">{supplier?.name || 'ללא ספק'}</span>
          <span className="text-sm text-content-muted">{po.project_name || projNameById[po.project_id] || ''}</span>
          {po.quote_id && msByQuote[po.quote_id] && <span className="text-[11px] font-mono text-content-muted" dir="ltr">מ"ס {msByQuote[po.quote_id]}</span>}
        </span>
        <span className="flex items-center gap-3">
          <span className="text-sm font-semibold text-content-strong" dir="ltr">{money(total || po.total_amount, currency)}</span>
          <Icon name={expanded ? 'caretUp' : 'caretDown'} size={14} />
        </span>
      </button>

      {expanded && form && (
        <div className="border-t border-line-subtle p-4">
          {/* Order fields */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <div>
              <label className="block text-[11px] text-neutral-400 mb-1">ספק</label>
              <SearchableSelect
                value={form.supplier_id}
                onChange={(v) => setForm({ ...form, supplier_id: v })}
                className={inp}
                placeholder="בחר ספק"
                options={suppliers.map((s: any) => ({ value: s.id, label: s.name }))}
                disabled={!canEdit}
              />
            </div>
            <div>
              <label className="block text-[11px] text-neutral-400 mb-1">מטבע</label>
              <SearchableSelect
                value={form.currency}
                onChange={(v) => setForm({ ...form, currency: v })}
                className={inp}
                options={CURRENCIES.map((c) => ({ value: c, label: c }))}
                disabled={!canEdit}
              />
            </div>
            <div>
              <label className="block text-[11px] text-neutral-400 mb-1">תאריך הזמנה</label>
              <input type="date" value={form.order_date} onChange={(e) => setForm({ ...form, order_date: e.target.value })} className={inp} disabled={!canEdit} />
            </div>
            <div>
              <label className="block text-[11px] text-neutral-400 mb-1">תנאי סחר (Incoterms)</label>
              <input value={form.incoterms} onChange={(e) => setForm({ ...form, incoterms: e.target.value })} className={inp} dir="ltr" placeholder="CIF Ashdod" disabled={!canEdit} />
            </div>
            <div className="col-span-2">
              <label className="block text-[11px] text-neutral-400 mb-1">תנאי תשלום</label>
              <input value={form.payment_terms} onChange={(e) => setForm({ ...form, payment_terms: e.target.value })} className={inp} disabled={!canEdit} />
            </div>
            <div>
              <label className="block text-[11px] text-neutral-400 mb-1">מועד אספקה</label>
              <input type="date" value={form.delivery_date} onChange={(e) => setForm({ ...form, delivery_date: e.target.value })} className={inp} disabled={!canEdit} />
            </div>
            <div>
              <label className="block text-[11px] text-neutral-400 mb-1">שם הפרויקט (יופיע ב-PDF)</label>
              <input value={form.project_name} onChange={(e) => setForm({ ...form, project_name: e.target.value })} className={inp} disabled={!canEdit} />
            </div>
            <div className="col-span-2 md:col-span-4">
              <label className="block text-[11px] text-neutral-400 mb-1">הערות (יופיעו ב-PDF)</label>
              <textarea rows={5} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className={`${inp} min-h-[110px] leading-relaxed`} disabled={!canEdit} />
            </div>
          </div>

          {/* Cross-check against the customer-approved quote */}
          {hasAnomaly && comparison && (
            <div className="mb-4 bg-warning-soft border border-warning rounded-xl p-4">
              <p className="text-sm font-bold text-warning mb-2">
                <Icon name="warning" size={16} /> אנומליה מול ההצעה שהלקוח אישר{quoteNumber ? <> (<span dir="ltr">{quoteNumber}</span>)</> : ''}
              </p>
              <div className="space-y-1 text-[13px] text-content-body">
                {comparison.mismatches.map((m) => (
                  <p key={m.k}>
                    <span className="font-semibold" dir="ltr">{specLabel(m.k)}</span> — בהצעה המאושרת: <span className="font-semibold">{m.quoteQty.toLocaleString()}</span> · בהזמנת הרכש: <span className="font-semibold">{m.poQty.toLocaleString()}</span>
                  </p>
                ))}
                {comparison.missing.map((m) => (
                  <p key={m.k}>
                    <span className="font-semibold" dir="ltr">{specLabel(m.k)}</span> — קיים בהצעה המאושרת ({m.quoteQty.toLocaleString()}) אך <span className="font-semibold">חסר</span> בהזמנת הרכש
                  </p>
                ))}
                {comparison.extras.map((m) => (
                  <p key={m.k}>
                    <span className="font-semibold" dir="ltr">{specLabel(m.k)}</span> — בהזמנת הרכש ({m.poQty.toLocaleString()}) אך <span className="font-semibold">לא קיים בהצעה החתומה</span> — יוסר בתיקון
                  </p>
                ))}
              </div>
              {canEdit && (
                <button onClick={autoFixAnomalies} className="mt-3 text-[13px] font-semibold bg-white text-warning border border-warning px-3 py-1.5 rounded-lg hover:bg-warning-soft">
                  <Icon name="wrench" size={14} /> תקן אנומליה אוטומטית
                </button>
              )}
            </div>
          )}
          {comparison && !hasAnomaly && (
            <p className="mb-3 text-[12px] text-success font-medium">
              <Icon name="success" size={14} /> הקטרים, הלחצים והכמויות תואמים להצעה המאושרת{quoteNumber ? <> (<span dir="ltr">{quoteNumber}</span>)</> : ''}
            </p>
          )}

          {/* Items */}
          <div className="overflow-x-auto mb-3">
            <table className="w-full text-[12px] border-collapse">
              <thead>
                <tr className="bg-neutral-50 text-neutral-400 text-[11px] text-right">
                  <th className="font-medium py-1.5 px-2 w-8">#</th>
                  <th className="font-medium py-1.5 px-2 min-w-[220px]">תיאור</th>
                  <th className="font-medium py-1.5 px-2 w-16">DN</th>
                  <th className="font-medium py-1.5 px-2 w-14">PN</th>
                  <th className="font-medium py-1.5 px-2 w-16">SN</th>
                  <th className="font-medium py-1.5 px-2 w-14">יח׳</th>
                  <th className="font-medium py-1.5 px-2 w-20">כמות</th>
                  <th className="font-medium py-1.5 px-2 w-24">מחיר יח׳</th>
                  <th className="font-medium py-1.5 px-2 w-24">סה״כ</th>
                  {canEdit && <th className="w-8"></th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, idx) => (
                  <tr key={r.id || `new-${idx}`} className="border-t border-line-subtle">
                    <td className="py-1 px-2 text-neutral-400">{idx + 1}</td>
                    <td className="py-1 px-2"><input value={r.description || ''} onChange={(e) => setRow(idx, 'description', e.target.value)} className={cellInp} dir="ltr" disabled={!canEdit} /></td>
                    <td className="py-1 px-2"><input value={r.dn || ''} onChange={(e) => setRow(idx, 'dn', e.target.value)} className={cellInp} dir="ltr" disabled={!canEdit} /></td>
                    <td className="py-1 px-2"><input value={r.pn || ''} onChange={(e) => setRow(idx, 'pn', e.target.value)} className={cellInp} dir="ltr" disabled={!canEdit} /></td>
                    <td className="py-1 px-2"><input value={r.sn || ''} onChange={(e) => setRow(idx, 'sn', e.target.value)} className={cellInp} dir="ltr" disabled={!canEdit} /></td>
                    <td className="py-1 px-2"><input value={r.unit || ''} onChange={(e) => setRow(idx, 'unit', e.target.value)} className={cellInp} disabled={!canEdit} /></td>
                    <td className="py-1 px-2"><input type="number" value={r.ordered_qty ?? ''} onChange={(e) => setRow(idx, 'ordered_qty', e.target.value)} className={cellInp} dir="ltr" disabled={!canEdit} /></td>
                    <td className="py-1 px-2"><input type="number" step="0.01" value={r.unit_price ?? ''} onChange={(e) => setRow(idx, 'unit_price', e.target.value)} className={cellInp} dir="ltr" disabled={!canEdit} /></td>
                    <td className="py-1 px-2 font-semibold text-content-strong whitespace-nowrap" dir="ltr">{money((Number(r.unit_price) || 0) * (Number(r.ordered_qty) || 0), currency)}</td>
                    {canEdit && (
                      <td className="py-1 px-1 text-center">
                        <button onClick={() => removeRow(idx)} className="text-danger hover:opacity-70" title="מחק שורה"><Icon name="close" size={14} /></button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-line-subtle bg-neutral-50">
                  <td colSpan={8} className="py-2 px-2 text-sm font-bold text-content-body">סה״כ להזמנה</td>
                  <td className="py-2 px-2 text-sm font-bold text-content-strong whitespace-nowrap" dir="ltr">{money(total, currency)}</td>
                  {canEdit && <td></td>}
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap items-center gap-2">
            {canEdit && (
              <>
                <button onClick={addRow} className="text-[13px] text-primary hover:underline"><Icon name="add" size={14} /> הוסף שורה</button>
                <button onClick={openTranslate} className="text-[13px] text-primary hover:underline" title="תרגום הערות ותיאורים לאנגלית (AI) — לעריכה לפני החלה">
                  <Icon name="ai" size={14} /> תרגם לאנגלית
                </button>
                {quoteAgg && (
                  <button onClick={pullQuantitiesFromQuote} className="text-[13px] text-primary hover:underline" title="עדכון כמויות השורות לפי ההצעה שהלקוח אישר (התאמה לפי DN/PN/SN)">
                    <Icon name="download" size={14} /> משוך כמויות מההצעה
                  </button>
                )}
                <span className="flex-1" />
                <button onClick={save} disabled={saving} className="text-[13px] font-semibold bg-neutral-100 text-content-body px-4 py-2 rounded-lg hover:bg-neutral-200 disabled:opacity-50">
                  {saving ? 'שומר…' : <><Icon name="save" size={14} /> שמור</>}
                </button>
                <button
                  onClick={async () => { const ok = await save(); if (ok) setShowPdf(true); }}
                  disabled={saving}
                  className="text-[13px] font-semibold bg-primary-50 text-primary px-4 py-2 rounded-lg hover:bg-primary-100 disabled:opacity-50"
                >
                  <Icon name="pdf" size={14} /> תצוגת PDF
                </button>
                <button onClick={sendToSupplier} disabled={sending || saving} className="text-[13px] font-semibold bg-primary text-white px-4 py-2 rounded-lg hover:bg-primary-700 disabled:opacity-50">
                  {sending ? 'מעביר…' : <><Icon name="send" size={14} /> הועבר לספק</>}
                </button>
              </>
            )}
            {!canEdit && (
              <button onClick={() => setShowPdf(true)} className="text-[13px] font-semibold bg-primary-50 text-primary px-4 py-2 rounded-lg hover:bg-primary-100">
                <Icon name="pdf" size={14} /> תצוגת PDF
              </button>
            )}
            {canDelete && (
              <button onClick={deletePO} className="text-[13px] text-danger hover:underline"><Icon name="delete" size={14} /> מחק</button>
            )}
          </div>
        </div>
      )}

      {translateFields && (
        <TranslateModal fields={translateFields} onApply={applyTranslations} onClose={() => setTranslateFields(null)} />
      )}

      {/* PDF preview modal */}
      {showPdf && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center overflow-y-auto p-4" onClick={() => setShowPdf(false)}>
          <div className="bg-neutral-100 rounded-xl max-w-[850px] w-full my-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 bg-white rounded-t-xl border-b border-line-subtle sticky top-0 z-10">
              <p className="font-bold text-content-strong">הזמנת רכש <span dir="ltr">{po.po_number || ''}</span></p>
              <div className="flex items-center gap-2">
                <button onClick={() => pdfRef.current?.downloadPdf()} className="text-[13px] font-semibold bg-primary text-white px-4 py-2 rounded-lg hover:bg-primary-700">
                  <Icon name="download" size={14} /> הורד PDF
                </button>
                <button onClick={() => setShowPdf(false)} className="text-content-muted hover:text-content-strong px-2"><Icon name="close" size={18} /></button>
              </div>
            </div>
            <div className="p-4">
              <PODocument
                ref={pdfRef}
                order={{ ...po, ...(form || {}) }}
                items={form ? rows : items}
                supplier={supplier}
                projectName={(form?.project_name ?? po.project_name) || projNameById[po.project_id] || null}
                msNumber={po.quote_id ? msByQuote[po.quote_id] || null : null}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
