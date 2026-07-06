'use client';

/**
 * תמחור אביזרים — Hillel's factory pricing screen.
 * Upload a fitting drawing → Roxy (Gemini Pro) extracts the geometry → the
 * deterministic estimator builds cost lines from live factory rates → Hillel
 * edits and approves → the approved estimate feeds a quote line (cost basis +
 * 🏭 local-manufacturing flag) and becomes a calibration example for the next
 * similar fitting.
 */
import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { usePermissions } from '@/lib/auth/permissions-context';
import Icon from '@/components/ui/Icon';
import {
  buildEstimate, type FittingAnalysis, type CostLine, type FactorySettings, type SimilarEstimate,
} from '@/lib/fitting-estimator';

const FITTING_TYPES: Record<string, string> = {
  manhole_coupling: 'מחבר שוחה',
  elbow: 'ברך',
  tee: 'הסתעפות (T)',
  reducer: 'מעבר (רדוסר)',
  flange: 'אוגן',
  nozzle: 'נחיר/חדירה',
  liner: 'חבישה/חיוץ',
  other: 'אחר',
};

const fmtILS = (v: number) => new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(v || 0);

export default function FittingEstimatesPage() {
  const supabase = createClient();
  const { canAccess } = usePermissions();
  const canEdit = canAccess('production', 'edit') || canAccess('projects', 'edit');

  const [estimates, setEstimates] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [settingsRows, setSettingsRows] = useState<any[]>([]);
  const [materials, setMaterials] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  const settings: FactorySettings = useMemo(() => {
    const get = (k: string, d: number) => Number(settingsRows.find((r) => r.key === k)?.value ?? d);
    return {
      labor_rate_hourly: get('labor_rate_hourly', 225),
      labor_cost_per_kg: get('labor_cost_per_kg', 40),
      laminate_cost_per_kg: get('laminate_cost_per_kg', 39),
      overhead_pct: get('overhead_pct', 10),
      default_markup_pct: get('default_markup_pct', 100),
    };
  }, [settingsRows]);

  async function load() {
    setLoading(true);
    const [{ data: est }, { data: projs }, { data: sett }, { data: mats }] = await Promise.all([
      supabase.from('fitting_estimates').select('*').order('created_at', { ascending: false }),
      supabase.from('projects').select('id, name').order('name'),
      supabase.from('factory_settings').select('*'),
      supabase.from('factory_materials').select('*').eq('active', true).order('category'),
    ]);
    setEstimates(est || []);
    setProjects(projs || []);
    setSettingsRows(sett || []);
    setMaterials(mats || []);
    setLoading(false);
  }
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const projName = (id: string | null) => projects.find((p) => p.id === id)?.name || '—';

  return (
    <div className="p-6 max-w-5xl mx-auto" dir="rtl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-content-strong"><Icon name="production" size={24} /> תמחור אביזרים</h1>
          <p className="text-sm text-content-muted mt-1">שרטוט ← ניתוח רקסי ← אומדן עלות מפעל ← אישור ← שורת הצעה</p>
        </div>
        <div className="flex items-center gap-2">
          <a href="/production" className="text-sm text-content-muted hover:text-content-body px-3 py-2">← ייצור</a>
          {canEdit && (
            <>
              <button onClick={() => setShowSettings(true)} className="text-sm bg-neutral-100 text-content-body px-3 py-2 rounded-lg hover:bg-neutral-200">
                <Icon name="gear" size={16} /> תעריפים
              </button>
              <button onClick={() => setShowNew(true)} className="text-sm bg-primary text-white px-4 py-2 rounded-lg hover:bg-primary-700 font-semibold">
                <Icon name="add" size={16} /> אומדן חדש
              </button>
            </>
          )}
        </div>
      </div>

      {loading ? (
        <p className="text-neutral-400 text-center py-12">טוען…</p>
      ) : estimates.length === 0 ? (
        <div className="bg-white rounded-xl border border-line-subtle p-12 text-center">
          <p className="mb-3 text-neutral-300"><Icon name="drawings" size={40} /></p>
          <p className="text-content-muted">אין אומדנים עדיין. העלה שרטוט אביזר כדי להתחיל.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {estimates.map((e) => (
            <EstimateCard
              key={e.id} estimate={e} open={openId === e.id}
              onToggle={() => setOpenId(openId === e.id ? null : e.id)}
              projName={projName(e.project_id)} canEdit={canEdit}
              settings={settings} materials={materials} supabase={supabase} onUpdate={load}
            />
          ))}
        </div>
      )}

      {showNew && (
        <NewEstimateModal
          projects={projects} settings={settings} supabase={supabase} estimates={estimates}
          onClose={() => setShowNew(false)} onCreated={() => { setShowNew(false); load(); }}
        />
      )}
      {showSettings && (
        <SettingsModal settingsRows={settingsRows} materials={materials} supabase={supabase}
          onClose={() => setShowSettings(false)} onSaved={() => { setShowSettings(false); load(); }} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
function EstimateCard({ estimate: e, open, onToggle, projName, canEdit, settings, materials, supabase, onUpdate }: any) {
  const [lines, setLines] = useState<CostLine[]>(e.lines || []);
  const [markup, setMarkup] = useState<number>(e.markup_pct ?? settings.default_markup_pct);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setLines(e.lines || []); setMarkup(e.markup_pct ?? settings.default_markup_pct); }, [e.id, e.lines, e.markup_pct, settings.default_markup_pct]);

  const qty = Number(e.quantity) || 1;
  const unitCost = lines.reduce((s, l) => s + (Number(l.total) || 0), 0);
  const totalCost = Math.round(unitCost * qty);
  const price = Math.round(totalCost * (1 + markup / 100));

  function setLine(i: number, patch: Partial<CostLine>) {
    setLines((prev) => prev.map((l, j) => {
      if (j !== i) return l;
      const nl = { ...l, ...patch };
      nl.total = Math.round((Number(nl.qty) || 0) * (Number(nl.unit_price) || 0)) || Number(nl.total) || 0;
      return nl;
    }));
  }

  async function save(extra: Record<string, any> = {}) {
    setBusy(true);
    try {
      const { error } = await supabase.from('fitting_estimates').update({
        lines, total_cost: totalCost, markup_pct: markup, final_price: price,
        updated_at: new Date().toISOString(), ...extra,
      }).eq('id', e.id);
      if (error) { alert(`שגיאה: ${error.message}`); return; }
      onUpdate();
    } finally { setBusy(false); }
  }

  async function approve() {
    const { data: { user } } = await supabase.auth.getUser();
    await save({ status: 'approved', approved_by: user?.id || null, approved_at: new Date().toISOString() });
  }

  async function pushToQuote() {
    // Target: a draft quote on the estimate's project.
    const { data: quotes } = await supabase.from('quotes')
      .select('id, quote_number, status').eq('project_id', e.project_id).eq('status', 'draft')
      .order('created_at', { ascending: false });
    if (!quotes?.length) { alert('אין הצעת מחיר בטיוטה בפרויקט הזה. צור טיוטה קודם.'); return; }
    const target = quotes.length === 1 ? quotes[0]
      : quotes.find((q: any) => q.quote_number === prompt(`לאיזו הצעה? (${quotes.map((q: any) => q.quote_number).join(' / ')})`, quotes[0].quote_number));
    if (!target) return;

    const { count } = await supabase.from('quote_items').select('id', { count: 'exact', head: true }).eq('quote_id', target.id);
    const unitSell = Math.round(price / qty);
    const { data: item, error } = await supabase.from('quote_items').insert({
      quote_id: target.id, product_name: e.name || FITTING_TYPES[e.fitting_type] || 'אביזר מפעל',
      dn_size: e.dn ? `DN${e.dn}` : null, quantity: qty, unit: "יח'",
      cost_price: Math.round(unitCost), overheads_pct: 0, profit_pct: markup, discount_pct: 0,
      unit_price: unitSell, total_price: price, notes: 'תמחור מפעל — ' + (e.name || ''),
      pn: e.pn || null, sn: null, length_m: null, sort_order: count || 0,
      requires_production: true,
      production_input: (e.ai_analysis?.description || e.name || 'ייצור מפעל'),
      production_notes: `אומדן מפעל ${fmtILS(totalCost)} · ראה תמחור אביזרים`,
    }).select('id').single();
    if (error) { alert(`שגיאה: ${error.message}`); return; }

    // Refresh quote totals.
    const { data: allItems } = await supabase.from('quote_items').select('total_price, cost_price, quantity').eq('quote_id', target.id);
    const totalAmount = (allItems || []).reduce((s: number, i: any) => s + (Number(i.total_price) || 0), 0);
    const totalQCost = (allItems || []).reduce((s: number, i: any) => s + (Number(i.cost_price) || 0) * (Number(i.quantity) || 0), 0);
    await supabase.from('quotes').update({ total_amount: totalAmount, total_cost: totalQCost, updated_at: new Date().toISOString() }).eq('id', target.id);
    await supabase.from('fitting_estimates').update({ quote_id: target.id, quote_item_id: item?.id || null }).eq('id', e.id);
    alert(`נוסף להצעה ${target.quote_number}: ${e.name} — ${fmtILS(price)} (עלות ${fmtILS(totalCost)})`);
    onUpdate();
  }

  async function openDrawing() {
    if (!e.drawing_path) return;
    const w = window.open('about:blank', '_blank');
    const { data: s } = await supabase.storage.from('project-files').createSignedUrl(e.drawing_path, 300);
    if (s?.signedUrl) { if (w) w.location.href = s.signedUrl; else window.location.href = s.signedUrl; }
    else w?.close();
  }

  return (
    <div className="bg-white rounded-xl border border-line-subtle overflow-hidden">
      <div className="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-neutral-50" onClick={onToggle}>
        <div className="flex items-center gap-3 min-w-0">
          <span className="font-bold text-content-strong truncate">{e.name || FITTING_TYPES[e.fitting_type]}</span>
          <span className="text-[12px] text-content-muted whitespace-nowrap">{FITTING_TYPES[e.fitting_type] || e.fitting_type}{e.dn ? ` · DN${e.dn}` : ''} · ×{qty}</span>
          <span className="text-[12px] text-primary truncate">{projName}</span>
        </div>
        <div className="flex items-center gap-2 whitespace-nowrap">
          <span className="text-sm font-bold text-content-body">{fmtILS(e.final_price || price)}</span>
          {e.status === 'approved'
            ? <span className="text-[11px] px-2 py-0.5 rounded-full bg-success-soft text-success font-semibold"><Icon name="confirm" size={11} /> מאושר</span>
            : <span className="text-[11px] px-2 py-0.5 rounded-full bg-warning-soft text-warning font-semibold">טיוטה</span>}
          {e.quote_id && <span className="text-[11px] px-2 py-0.5 rounded-full bg-azure-100 text-azure-600 font-semibold">בהצעה</span>}
          <Icon name={open ? 'caretUp' : 'caretDown'} size={14} />
        </div>
      </div>

      {open && (
        <div className="border-t border-line-subtle p-4 space-y-3 bg-neutral-50">
          <div className="flex flex-wrap items-center gap-3 text-[12px]">
            {e.drawing_path && <button onClick={openDrawing} className="text-primary hover:underline"><Icon name="drawings" size={14} /> פתח שרטוט</button>}
            {e.ai_analysis && (
              <span className="text-content-muted">
                רקסי זיהתה: {e.ai_analysis.description || FITTING_TYPES[e.ai_analysis.fitting_type] || ''}
                {e.ai_analysis.confidence && ` · ודאות ${e.ai_analysis.confidence === 'high' ? 'גבוהה' : e.ai_analysis.confidence === 'medium' ? 'בינונית' : 'נמוכה'}`}
              </span>
            )}
          </div>
          {Array.isArray(e.ai_estimate?.assumptions) && (
            <div className="text-[11px] text-neutral-400 space-y-0.5">
              {e.ai_estimate.assumptions.map((a: string, i: number) => <div key={i}>· {a}</div>)}
            </div>
          )}

          {/* Cost lines */}
          <div className="bg-white rounded-lg border border-line-subtle p-2">
            <div className="grid grid-cols-[1fr_70px_55px_80px_85px_24px] gap-1 text-[11px] font-semibold text-content-muted px-1 mb-1">
              <span>תיאור</span><span>כמות</span><span>יח'</span><span>מחיר יח' ₪</span><span>סה"כ ₪</span><span></span>
            </div>
            {lines.map((l, i) => (
              <div key={i} className="grid grid-cols-[1fr_70px_55px_80px_85px_24px] gap-1 mb-1">
                <input disabled={!canEdit || e.status === 'approved'} value={l.desc} onChange={(ev) => setLine(i, { desc: ev.target.value })} className="border border-line-subtle rounded px-1.5 py-1 text-[12px] min-w-0" />
                <input disabled={!canEdit || e.status === 'approved'} type="number" value={l.qty} onChange={(ev) => setLine(i, { qty: parseFloat(ev.target.value) || 0 })} className="border border-line-subtle rounded px-1 py-1 text-[12px] min-w-0" dir="ltr" />
                <input disabled={!canEdit || e.status === 'approved'} value={l.unit} onChange={(ev) => setLine(i, { unit: ev.target.value })} className="border border-line-subtle rounded px-1 py-1 text-[12px] min-w-0" />
                <input disabled={!canEdit || e.status === 'approved'} type="number" value={l.unit_price} onChange={(ev) => setLine(i, { unit_price: parseFloat(ev.target.value) || 0 })} className="border border-line-subtle rounded px-1 py-1 text-[12px] min-w-0" dir="ltr" />
                <span className="flex items-center text-[12px] font-medium px-1">{fmtILS(l.total)}</span>
                {canEdit && e.status !== 'approved'
                  ? <button onClick={() => setLines((prev) => prev.filter((_, j) => j !== i))} className="text-danger text-lg">×</button>
                  : <span />}
              </div>
            ))}
            {canEdit && e.status !== 'approved' && (
              <div className="flex flex-wrap gap-2 mt-1">
                <button onClick={() => setLines((p) => [...p, { kind: 'material', desc: '', qty: 1, unit: 'ק"ג', unit_price: 0, total: 0 }])} className="text-[11px] text-primary hover:underline">+ חומר</button>
                <button onClick={() => setLines((p) => [...p, { kind: 'labor', desc: 'שעות עבודה', qty: 1, unit: 'שעה', unit_price: settings.labor_rate_hourly, total: settings.labor_rate_hourly }])} className="text-[11px] text-primary hover:underline">+ שעות עבודה</button>
                <button onClick={() => setLines((p) => [...p, { kind: 'purchased', desc: 'פריט נרכש (חומר גלם)', qty: 1, unit: "יח'", unit_price: 0, total: 0 }])} className="text-[11px] text-primary hover:underline">+ פריט נרכש</button>
                {materials.length > 0 && (
                  <select className="text-[11px] border border-line-subtle rounded px-1" value="" onChange={(ev) => {
                    const m = materials.find((x: any) => x.id === ev.target.value);
                    if (m) setLines((p) => [...p, { kind: 'material', desc: m.name, qty: 1, unit: m.unit, unit_price: Math.round(m.price * (m.currency === 'EUR' ? 3.9 : m.currency === 'USD' ? 3.6 : 1) * 100) / 100, total: 0 }]);
                  }}>
                    <option value="">+ ממחירון…</option>
                    {materials.map((m: any) => <option key={m.id} value={m.id}>{m.name} ({m.price} {m.currency})</option>)}
                  </select>
                )}
              </div>
            )}
          </div>

          {/* Totals */}
          <div className="flex flex-wrap items-center gap-4 text-[13px]">
            <span>עלות ליחידה: <b>{fmtILS(unitCost)}</b></span>
            <span>× {qty} = עלות כוללת: <b>{fmtILS(totalCost)}</b></span>
            <span className="inline-flex items-center gap-1">מרווח:
              <input disabled={!canEdit || e.status === 'approved'} type="number" value={markup} onChange={(ev) => setMarkup(parseFloat(ev.target.value) || 0)} className="w-16 border border-line-subtle rounded px-1 py-0.5 text-center" dir="ltr" />%
            </span>
            <span className="font-bold text-primary text-base">מחיר: {fmtILS(price)}</span>
          </div>

          {canEdit && (
            <div className="flex flex-wrap gap-2 pt-1">
              {e.status !== 'approved' && (
                <>
                  <button disabled={busy} onClick={() => save()} className="text-[13px] bg-neutral-100 text-content-body px-4 py-1.5 rounded-lg hover:bg-neutral-200 disabled:opacity-50">שמור טיוטה</button>
                  <button disabled={busy} onClick={approve} className="text-[13px] bg-success text-white px-4 py-1.5 rounded-lg hover:opacity-90 disabled:opacity-50 font-semibold"><Icon name="confirm" size={14} /> אשר תמחור</button>
                </>
              )}
              {e.status === 'approved' && !e.quote_id && (
                <button disabled={busy} onClick={pushToQuote} className="text-[13px] bg-primary text-white px-4 py-1.5 rounded-lg hover:bg-primary-700 disabled:opacity-50 font-semibold"><Icon name="send" size={14} /> העבר להצעת מחיר</button>
              )}
              {e.status === 'approved' && (
                <button disabled={busy} onClick={() => save({ status: 'draft', approved_by: null, approved_at: null })} className="text-[13px] text-content-muted px-3 py-1.5 hover:text-content-body">פתח לעריכה מחדש</button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
function NewEstimateModal({ projects, settings, supabase, estimates, onClose, onCreated }: any) {
  const [projectId, setProjectId] = useState('');
  const [name, setName] = useState('');
  const [qty, setQty] = useState('1');
  const [file, setFile] = useState<File | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<FittingAnalysis | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function analyze(f: File) {
    setAnalyzing(true); setError('');
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result).split(',')[1] || '');
        r.onerror = reject;
        r.readAsDataURL(f);
      });
      const res = await fetch('/api/ai', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'fitting_analysis', files: [{ base64, mimeType: f.type, name: f.name }] }),
      });
      const j = await res.json();
      if (!res.ok || j.error) { setError(j.error || 'שגיאה בניתוח'); return; }
      setAnalysis(j.analysis);
      if (!name && j.analysis?.description) setName(j.analysis.description);
    } catch {
      setError('שגיאת תקשורת בניתוח השרטוט');
    } finally { setAnalyzing(false); }
  }

  async function create() {
    if (!projectId || !analysis) return;
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      // Learning loop: similar approved estimates calibrate this one.
      const similar: SimilarEstimate[] = (estimates || [])
        .filter((x: any) => x.status === 'approved' && x.fitting_type === analysis.fitting_type
          && x.ai_estimate?.unitCost && x.total_cost && x.quantity
          && (!analysis.dn_mm || !x.dn || Math.abs(x.dn - analysis.dn_mm) / analysis.dn_mm <= 0.35))
        .map((x: any) => ({
          fitting_type: x.fitting_type, dn: x.dn,
          ai_unit_cost: Number(x.ai_estimate.unitCost) || null,
          final_unit_cost: (Number(x.total_cost) || 0) / (Number(x.quantity) || 1),
        }));
      const est = buildEstimate(analysis, parseFloat(qty) || 1, settings, similar);

      // Store the drawing (private bucket).
      let drawingPath: string | null = null;
      if (file) {
        const path = `fittings/${Date.now()}_${file.name}`;
        const { error: upErr } = await supabase.storage.from('project-files').upload(path, file);
        if (!upErr) drawingPath = path;
      }

      const { error } = await supabase.from('fitting_estimates').insert({
        project_id: projectId,
        name: name.trim() || analysis.description || FITTING_TYPES[analysis.fitting_type] || 'אביזר',
        fitting_type: analysis.fitting_type || 'other',
        dn: analysis.dn_mm || null,
        pn: analysis.pn_bar || null,
        quantity: parseFloat(qty) || 1,
        drawing_path: drawingPath,
        ai_analysis: analysis,
        ai_estimate: { unitCost: est.unitCost, calibrationFactor: est.calibrationFactor, assumptions: est.assumptions },
        lines: est.lines,
        total_cost: est.totalCost,
        markup_pct: settings.default_markup_pct,
        final_price: est.suggestedPrice,
        created_by: user?.id || null,
      });
      if (error) { alert(`שגיאה: ${error.message}`); return; }
      onCreated();
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-[92vw] max-w-[480px] max-h-[88vh] overflow-y-auto" onClick={(e) => e.stopPropagation()} dir="rtl">
        <div className="px-4 py-3 border-b border-line-subtle flex items-center justify-between">
          <h3 className="text-base font-bold text-content-strong">אומדן אביזר חדש</h3>
          <button onClick={onClose} className="text-neutral-400 hover:text-content-body"><Icon name="close" size={18} /></button>
        </div>
        <div className="p-4 space-y-3">
          <div>
            <label className="block text-[12px] font-medium text-content-body mb-1">פרויקט *</label>
            <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="w-full text-[13px] border border-line-subtle rounded-lg px-2 py-1.5">
              <option value="">— בחר פרויקט —</option>
              {projects.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-[12px] font-medium text-content-body mb-1">שרטוט האביזר (PDF/תמונה) *</label>
            <label className="block border-2 border-dashed border-line-strong rounded-lg p-4 text-center cursor-pointer hover:border-azure text-content-muted text-[13px]">
              {file ? <span dir="ltr">{file.name}</span> : <><Icon name="upload" size={18} /> בחר שרטוט — רקסי תנתח אותו</>}
              <input type="file" className="hidden" accept=".pdf,.png,.jpg,.jpeg" onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) { setFile(f); setAnalysis(null); analyze(f); }
                e.target.value = '';
              }} />
            </label>
          </div>

          {analyzing && <p className="text-[13px] text-azure-600 text-center py-2"><Icon name="ai" size={14} /> רקסי קוראת את השרטוט…</p>}
          {error && <p className="text-[13px] text-danger">{error}</p>}
          {analysis && (
            <div className="bg-azure-100 border border-azure rounded-lg p-3 text-[13px] space-y-1">
              <p className="font-semibold text-azure-600"><Icon name="ai" size={14} /> רקסי זיהתה:</p>
              <p>{FITTING_TYPES[analysis.fitting_type] || analysis.fitting_type}
                {analysis.dn_mm ? ` · DN${analysis.dn_mm}` : ''}
                {analysis.secondary_dn_mm ? `/${analysis.secondary_dn_mm}` : ''}
                {analysis.angle_deg ? ` · ${analysis.angle_deg}°` : ''}
                {analysis.pn_bar ? ` · PN${analysis.pn_bar}` : ''}
                {analysis.wall_thickness_mm ? ` · דופן ${analysis.wall_thickness_mm} מ"מ` : ''}
              </p>
              {analysis.notes && <p className="text-content-muted">{analysis.notes}</p>}
              <p className="text-[11px] text-content-muted">ודאות: {analysis.confidence === 'high' ? 'גבוהה' : analysis.confidence === 'medium' ? 'בינונית' : 'נמוכה'} — אפשר לתקן הכל אחרי היצירה</p>
            </div>
          )}

          <div className="grid grid-cols-[1fr_90px] gap-2">
            <div>
              <label className="block text-[12px] font-medium text-content-body mb-1">שם האביזר</label>
              <input value={name} onChange={(e) => setName(e.target.value)} className="w-full text-[13px] border border-line-subtle rounded-lg px-2 py-1.5" placeholder="למשל: מחבר שוחה DN800" />
            </div>
            <div>
              <label className="block text-[12px] font-medium text-content-body mb-1">כמות</label>
              <input type="number" value={qty} onChange={(e) => setQty(e.target.value)} className="w-full text-[13px] border border-line-subtle rounded-lg px-2 py-1.5 text-center" dir="ltr" />
            </div>
          </div>

          <button onClick={create} disabled={!projectId || !analysis || saving} className="w-full bg-primary text-white text-sm font-semibold py-2.5 rounded-lg hover:bg-primary-700 disabled:opacity-40">
            {saving ? 'יוצר…' : 'צור אומדן (ניתן לעריכה)'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
function SettingsModal({ settingsRows, materials, supabase, onClose, onSaved }: any) {
  const [rows, setRows] = useState<any[]>(settingsRows.map((r: any) => ({ ...r })));
  const [mats, setMats] = useState<any[]>(materials.map((m: any) => ({ ...m })));
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      for (const r of rows) {
        await supabase.from('factory_settings').update({ value: Number(r.value) || 0, updated_at: new Date().toISOString() }).eq('key', r.key);
      }
      for (const m of mats) {
        await supabase.from('factory_materials').update({ price: Number(m.price) || 0, updated_at: new Date().toISOString() }).eq('id', m.id);
      }
      onSaved();
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-[92vw] max-w-[520px] max-h-[88vh] overflow-y-auto" onClick={(e) => e.stopPropagation()} dir="rtl">
        <div className="px-4 py-3 border-b border-line-subtle flex items-center justify-between">
          <h3 className="text-base font-bold text-content-strong">תעריפי מפעל ומחירון חומרים</h3>
          <button onClick={onClose} className="text-neutral-400 hover:text-content-body"><Icon name="close" size={18} /></button>
        </div>
        <div className="p-4 space-y-4">
          <div className="space-y-2">
            {rows.map((r, i) => (
              <div key={r.key} className="flex items-center justify-between gap-2 text-[13px]">
                <span className="text-content-body">{r.label || r.key}</span>
                <input type="number" value={r.value} dir="ltr"
                  onChange={(e) => setRows((p) => p.map((x, j) => j === i ? { ...x, value: e.target.value } : x))}
                  className="w-28 border border-line-subtle rounded px-2 py-1 text-center" />
              </div>
            ))}
          </div>
          <div>
            <p className="text-[12px] font-semibold text-content-body mb-1">מחירון חומרים (מהאקסל של הלל)</p>
            <div className="max-h-56 overflow-y-auto space-y-1">
              {mats.map((m, i) => (
                <div key={m.id} className="flex items-center justify-between gap-2 text-[12px]">
                  <span className="text-content-body truncate">{m.name} <span className="text-neutral-400">({m.unit})</span></span>
                  <span className="flex items-center gap-1 whitespace-nowrap">
                    <input type="number" value={m.price} dir="ltr"
                      onChange={(e) => setMats((p) => p.map((x, j) => j === i ? { ...x, price: e.target.value } : x))}
                      className="w-20 border border-line-subtle rounded px-1.5 py-0.5 text-center" />
                    {m.currency}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <button onClick={save} disabled={saving} className="w-full bg-primary text-white text-sm font-semibold py-2 rounded-lg hover:bg-primary-700 disabled:opacity-50">
            {saving ? 'שומר…' : 'שמור תעריפים'}
          </button>
        </div>
      </div>
    </div>
  );
}
