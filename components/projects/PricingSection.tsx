'use client';

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { usePricing } from '@/hooks/usePricing';
import { DISCLAIMER_TYPES } from '@/lib/disclaimers';
import { CURRENCY_SYMBOLS } from '@/lib/exchange-rate';
import { detectBillingAnchor, effectiveAdvancePct, BILLING_ANCHOR_LABELS } from '@/lib/billing';
import { createClient } from '@/lib/supabase/client';
import CustomerForm from '@/components/customers/CustomerForm';
import SearchableSelect from '@/components/ui/SearchableSelect';
import {
  calcCostPerMeter,
  calcRokerCostPerMeter,
  calcItemPrice,
  calcQuoteSummary,
  validateQuoteMargins,
  parsePipeSpec,
  effectiveCurrency,
  type QuoteLineItem,
  type QuoteLineItemPriced,
} from '@/lib/pricing';

function fmtSn(sn: string) {
  if (!sn) return '';
  const n = parseInt(sn, 10);
  return isNaN(n) ? sn : n.toLocaleString('en-US');
}
import ExchangeRateWidget from './ExchangeRateWidget';
import Icon, { type IconName } from '@/components/ui/Icon';

function formatCurrency(v: number) {
  return new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(v);
}
// Line totals keep their agorot (printed unit price × quantity, e.g. 181,112.4).
function formatCurrency2(v: number) {
  return new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(v);
}

function formatDate(d: string | null) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('he-IL');
}

// Row drag-to-reorder for the item editors, built on Pointer Events so it works
// with mouse AND touch (iPad) across browsers — HTML5 drag-and-drop is flaky in
// Safari and doesn't fire on touch at all. Only the grip handle starts a drag;
// the target row is computed from the pointer's Y against each row's rect.
// onReorder(from, to) moves the item in the array (sort_order is re-assigned by
// index on save).
function useRowDnd(onReorder: (from: number, to: number) => void) {
  const dragIdx = useRef<number | null>(null);
  const rows = useRef<Map<number, HTMLElement>>(new Map());
  const [overIdx, setOverIdx] = useState<number | null>(null);

  function rowAtY(clientY: number): number | null {
    let hit: number | null = null;
    let best: number | null = null;
    let bestDist = Infinity;
    for (const [idx, el] of rows.current.entries()) {
      const r = el.getBoundingClientRect();
      if (clientY >= r.top && clientY <= r.bottom) { hit = idx; break; }
      const dist = Math.abs(clientY - (r.top + r.bottom) / 2);
      if (dist < bestDist) { bestDist = dist; best = idx; }
    }
    return hit !== null ? hit : best;
  }

  const handleProps = (idx: number) => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault();
      dragIdx.current = idx;
      setOverIdx(idx);
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    },
    onPointerMove: (e: React.PointerEvent) => {
      if (dragIdx.current === null) return;
      const t = rowAtY(e.clientY);
      if (t !== null && t !== overIdx) setOverIdx(t);
    },
    onPointerUp: (e: React.PointerEvent) => {
      const from = dragIdx.current;
      if (from === null) return;
      const to = rowAtY(e.clientY);
      dragIdx.current = null;
      setOverIdx(null);
      if (to !== null && to !== from) onReorder(from, to);
    },
    onPointerCancel: () => { dragIdx.current = null; setOverIdx(null); },
    style: { touchAction: 'none' as const },
  });

  const rowProps = (idx: number) => ({
    ref: (el: HTMLElement | null) => { if (el) rows.current.set(idx, el); else rows.current.delete(idx); },
    'data-over': overIdx === idx ? '1' : undefined,
  });

  return { handleProps, rowProps, overIdx };
}

// Small grip glyph used as the drag handle (no dedicated icon in the kit).
function DragHandle(props: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      {...props}
      title="גרור לשינוי סדר השורות"
      className="flex items-center justify-center text-neutral-300 hover:text-content-muted cursor-grab active:cursor-grabbing select-none leading-none touch-none"
    >
      ⠿
    </span>
  );
}

const ITEM_TYPES = [
  { value: '', label: '—' },
  { value: 'pipe_with_coupling', label: 'צינור+מחבר' },
  { value: 'pipe_bare', label: 'צינור בלבד' },
  { value: 'coupling', label: 'מחבר' },
  { value: 'wall_coupling', label: 'מחבר קיר' },
  { value: 'roker', label: 'רוקר' },
  { value: 'floating_roker', label: 'נזיר צף' },
  { value: 'buoy', label: 'מצוף' },
  { value: 'elbow', label: 'קשת' },
  { value: 'flange', label: 'אוגן' },
  { value: 'reducer', label: 'מעבר קטרים' },
  { value: 'other', label: 'אחר' },
];

// Comma-separated multi-select for item types (touch-friendly checkbox popover).
function itemTypeLabels(value?: string): string {
  const sel = (value || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (sel.length === 0) return '—';
  return ITEM_TYPES.filter((t) => t.value && sel.includes(t.value)).map((t) => t.label).join(' + ');
}

function MultiTypeSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; right: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const selected = (value || '').split(',').map((s) => s.trim()).filter(Boolean);
  const opts = ITEM_TYPES.filter((t) => t.value);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (btnRef.current?.contains(e.target as Node)) return;
      if (popRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    }
    if (open) document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  function openMenu() {
    const r = btnRef.current?.getBoundingClientRect();
    if (r) setCoords({ top: r.bottom + 4, right: Math.max(8, window.innerWidth - r.right) });
    setOpen(true);
  }

  function toggle(v: string) {
    const next = selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v];
    onChange(next.join(','));
  }

  return (
    <>
      <button ref={btnRef} type="button" onClick={() => (open ? setOpen(false) : openMenu())} className="w-full border border-line-subtle rounded px-1.5 py-1 text-[11px] text-right bg-white leading-tight whitespace-normal break-words min-h-[34px]">
        {itemTypeLabels(value)}
      </button>
      {open && coords && (
        <div ref={popRef} style={{ position: 'fixed', top: coords.top, right: coords.right, zIndex: 50 }}
          className="bg-white border border-line-subtle rounded-lg shadow-lg p-1 min-w-[160px] max-h-72 overflow-y-auto">
          {opts.map((o) => (
            <label key={o.value} className="flex items-center gap-2 px-2 py-1.5 text-[12px] hover:bg-neutral-50 rounded cursor-pointer">
              <input type="checkbox" checked={selected.includes(o.value)} onChange={() => toggle(o.value)} />
              <span>{o.label}</span>
            </label>
          ))}
        </div>
      )}
    </>
  );
}

// Single-line-looking textarea that grows to fit wrapped text (for long product names).
function AutoTextarea({ value, onChange, placeholder, className }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el) { el.style.height = 'auto'; el.style.height = `${el.scrollHeight}px`; }
  }, [value]);
  return (
    <textarea
      ref={ref}
      rows={1}
      dir="ltr"
      value={value || ''}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={`${className || ''} text-right`}
      style={{ resize: 'none', overflow: 'hidden' }}
    />
  );
}

function CostAttachmentLink({ att }: { att: any }) {
  function open() {
    let path = att.file_url || '';
    if (!path) return;
    if (path.startsWith('http')) {
      const m = path.match(/project-files\/(.+)$/);
      if (m) path = m[1];
    }
    // Open the new tab synchronously inside the click handler so Safari doesn't
    // strip the user-gesture context (it would otherwise block window.open after the await).
    const newWin = window.open('about:blank', '_blank');
    const sb = createClient();
    sb.storage.from('project-files').createSignedUrl(path, 300).then(({ data, error }) => {
      if (error || !data?.signedUrl) {
        if (newWin) newWin.close();
        alert(`לא הצלחתי לפתוח את הקובץ: ${error?.message || 'נסה שוב'}`);
        return;
      }
      if (newWin) newWin.location.href = data.signedUrl;
      else window.location.href = data.signedUrl; // fallback when popup was blocked
    });
  }
  return (
    <button onClick={open} className="text-primary hover:underline truncate flex-1 text-right min-w-0" dir="ltr" title={att.file_name}>
      <Icon name="file" size={14} /> {att.file_name}
    </button>
  );
}

const QUOTE_TIER_MAP: Record<string, { label: string; color: string }> = {
  planner_estimate:      { label: 'הערכת מתכנן',  color: 'bg-primary-50 text-primary' },
  contractor_pre_tender: { label: 'טרום מכרז',     color: 'bg-warning-soft text-warning' },
  contractor_final:      { label: 'הצעה סופית',    color: 'bg-azure-100 text-azure-600' },
};

const QUOTE_TIERS = [
  { value: 'planner_estimate',      label: 'הערכת מתכנן' },
  { value: 'contractor_pre_tender', label: 'טרום מכרז' },
  { value: 'contractor_final',      label: 'הצעה סופית' },
];

const QUOTE_STATUS_MAP: Record<string, { label: string; color: string }> = {
  draft: { label: 'טיוטה', color: 'bg-neutral-100 text-content-body' },
  sent: { label: 'נשלח', color: 'bg-azure-100 text-azure-600' },
  signed: { label: 'נחתם', color: 'bg-success-soft text-success' },
  rejected: { label: 'נדחה', color: 'bg-danger-soft text-danger' },
};

const ORDER_STATUS_MAP: Record<string, { label: string; color: string }> = {
  pending: { label: 'ממתין', color: 'bg-warning-soft text-warning' },
  confirmed: { label: 'מאושר', color: 'bg-azure-100 text-azure-600' },
  in_production: { label: 'בייצור', color: 'bg-primary-50 text-primary' },
  delivered: { label: 'סופק', color: 'bg-success-soft text-success' },
  completed: { label: 'הושלם', color: 'bg-neutral-100 text-content-body' },
};

export default function PricingSection({ projectId, attachmentVersion = 0 }: { projectId: string; attachmentVersion?: number }) {
  const p = usePricing(projectId);

  // When the parent uploads a new spec/drawing it bumps attachmentVersion;
  // we re-pull projectDrawings so the linking checkboxes show the new file
  // without a full reload.
  useEffect(() => {
    if (attachmentVersion > 0) p.refreshProjectDrawings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attachmentVersion]);

  return (
    <section className="bg-white rounded-xl border border-line-subtle p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-content-body"><Icon name="money" size={20} /> תמחור והצעות מחיר</h2>
      </div>

      <ExchangeRateWidget rates={p.exchangeRates} loading={p.rateLoading} onRefresh={p.refreshRate} />

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b border-line-subtle pb-2">
        {([['costs', 'תמחור'], ['quotes', 'הצעות מחיר'], ['orders', 'הזמנות']] as const).map(([key, label]) => (
          <button key={key} onClick={() => p.setPricingTab(key as any)} className={`text-sm px-4 py-1.5 rounded-t-lg transition-colors ${p.pricingTab === key ? 'bg-primary text-white font-bold' : 'bg-neutral-100 text-content-body hover:bg-neutral-200'}`}>
            {label}{key === 'costs' && p.costInputs.filter((c: any) => !c.is_archived).length > 0 ? ` (${p.costInputs.filter((c: any) => !c.is_archived).length})` : ''}{key === 'quotes' && p.quotes.length > 0 ? ` (${p.quotes.length})` : ''}{key === 'orders' && p.orders.length > 0 ? ` (${p.orders.length})` : ''}
          </button>
        ))}
      </div>

      {/* COSTS TAB */}
      {p.pricingTab === 'costs' && <CostsTab p={p} />}

      {/* QUOTES TAB */}
      {p.pricingTab === 'quotes' && <QuotesTab p={p} />}

      {/* ORDERS TAB */}
      {p.pricingTab === 'orders' && <OrdersTab p={p} projectId={projectId} />}
    </section>
  );
}

function CostsTab({ p }: { p: ReturnType<typeof usePricing> }) {
  return (
    <div>
      <div className="flex items-center justify-end gap-2 mb-3">
        <button onClick={() => p.setShowNewCostInput(!p.showNewCostInput)} className="text-sm bg-warning text-white px-3 py-1.5 rounded-lg hover:bg-warning transition-colors">
          {p.showNewCostInput ? 'ביטול' : '+ תמחור חדש'}
        </button>
      </div>

      {/* New cost input form */}
      {p.showNewCostInput && (
        <div className="bg-warning-soft border border-warning rounded-lg p-4 mb-4 space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[140px]">
              <label className="block text-[12px] font-semibold text-content-muted mb-1">סוג מקור</label>
              <div className="flex gap-3 mt-1">
                <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                  <input type="radio" checked={p.newCostInput.source_type === 'supplier'} onChange={() => p.setNewCostInput({ ...p.newCostInput, source_type: 'supplier' })} /> ספק חיצוני
                </label>
                <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                  <input type="radio" checked={p.newCostInput.source_type === 'internal'} onChange={() => p.setNewCostInput({ ...p.newCostInput, source_type: 'internal', currency: 'ILS' })} /> פנימי
                </label>
              </div>
            </div>
            <div className="flex-1 min-w-[150px]">
              <label className="block text-[12px] font-semibold text-content-muted mb-1">שם מקור</label>
              <input type="text" value={p.newCostInput.source_name} onChange={(e) => p.setNewCostInput({ ...p.newCostInput, source_name: e.target.value })} className="w-full border border-line-subtle rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-100" placeholder={p.newCostInput.source_type === 'supplier' ? 'Amiblu' : 'ציין שם מקור'} autoFocus />
            </div>
            {p.newCostInput.source_type === 'supplier' && (
              <div className="min-w-[120px]">
                <label className="block text-[12px] font-semibold text-content-muted mb-1">מטבע</label>
                <SearchableSelect value={p.newCostInput.currency} onChange={(v) => p.setNewCostInput({ ...p.newCostInput, currency: v })} className="w-full border border-line-subtle rounded-lg px-3 py-2 text-sm"
                  options={[{ value: 'USD', label: '$ דולר' }, { value: 'EUR', label: '€ אירו' }, { value: 'ILS', label: '₪ שקל' }]} />
              </div>
            )}
            <div className="flex-1 min-w-[150px]">
              <label className="block text-[12px] font-semibold text-content-muted mb-1">הערות</label>
              <input type="text" value={p.newCostInput.notes} onChange={(e) => p.setNewCostInput({ ...p.newCostInput, notes: e.target.value })} className="w-full border border-line-subtle rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-100" placeholder="אופציונלי" />
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[200px]">
              <label className="block text-[12px] font-semibold text-content-muted mb-1">תנאי תשלום לספק</label>
              <textarea value={p.newCostInput.payment_terms} onChange={(e) => p.setNewCostInput({ ...p.newCostInput, payment_terms: e.target.value })} className="w-full border border-line-subtle rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-100 min-h-[60px] resize-y" placeholder="למשל: 30% מקדמה, יתרה שוטף +60" />
            </div>
          </div>
          {p.newCostInput.source_type === 'supplier' && p.newCostInput.currency !== 'ILS' && (
            <div className="text-[12px] text-content-muted">
              שער {CURRENCY_SYMBOLS[p.newCostInput.currency] || ''}/₪: <strong>{p.exchangeRates[p.newCostInput.currency]?.rate?.toFixed(4) || 'טוען...'}</strong>
            </div>
          )}
          <button onClick={p.createCostInput} disabled={!p.newCostInput.source_name.trim()} className="bg-warning text-white text-sm px-4 py-2 rounded-lg hover:bg-warning transition-colors disabled:opacity-50">צור מסמך תמחור</button>
        </div>
      )}

      {/* Cost inputs list */}
      {p.costInputs.length === 0 && !p.showNewCostInput ? (
        <p className="text-sm text-neutral-400 text-center py-3">אין תמחורים. לחץ &quot;+ תמחור חדש&quot; להוסיף.</p>
      ) : (
        <>
          <div className="space-y-3">
            {p.costInputs.filter((ci) => !ci.is_archived).map((ci) => (
              <CostInputCard key={ci.id} ci={ci} p={p} />
            ))}
          </div>
          {p.costInputs.some((ci) => ci.is_archived) && (
            <div className="mt-4">
              <p className="text-[12px] text-neutral-400 mb-2">ארכיון</p>
              <div className="space-y-2">
                {p.costInputs.filter((ci) => ci.is_archived).map((ci) => (
                  <CostInputCard key={ci.id} ci={ci} p={p} />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function CostInputCard({ ci, p }: { ci: any; p: ReturnType<typeof usePricing> }) {
  const isExp = p.expandedCostInput === ci.id;
  const isEdit = p.editingCostInput === ci.id;
  const citems = p.costInputItems[ci.id] || [];
  const ciTotal = citems.reduce((s: number, i: any) => s + (parseFloat(i.total_cost) || 0), 0);

  // Effective currency (single source of truth in lib/pricing): header if
  // foreign, else any item's foreign original_currency (e.g. after Roxy parsed a
  // EUR sheet into a cost input the user originally created as ILS).
  const displayCurrency = effectiveCurrency(ci, citems);
  const isForex = displayCurrency !== 'ILS';
  const sym = CURRENCY_SYMBOLS[displayCurrency] || (isForex ? '$' : '₪');

  const archived = ci.is_archived;
  const canDropToRoxy = isExp && !archived && !p.parsingCostFile;
  const [dragOver, setDragOver] = useState(false);
  const dragDepth = useRef(0);

  function onDragEnter(e: React.DragEvent) {
    if (!canDropToRoxy || !e.dataTransfer?.types?.includes('Files')) return;
    e.preventDefault();
    dragDepth.current += 1;
    setDragOver(true);
  }
  function onDragOver(e: React.DragEvent) {
    if (!canDropToRoxy || !e.dataTransfer?.types?.includes('Files')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }
  function onDragLeave(e: React.DragEvent) {
    if (!canDropToRoxy) return;
    e.preventDefault();
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragOver(false);
  }
  function onDrop(e: React.DragEvent) {
    if (!canDropToRoxy) return;
    e.preventDefault();
    dragDepth.current = 0;
    setDragOver(false);
    const files = e.dataTransfer?.files;
    if (files && files.length > 0) p.parseCostFile(files, ci.id);
  }

  return (
    <div
      className={`relative border rounded-xl overflow-hidden transition-colors ${archived ? 'border-line-subtle opacity-60' : dragOver ? 'border-primary ring-2 ring-primary' : 'border-line-subtle'}`}
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {dragOver && (
        <div className="absolute inset-0 z-20 bg-primary-50 border-2 border-dashed border-primary rounded-xl flex items-center justify-center pointer-events-none">
          <div className="text-center">
            <div className="mb-1 text-primary"><Icon name="inbox" size={32} /></div>
            <p className="text-sm font-bold text-primary">שחרר כדי לשלוח ל-Roxy</p>
            <p className="text-[11px] text-primary mt-0.5">PDF, Excel, CSV, תמונות</p>
          </div>
        </div>
      )}
      <div className={`flex items-center justify-between px-4 py-3 cursor-pointer transition-colors ${archived ? 'bg-neutral-50 hover:bg-neutral-100' : 'bg-warning-soft hover:bg-warning-soft'}`} onClick={() => p.setExpandedCostInput(isExp ? null : ci.id)}>
        <div className="flex items-center gap-3">
          <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${archived ? 'bg-neutral-200 text-content-muted' : ci.source_type === 'supplier' ? 'bg-warning-soft text-warning' : 'bg-primary-50 text-primary'}`}>{ci.source_type === 'supplier' ? 'ספק' : 'פנימי'}</span>
          <span className={`text-sm font-bold ${archived ? 'text-neutral-400' : 'text-content-body'}`}>
            {ci.source_name}
            <span className={`mr-1.5 text-[11px] font-normal ${archived ? 'text-neutral-400' : 'text-content-muted'}`}>· {formatDate(ci.created_at)}</span>
          </span>
          {isForex && (() => {
            const rate = ci.exchange_rate || p.exchangeRates[displayCurrency]?.rate || 0;
            const rateDate = ci.exchange_rate_date ? formatDate(ci.exchange_rate_date) : '';
            return (
              <span className="flex items-center gap-1">
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-azure-100 text-azure-600 font-medium" title={rateDate ? `שער מתאריך ${rateDate}` : ''}>{displayCurrency} {rate ? `@ ${parseFloat(rate).toFixed(2)}` : ''}{rateDate ? ` · ${rateDate}` : ''}</span>
                {!archived && (
                  <button
                    onClick={async (e) => {
                      e.stopPropagation();
                      if (!confirm(`לעדכן את שער ה-${displayCurrency} לשער של היום? כל המחירים בתמחור יחושבו מחדש לפי השער החדש (המחיר במטבע המקור נשאר זהה; מחירים שהוזנו ידנית יישמרו).`)) return;
                      await p.refreshCostInputRate(ci.id);
                    }}
                    disabled={p.rateLoading}
                    title="עדכן שער ליום של היום וחשב מחדש"
                    className="text-[11px] bg-warning-soft text-warning px-1.5 py-0.5 rounded hover:bg-warning-soft disabled:opacity-50"
                  >
                    <Icon name={p.rateLoading ? 'loading' : 'refresh'} size={14} />
                  </button>
                )}
              </span>
            );
          })()}
        </div>
        <div className="flex items-center gap-3">
          <span className={`text-sm font-bold ${archived ? 'text-neutral-400' : 'text-content-body'}`}>{formatCurrency(ciTotal)}</span>
          <svg className={`w-4 h-4 text-neutral-400 transition-transform ${isExp ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9" /></svg>
        </div>
      </div>

      {isExp && (
        <div className="px-4 py-3 border-t border-line-subtle">
          {!isEdit && (
            <div className="flex items-center gap-2 mb-3">
              {!archived && <button onClick={() => p.startEditCostInput(ci.id)} className="text-[12px] bg-warning-soft text-warning px-3 py-1 rounded-lg hover:bg-warning-soft transition-colors"><Icon name="edit" size={16} /> ערוך פריטים</button>}
              {!archived && (
                <label className={`text-[12px] px-3 py-1 rounded-lg cursor-pointer transition-colors ${p.parsingCostFile ? 'bg-primary-50 text-navy-500' : 'bg-primary-50 text-primary hover:bg-primary-50'}`}>
                  {p.parsingCostFile ? <><Icon name="refresh" size={16} /> Roxy מעבדת...</> : <><Icon name="attach" size={16} /> העלה קובץ ל-Roxy</>}
                  <input type="file" className="hidden" accept="image/*,.pdf,.xlsx,.xls,.csv,.doc,.docx" multiple disabled={p.parsingCostFile} onChange={(e) => { if (e.target.files?.length) { p.parseCostFile(e.target.files, ci.id); e.target.value = ''; } }} />
                </label>
              )}
              {!archived && (
                <label className="text-[12px] bg-primary-50 text-primary px-3 py-1 rounded-lg hover:bg-primary-50 transition-colors cursor-pointer">
                  <Icon name="folder" size={16} /> צרף קובץ
                  <input type="file" className="hidden" accept="image/*,.pdf,.xlsx,.xls,.csv,.doc,.docx" multiple onChange={async (e) => {
                    const files = Array.from(e.target.files || []);
                    e.target.value = '';
                    for (const f of files) { await p.uploadCostInputAttachment(ci.id, f); }
                  }} />
                </label>
              )}
              <button onClick={(e) => { e.stopPropagation(); p.duplicateCostInput(ci.id); }} className="text-[12px] bg-primary-50 text-primary px-3 py-1 rounded-lg hover:bg-primary-50 transition-colors"><Icon name="copy" size={16} /> שכפל</button>
              <button onClick={(e) => { e.stopPropagation(); p.toggleArchiveCostInput(ci.id); }} className={`text-[12px] px-3 py-1 rounded-lg transition-colors ${archived ? 'bg-success-soft text-success hover:bg-success-soft' : 'bg-neutral-100 text-content-muted hover:bg-neutral-200'}`}>{archived ? <><Icon name="restore" size={16} /> שחזר</> : <><Icon name="archive" size={16} /> סיים תמחור</>}</button>
              <button onClick={(e) => {
                e.stopPropagation();
                if (!confirm(`למחוק את התמחור "${ci.source_name}" וכל הפריטים והקבצים שלו? פעולה זו אינה הפיכה.`)) return;
                if (!confirm('בטוח? למחוק לצמיתות?')) return;
                p.deleteCostInput(ci.id);
              }} className="text-[12px] text-danger px-3 py-1 rounded-lg hover:bg-danger-soft transition-colors mr-auto"><Icon name="delete" size={16} /> מחק</button>
            </div>
          )}
          {ci.payment_terms && <p className="text-[12px] text-content-muted mb-2 whitespace-pre-line"><Icon name="payment" size={14} /> תנאי תשלום לספק: {ci.payment_terms}</p>}
          {ci.notes && <p className="text-[12px] text-content-muted mb-3"><Icon name="pin" size={14} /> {ci.notes}</p>}
          {(() => {
            const ciAtts = p.attachments.filter((a: any) => a.entity_type === 'cost_input' && a.entity_id === ci.id);
            if (ciAtts.length === 0) return null;
            return (
              <div className="mb-3 p-2 bg-primary-50 border border-primary rounded-lg">
                <p className="text-[11px] font-semibold text-primary mb-1.5"><Icon name="attach" size={14} /> קבצים מצורפים ({ciAtts.length})</p>
                <div className="space-y-1">
                  {ciAtts.map((a: any) => (
                    <div key={a.id} className="flex items-center gap-2 text-[12px]">
                      <CostAttachmentLink att={a} />
                      <button onClick={async () => { if (!confirm('למחוק את הקובץ?')) return; await p.deleteAttachment(a.id); }} className="text-danger hover:text-danger text-[14px]">×</button>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {isEdit ? (
            <CostItemsEditor ci={ci} p={p} />
          ) : citems.length > 0 ? (
            <CostItemsDisplay citems={citems} ciTotal={ciTotal} isForex={isForex} sym={sym} ci={ci} />
          ) : (
            <p className="text-sm text-neutral-400 text-center py-2">אין פריטים. לחץ &quot;ערוך פריטים&quot; להוסיף.</p>
          )}

          {!isEdit && citems.length > 0 && <PipeCalcHelper citems={citems} ci={ci} rates={p.exchangeRates} />}
        </div>
      )}
    </div>
  );
}

function CostItemsEditor({ ci, p }: { ci: any; p: ReturnType<typeof usePricing> }) {
  // Effective currency (single source of truth) — shows a foreign-price column
  // whenever there's a real foreign price to edit, even if the header says ILS.
  const displayCurrency = effectiveCurrency(ci, p.editingCostItems);
  const isForex = displayCurrency !== 'ILS';
  const sym = CURRENCY_SYMBOLS[displayCurrency] || (isForex ? '$' : '$');
  const dnd = useRowDnd(p.reorderCostItems);

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto">
        {isForex ? (
          <>
            <div className="grid grid-cols-[18px_1fr_115px_70px_80px_70px_80px_60px_80px_52px] gap-1 text-[11px] font-semibold text-content-muted px-1 min-w-[778px]">
              <span></span><span>מוצר</span><span>סוג</span><span>קוטר</span><span>כמות</span><span>יחידה</span><span>מחיר {sym}</span><span>שער</span><span>מחיר ₪</span><span></span>
            </div>
            {p.editingCostItems.map((item: any, idx: number) => (
              <div key={idx} className={`grid grid-cols-[18px_1fr_115px_70px_80px_70px_80px_60px_80px_52px] gap-1 min-w-[778px] rounded ${dnd.overIdx === idx ? 'ring-2 ring-warning ring-inset bg-warning-soft' : ''}`} {...dnd.rowProps(idx)}>
                <DragHandle {...dnd.handleProps(idx)} />
                <AutoTextarea value={item.product_name} onChange={(v) => p.updateCostItem(idx, 'product_name', v)} placeholder="שם מוצר" className="border border-line-subtle rounded px-2 py-1.5 text-sm w-full" />
                <MultiTypeSelect value={item.item_type || ''} onChange={(v) => p.updateCostItem(idx, 'item_type', v)} />
                <input type="text" value={item.dn_size || ''} onChange={(e) => p.updateCostItem(idx, 'dn_size', e.target.value)} placeholder="DN" className="border border-line-subtle rounded px-2 py-1.5 text-sm" />
                <input type="number" value={item.quantity || ''} onChange={(e) => p.updateCostItem(idx, 'quantity', e.target.value)} className="border border-line-subtle rounded px-2 py-1.5 text-sm" />
                <input type="text" value={item.unit || 'מטר'} onChange={(e) => p.updateCostItem(idx, 'unit', e.target.value)} className="border border-line-subtle rounded px-2 py-1.5 text-sm" />
                <input type="number" value={item.original_price || ''} onChange={(e) => p.updateCostItem(idx, 'original_price', e.target.value)} placeholder={sym} className="border border-line-subtle rounded px-2 py-1.5 text-sm bg-warning-soft" dir="ltr" />
                <span className="flex items-center text-[11px] text-neutral-400 px-1">{parseFloat(ci.exchange_rate || p.exchangeRates[displayCurrency]?.rate || 0).toFixed(2)}</span>
                <span className="flex items-center text-sm font-medium text-content-body px-1">₪{(parseFloat(item.cost_price) || 0).toFixed(0)}</span>
                <div className="flex items-center justify-center gap-1">
                  <button onClick={() => p.duplicateCostItem(idx)} title="שכפל שורה" className="text-neutral-400 hover:text-primary"><Icon name="copy" size={14} /></button>
                  <button onClick={() => p.removeCostItem(idx)} title="מחק שורה" className="text-danger hover:text-danger text-lg">×</button>
                </div>
              </div>
            ))}
          </>
        ) : (
          <>
            <div className="grid grid-cols-[18px_1fr_115px_70px_80px_70px_80px_80px_52px] gap-1 text-[11px] font-semibold text-content-muted px-1 min-w-[718px]">
              <span></span><span>מוצר</span><span>סוג</span><span>קוטר</span><span>כמות</span><span>יחידה</span><span>מחיר עלות</span><span>סה״כ</span><span></span>
            </div>
            {p.editingCostItems.map((item: any, idx: number) => (
              <div key={idx} className={`grid grid-cols-[18px_1fr_115px_70px_80px_70px_80px_80px_52px] gap-1 min-w-[718px] rounded ${dnd.overIdx === idx ? 'ring-2 ring-warning ring-inset bg-warning-soft' : ''}`} {...dnd.rowProps(idx)}>
                <DragHandle {...dnd.handleProps(idx)} />
                <AutoTextarea value={item.product_name} onChange={(v) => p.updateCostItem(idx, 'product_name', v)} placeholder="שם מוצר" className="border border-line-subtle rounded px-2 py-1.5 text-sm w-full" />
                <MultiTypeSelect value={item.item_type || ''} onChange={(v) => p.updateCostItem(idx, 'item_type', v)} />
                <input type="text" value={item.dn_size || ''} onChange={(e) => p.updateCostItem(idx, 'dn_size', e.target.value)} placeholder="DN" className="border border-line-subtle rounded px-2 py-1.5 text-sm" />
                <input type="number" value={item.quantity || ''} onChange={(e) => p.updateCostItem(idx, 'quantity', e.target.value)} className="border border-line-subtle rounded px-2 py-1.5 text-sm" />
                <input type="text" value={item.unit || 'מטר'} onChange={(e) => p.updateCostItem(idx, 'unit', e.target.value)} className="border border-line-subtle rounded px-2 py-1.5 text-sm" />
                <input type="number" value={item.cost_price || ''} onChange={(e) => p.updateCostItem(idx, 'cost_price', e.target.value)} placeholder="₪" className="border border-line-subtle rounded px-2 py-1.5 text-sm" />
                <span className="flex items-center text-sm font-medium text-content-body px-1">{formatCurrency(parseFloat(item.total_cost) || 0)}</span>
                <div className="flex items-center justify-center gap-1">
                  <button onClick={() => p.duplicateCostItem(idx)} title="שכפל שורה" className="text-neutral-400 hover:text-primary"><Icon name="copy" size={14} /></button>
                  <button onClick={() => p.removeCostItem(idx)} title="מחק שורה" className="text-danger hover:text-danger text-lg">×</button>
                </div>
              </div>
            ))}
          </>
        )}
      </div>
      <div className="flex items-center justify-between pt-2">
        <div className="flex items-center gap-3">
          <button onClick={p.addCostItem} className="text-[12px] text-warning hover:underline">+ הוסף שורה</button>
          <label className={`text-[12px] px-3 py-1 rounded-lg cursor-pointer transition-colors ${p.parsingCostFile ? 'bg-primary-50 text-navy-500' : 'bg-primary-50 text-primary hover:bg-primary-50'}`}>
            {p.parsingCostFile ? <><Icon name="refresh" size={16} /> Roxy מעבדת...</> : <><Icon name="attach" size={16} /> העלה עוד קובץ ל-Roxy</>}
            <input type="file" className="hidden" accept="image/*,.pdf,.xlsx,.xls,.csv,.doc,.docx" multiple disabled={p.parsingCostFile} onChange={(e) => { if (e.target.files?.length) { p.parseCostFile(e.target.files, ci.id); e.target.value = ''; } }} />
          </label>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-content-body">סה״כ עלות: {formatCurrency(p.editingCostItems.reduce((s: number, i: any) => s + (parseFloat(i.total_cost) || 0), 0))}</span>
          <button onClick={p.cancelEditCostInput} className="text-sm text-content-muted px-3 py-1.5 rounded-lg hover:bg-neutral-100">ביטול</button>
          <button onClick={() => p.saveCostInputItems(ci.id)} disabled={p.saving} className="text-sm bg-warning text-white px-4 py-1.5 rounded-lg hover:bg-warning disabled:opacity-50">{p.saving ? 'שומר...' : 'שמור'}</button>
        </div>
      </div>
    </div>
  );
}

function CostItemsDisplay({ citems, ciTotal, isForex, sym, ci }: { citems: any[]; ciTotal: number; isForex: boolean; sym: string; ci: any }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse" style={{ minWidth: isForex ? 660 : 560 }}>
        <thead><tr className="border-b border-line-subtle">
          <th className="text-right text-[11px] text-content-muted font-medium pb-1.5 pr-1 w-[40%]">מוצר</th>
          <th className="text-right text-[11px] text-content-muted font-medium pb-1.5 px-2 whitespace-nowrap">סוג</th>
          <th className="text-right text-[11px] text-content-muted font-medium pb-1.5 px-2 whitespace-nowrap">קוטר</th>
          <th className="text-right text-[11px] text-content-muted font-medium pb-1.5 px-2 whitespace-nowrap">כמות</th>
          {isForex && <th className="text-right text-[11px] text-content-muted font-medium pb-1.5 px-2 whitespace-nowrap">מחיר {sym}</th>}
          <th className="text-right text-[11px] text-content-muted font-medium pb-1.5 px-2 whitespace-nowrap">מחיר ₪</th>
          <th className="text-right text-[11px] text-content-muted font-medium pb-1.5 px-2 whitespace-nowrap">סה״כ ₪</th>
        </tr></thead>
        <tbody>{citems.map((item: any) => {
          const typeLabel = itemTypeLabels(item.item_type) === '—' ? '' : itemTypeLabels(item.item_type);
          return (
            <tr key={item.id} className="border-b border-line-subtle align-top">
              <td className="py-1.5 pr-1 text-content-body leading-snug break-words text-right" dir="rtl">{item.product_name}</td>
              <td className="py-1.5 px-2 text-[11px] text-content-muted whitespace-nowrap">{typeLabel}</td>
              <td className="py-1.5 px-2 text-content-muted whitespace-nowrap">{item.dn_size || '—'}</td>
              <td className="py-1.5 px-2 text-content-muted whitespace-nowrap">{item.quantity} {item.unit}</td>
              {isForex && <td className="py-1.5 px-2 text-content-muted whitespace-nowrap text-right" dir="ltr">{sym}{parseFloat(item.original_price || 0).toFixed(2)}</td>}
              <td className="py-1.5 px-2 text-content-muted whitespace-nowrap text-right" dir="ltr">{formatCurrency(item.cost_price)}</td>
              <td className="py-1.5 px-2 font-medium text-content-body whitespace-nowrap text-right" dir="ltr">{formatCurrency(item.total_cost)}</td>
            </tr>
          );
        })}</tbody>
        <tfoot><tr className="border-t border-line-subtle">
          <td colSpan={isForex ? 5 : 4} className="py-2 pr-1 font-bold text-content-body">סה״כ עלות</td>
          <td colSpan={2} className="py-2 px-2 font-bold text-content-body whitespace-nowrap text-right" dir="ltr">{formatCurrency(ciTotal)}</td>
        </tr></tfoot>
      </table>
    </div>
  );
}

function PipeCalcHelper({ citems, ci, rates }: { citems: any[]; ci: any; rates: Record<string, any> }) {
  const bareItems = citems.filter((i: any) => (i.item_type || '').split(',').includes('pipe_bare'));
  const couplingItems = citems.filter((i: any) => (i.item_type || '').split(',').includes('coupling'));
  if (bareItems.length === 0 || couplingItems.length === 0) return null;

  const isForex = ci.currency && ci.currency !== 'ILS';
  const rate = isForex ? (parseFloat(ci.exchange_rate) || rates[ci.currency]?.rate || 1) : 1;
  const sym = CURRENCY_SYMBOLS[ci.currency] || '₪';
  const pairs: { dn: string; barePrice: number; couplingPrice: number; length: number }[] = [];

  for (const bare of bareItems) {
    const dn = bare.dn_size || '';
    const coupling = couplingItems.find((c: any) => (c.dn_size || '') === dn);
    if (!coupling) continue;
    const barePrice = parseFloat(bare.original_price || bare.cost_price) || 0;
    const couplingPrice = parseFloat(coupling.original_price || coupling.cost_price) || 0;
    const length = parseFloat(bare.length_m) || 5.7;
    pairs.push({ dn, barePrice, couplingPrice, length });
  }

  if (pairs.length === 0) return null;

  return (
    <div className="mt-3 bg-azure-100 border border-azure rounded-lg p-3">
      <p className="text-[12px] font-bold text-azure-600 mb-2"><Icon name="drawings" size={14} /> חישוב עלות למדלק (צינור + מחבר)</p>
      <div className="space-y-2">
        {pairs.map(({ dn, barePrice, couplingPrice, length }) => {
          const costPerMeter = calcCostPerMeter(barePrice, couplingPrice, length);
          const costPerMeterILS = isForex ? Math.round(costPerMeter * rate * 100) / 100 : costPerMeter;
          const dnNum = parseInt(dn.replace(/\D/g, '')) || 0;
          const roker = dnNum > 0 ? calcRokerCostPerMeter(barePrice, dnNum, couplingPrice) : null;
          const rokerILS = roker && isForex ? Math.round(roker.costPerMeter * rate * 100) / 100 : roker?.costPerMeter;

          return (
            <div key={dn} className="text-[12px] text-content-body">
              <span className="font-bold">{dn}</span>
              <span className="mx-1">—</span>
              <span>צינור ({length}מי): </span>
              {isForex && <span className="text-content-muted">{sym}{costPerMeter.toFixed(2)} → </span>}
              <span className="font-bold text-azure-600">₪{costPerMeterILS.toFixed(2)}/מי</span>
              {roker && dnNum > 0 && (
                <>
                  <span className="mx-2 text-neutral-300">|</span>
                  <span>רוקר ({roker.rokerLength.toFixed(1)}מי): </span>
                  {isForex && <span className="text-content-muted">{sym}{roker.costPerMeter.toFixed(2)} → </span>}
                  <span className="font-bold text-primary">₪{rokerILS?.toFixed(2)}/מי</span>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function QuotesTab({ p }: { p: ReturnType<typeof usePricing> }) {
  const [showCustomerForm, setShowCustomerForm] = useState(false);
  return (
    <>
      <div className="flex justify-end mb-3">
        <button onClick={() => p.setShowNewQuote(!p.showNewQuote)} className="text-sm bg-primary text-white px-3 py-1.5 rounded-lg hover:bg-primary-700 transition-colors">
          {p.showNewQuote ? 'ביטול' : '+ הצעה חדשה'}
        </button>
      </div>

      {showCustomerForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center overflow-y-auto p-4" onClick={() => setShowCustomerForm(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl mt-10 p-6" onClick={(e) => e.stopPropagation()}>
            <CustomerForm
              onCancel={() => setShowCustomerForm(false)}
              onSaved={async (id) => {
                setShowCustomerForm(false);
                await p.refreshCustomers();
                const { data } = await createClient().from('clients').select('name').eq('id', id).single();
                p.setNewQuote({ ...p.newQuote, customer_id: id, client_name: data?.name || p.newQuote.client_name });
              }}
            />
          </div>
        </div>
      )}

      {p.showNewQuote && (
        <div className="bg-azure-100 border border-azure rounded-lg p-4 mb-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="md:col-span-2">
              <label className="block text-[12px] font-semibold text-content-muted mb-1">לקוח</label>
              <div className="flex items-center gap-2">
                <SearchableSelect
                  value={p.newQuote.customer_id}
                  onChange={(v) => {
                    const cust = p.customers.find((c: any) => c.id === v);
                    p.setNewQuote({ ...p.newQuote, customer_id: v, client_name: cust?.name || p.newQuote.client_name, contact_id: '' });
                    // Pull the latest contacts for the chosen customer so a
                    // contact added elsewhere shows up without a page reload.
                    if (v) p.refreshCustomers();
                  }}
                  className="flex-1 border border-line-subtle rounded-lg px-3 py-2 text-sm"
                  placeholder="— ללא לקוח —"
                  options={[{ value: '', label: '— ללא לקוח —' }, ...p.customers.map((c: any) => ({ value: c.id, label: c.name }))]}
                />
                <button onClick={() => setShowCustomerForm(true)} className="text-[13px] bg-white border border-primary text-primary px-3 py-2 rounded-lg hover:bg-primary-50 whitespace-nowrap">+ לקוח חדש</button>
              </div>
            </div>
            <div>
              <label className="block text-[12px] font-semibold text-content-muted mb-1">שם לקוח / קבלן (ל&quot;לכבוד&quot;)</label>
              <input type="text" value={p.newQuote.client_name} onChange={(e) => p.setNewQuote({ ...p.newQuote, client_name: e.target.value })} className="w-full border border-line-subtle rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-100" placeholder="שם הלקוח" />
            </div>
            <div>
              <label className="block text-[12px] font-semibold text-content-muted mb-1">איש קשר</label>
              {(() => {
                const customerOpts = p.newQuote.customer_id
                  ? p.customerContacts
                      .filter((c: any) => c.client_id === p.newQuote.customer_id)
                      .map((c: any) => ({ value: `cc:${c.id}`, label: `${c.name}${c.role ? ` (${c.role})` : ''}${c.phone ? ` · ${c.phone}` : ''}` }))
                  : [];
                const projectOpts = p.newQuote.customer_id
                  ? []
                  : p.contacts.map((c: any) => ({ value: `pc:${c.id}`, label: `${c.name}${c.role ? ` (${c.role})` : ''}${c.phone ? ` · ${c.phone}` : ''}` }));
                const opts = [{ value: '', label: '— ללא / איש קשר ראשון —' }, ...customerOpts, ...projectOpts];
                const placeholder = p.newQuote.customer_id && customerOpts.length === 0
                  ? '— אין אנשי קשר ללקוח —'
                  : '— ללא / איש קשר ראשון —';
                return (
                  <SearchableSelect value={p.newQuote.contact_id} onChange={(v) => p.setNewQuote({ ...p.newQuote, contact_id: v })} className="w-full border border-line-subtle rounded-lg px-3 py-2 text-sm"
                    placeholder={placeholder}
                    options={opts} />
                );
              })()}
            </div>
            <div>
              <label className="block text-[12px] font-semibold text-content-muted mb-1">סוג הצעה</label>
              <SearchableSelect value={p.newQuote.tier} onChange={(v) => p.setNewQuote({ ...p.newQuote, tier: v })} className="w-full border border-line-subtle rounded-lg px-3 py-2 text-sm"
                options={QUOTE_TIERS.map((t) => ({ value: t.value, label: t.label }))} />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-[12px] font-semibold text-content-muted mb-1">מקור תמחור</label>
              <div className="flex gap-3 mt-1">
                <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                  <input type="radio" checked={p.newQuote.cost_source === 'supplier'} onChange={() => p.setNewQuote({ ...p.newQuote, cost_source: 'supplier', default_overheads_pct: 17 })} /> ספק (+ תקורות)
                </label>
                <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                  <input type="radio" checked={p.newQuote.cost_source === 'internal'} onChange={() => p.setNewQuote({ ...p.newQuote, cost_source: 'internal', default_overheads_pct: 0 })} /> פנימי
                </label>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {p.costInputs.length > 0 && (
              <div>
                <label className="block text-[12px] font-semibold text-content-muted mb-1">קישור לתמחור</label>
                <SearchableSelect value={p.newQuote.cost_input_id} onChange={(v) => p.setNewQuote({ ...p.newQuote, cost_input_id: v })} className="w-full border border-line-subtle rounded-lg px-3 py-2 text-sm"
                  placeholder="ללא קישור"
                  options={[{ value: '', label: 'ללא קישור' }, ...p.costInputs.map((ci: any) => {
                    const cnt = (p.costInputItems[ci.id] || []).length;
                    const items = cnt === 0 ? '⚠ ריק' : `${cnt} פריטים`;
                    const cur = ci.currency && ci.currency !== 'ILS' ? ` ${ci.currency}` : '';
                    return { value: ci.id, label: `${ci.source_name} (${ci.source_type === 'supplier' ? 'ספק' : 'פנימי'})${cur} · ${formatDate(ci.created_at)} · ${items}` };
                  })]} />
                {p.newQuote.cost_input_id && (p.costInputItems[p.newQuote.cost_input_id] || []).length === 0 && (
                  <p className="mt-1 text-[11px] text-warning"><Icon name="warning" size={14} /> התמחור הנבחר ריק — ההצעה תיווצר ללא פריטים.</p>
                )}
              </div>
            )}
            <div>
              <label className="block text-[12px] font-semibold text-content-muted mb-1">תקורות %</label>
              <input type="number" value={p.newQuote.default_overheads_pct} onChange={(e) => p.setNewQuote({ ...p.newQuote, default_overheads_pct: parseFloat(e.target.value) || 0 })} className="w-full border border-line-subtle rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-100" />
            </div>
            <div>
              <label className="block text-[12px] font-semibold text-content-muted mb-1">רווח %</label>
              <input type="number" value={p.newQuote.default_profit_pct} onChange={(e) => p.setNewQuote({ ...p.newQuote, default_profit_pct: parseFloat(e.target.value) || 0 })} className="w-full border border-line-subtle rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-100" />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-[12px] font-semibold text-content-muted mb-1">סוג הערות משפטיות</label>
              <SearchableSelect value={p.newQuote.disclaimer_type} onChange={(v) => p.setNewQuote({ ...p.newQuote, disclaimer_type: v })} className="w-full border border-line-subtle rounded-lg px-3 py-2 text-sm"
                options={DISCLAIMER_TYPES.map((d) => ({ value: d.value, label: d.label }))} />
            </div>
            <div>
              <label className="block text-[12px] font-semibold text-content-muted mb-1">תנאי תשלום</label>
              <textarea value={p.newQuote.payment_terms} onChange={(e) => p.setNewQuote({ ...p.newQuote, payment_terms: e.target.value })} className="w-full border border-line-subtle rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-100 min-h-[60px] resize-y" />
            </div>
          </div>
          <div>
            <label className="block text-[12px] font-semibold text-content-muted mb-1">הערות</label>
            <input type="text" value={p.newQuote.notes} onChange={(e) => p.setNewQuote({ ...p.newQuote, notes: e.target.value })} className="w-full border border-line-subtle rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-100" placeholder="אופציונלי" />
          </div>
          <button onClick={p.createQuote} disabled={!p.newQuote.client_name.trim()} className="bg-primary text-white text-sm px-4 py-2 rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50">צור הצעה</button>
        </div>
      )}

      {p.quotes.length === 0 && !p.showNewQuote ? (
        <p className="text-sm text-neutral-400 text-center py-3">אין הצעות מחיר. לחץ &quot;+ הצעה חדשה&quot; להוסיף.</p>
      ) : (
        <div className="space-y-3">
          {p.quotes.map((q) => (
            <QuoteCard key={q.id} q={q} p={p} />
          ))}
        </div>
      )}
    </>
  );
}

// Status pill + quick-change menu for the quote header. Rendered via a portal
// with fixed positioning so it floats above everything — the quote card is
// overflow-hidden (rounded corners), which would otherwise clip an absolutely
// positioned dropdown.
function HeaderStatusMenu({ q, p, st, onReject }: { q: any; p: ReturnType<typeof usePricing>; st: { label: string; color: string }; onReject: () => void }) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);

  function toggle(e: React.MouseEvent) {
    e.stopPropagation();
    if (open) { setOpen(false); return; }
    const r = btnRef.current!.getBoundingClientRect();
    setPos({ top: r.bottom + 4, right: window.innerWidth - r.right });
    setOpen(true);
  }

  const choices = [{ key: 'draft', label: 'טיוטה' }, { key: 'sent', label: 'נשלח' }, { key: 'rejected', label: 'נדחה' }]
    .filter((s) => s.key !== q.status);

  return (
    <>
      <button
        ref={btnRef}
        onClick={toggle}
        className={`text-[11px] px-2 py-0.5 rounded-full font-semibold inline-flex items-center gap-1 ${st.color}`}
        title="שנה סטטוס"
      >
        {st.label}<span className="text-[8px] opacity-60">▼</span>
      </button>
      {open && pos && createPortal(
        <div className="fixed inset-0 z-[60]" onClick={(e) => { e.stopPropagation(); setOpen(false); }}>
          <div
            style={{ position: 'fixed', top: pos.top, right: pos.right }}
            className="bg-white border border-line-subtle rounded-lg shadow-lg py-1 min-w-[130px]"
            dir="rtl"
            onClick={(e) => e.stopPropagation()}
          >
            {choices.map((s) => (
              <button
                key={s.key}
                onClick={() => { setOpen(false); if (s.key === 'rejected') onReject(); else p.updateQuoteStatus(q.id, s.key); }}
                className={`block w-full text-right px-3 py-1.5 text-[12px] hover:bg-neutral-50 ${s.key === 'rejected' ? 'text-danger' : 'text-content-body'}`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

function QuoteCard({ q, p }: { q: any; p: ReturnType<typeof usePricing> }) {
  const st = QUOTE_STATUS_MAP[q.status] || QUOTE_STATUS_MAP.draft;
  const tier = QUOTE_TIER_MAP[q.tier] || QUOTE_TIER_MAP.contractor_pre_tender;
  const isExpanded = p.expandedQuote === q.id;
  const isEditing = p.editingQuote === q.id;
  const items = p.quoteItems[q.id] || [];
  const [editTermsQuoteId, setEditTermsQuoteId] = useState<string | null>(null);
  const [showReject, setShowReject] = useState(false);

  return (
    <div className="border border-line-subtle rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 bg-neutral-50 cursor-pointer hover:bg-neutral-100 transition-colors" onClick={() => { const opening = !isExpanded; p.setExpandedQuote(opening ? q.id : null); if (opening && q.customer_id) p.refreshCustomers(); }}>
        <div className="flex items-center gap-3">
          <span className="text-sm font-mono text-neutral-400">{q.quote_number}</span>
          {q.client_name?.trim()
            ? <span className="text-sm font-bold text-content-body">{q.client_name}</span>
            : <span className="text-sm font-semibold text-warning">לקוח חסר</span>}
          <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${tier.color}`}>{tier.label}</span>
          {q.status === 'rejected' && q.lost_reason && (
            <span className="text-[11px] text-danger" title={q.lost_reason}>סיבת הפסד: {q.lost_reason.length > 40 ? q.lost_reason.slice(0, 40) + '…' : q.lost_reason}</span>
          )}
          {/* Status pill doubles as a quick-change menu — flip draft→sent/נדחה
              straight from the header without expanding the quote. Signing stays
              behind the signed-file upload in the expanded actions. */}
          <HeaderStatusMenu q={q} p={p} st={st} onReject={() => setShowReject(true)} />
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm font-bold text-content-body">{formatCurrency(q.total_amount || 0)}</span>
          <svg className={`w-4 h-4 text-neutral-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9" /></svg>
        </div>
      </div>

      {isExpanded && (
        <div className="px-4 py-3 border-t border-line-subtle">
          {/* Row 1 — context pickers (hidden while editing items) */}
          {!isEditing && (
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className="flex items-center gap-1 text-[12px] text-content-muted">
                <Icon name="user" size={16} /> איש קשר:
                <SearchableSelect value={q.contact_id ? `pc:${q.contact_id}` : ''} onChange={(v) => p.assignQuoteContact(q.id, v)} className="border border-line-subtle rounded-lg px-2 py-1 text-[12px] min-w-[150px]"
                  placeholder="— ראשון בפרויקט —"
                  options={(() => {
                    const opts: { value: string; label: string; group?: string }[] = [{ value: '', label: '— ראשון בפרויקט —' }];
                    p.contacts.forEach((c: any) => opts.push({ value: `pc:${c.id}`, label: `${c.name}${c.role ? ` (${c.role})` : ''}`, group: 'אנשי קשר בפרויקט' }));
                    if (q.customer_id) {
                      const projNames = new Set(p.contacts.map((c: any) => (c.name || '').trim()).filter(Boolean));
                      p.customerContacts.filter((c: any) => c.client_id === q.customer_id && !projNames.has((c.name || '').trim()))
                        .forEach((c: any) => opts.push({ value: `cc:${c.id}`, label: `${c.name}${c.role ? ` (${c.role})` : ''}`, group: 'אנשי קשר של הלקוח' }));
                    }
                    return opts;
                  })()} />
              </span>
              <span className="flex items-center gap-1 text-[12px] text-content-muted">
                <Icon name="company" size={16} /> לקוח:
                <SearchableSelect value={q.customer_id || ''} onChange={(v) => p.setQuoteCustomer(q.id, v)} className="border border-line-subtle rounded-lg px-2 py-1 text-[12px] min-w-[150px]"
                  placeholder="— ללא —"
                  options={[{ value: '', label: '— ללא —' }, ...p.customers.map((c: any) => ({ value: c.id, label: c.name }))]} />
              </span>
              {q.status === 'draft' && p.costInputs.length > 0 && (
                <span className="flex items-center gap-1 text-[12px] text-content-muted">
                  <Icon name="money" size={16} /> קישור לתמחור:
                  <SearchableSelect value={q.cost_input_id || ''} onChange={(v) => p.setQuoteCostInput(q.id, v)} className="border border-line-subtle rounded-lg px-2 py-1 text-[12px] min-w-[180px]"
                    placeholder="ללא קישור"
                    options={[{ value: '', label: 'ללא קישור' }, ...p.costInputs.map((ci: any) => {
                      const cnt = (p.costInputItems[ci.id] || []).length;
                      const items = cnt === 0 ? '⚠ ריק' : `${cnt} פריטים`;
                      const cur = ci.currency && ci.currency !== 'ILS' ? ` ${ci.currency}` : '';
                      return { value: ci.id, label: `${ci.source_name} (${ci.source_type === 'supplier' ? 'ספק' : 'פנימי'})${cur} · ${formatDate(ci.created_at)} · ${items}` };
                    })]} />
                </span>
              )}
              {q.status === 'draft' && p.contractTemplates.length > 0 && (
                <span className="flex items-center gap-1 text-[12px] text-content-muted">
                  <Icon name="contract" size={16} /> תנאי הסכם:
                  <SearchableSelect value={q.contract_template_id || ''} onChange={(v) => p.setQuoteContractTemplate(q.id, v)} className="border border-line-subtle rounded-lg px-2 py-1 text-[12px] min-w-[170px]"
                    placeholder="תבנית"
                    options={p.contractTemplates.map((t: any) => ({ value: t.id, label: `${t.name}${t.is_default ? ' (ברירת מחדל)' : ''}` }))} />
                  <button onClick={() => setEditTermsQuoteId(q.id)} className="text-[11px] bg-primary-50 text-primary px-2 py-0.5 rounded-lg hover:bg-primary-100"><Icon name="edit" size={14} /> ערוך להצעה זו</button>
                  {q.contract_overrides && (
                    <button onClick={() => { if (confirm('לשחזר את התנאים מהתבנית ולמחוק את העריכה הייעודית?')) p.setQuoteContractOverrides(q.id, null); }} className="text-[11px] bg-warning-soft text-warning px-2 py-0.5 rounded-lg hover:bg-warning-soft"><Icon name="refresh" size={14} /> שחזר מהתבנית</button>
                  )}
                </span>
              )}
            </div>
          )}

          {/* Row 2 — primary actions · status flow · discount · overflow */}
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            {!isEditing && (
              <>
                <button onClick={() => p.startEditQuote(q.id)} className="text-[12px] bg-primary-50 text-primary px-3 py-1 rounded-lg hover:bg-primary-100 transition-colors"><Icon name="edit" size={16} /> ערוך פריטים</button>
                {items.length > 0 && (
                  <a href={`/projects/${q.project_id}/quote/${q.id}`} target="_blank" rel="noopener noreferrer" className="text-[12px] bg-success-soft text-success px-3 py-1 rounded-lg hover:bg-success-soft transition-colors"><Icon name="file" size={16} /> תצוגה מקדימה</a>
                )}
                <span className="w-px h-5 bg-neutral-200 mx-1" />
              </>
            )}
            {q.status === 'draft' && (
              <button onClick={() => p.updateQuoteStatus(q.id, 'sent')} className="text-[12px] bg-azure-100 text-azure-600 px-3 py-1 rounded-lg hover:bg-azure-100 transition-colors"><Icon name="send" size={16} /> סמן כנשלח</button>
            )}
            {(q.status === 'sent' || q.status === 'draft') && (
              <label className="text-[12px] bg-success-soft text-success px-3 py-1 rounded-lg hover:bg-success-soft transition-colors cursor-pointer">
                <Icon name="success" size={16} /> נחתם
                <input type="file" className="hidden" accept=".pdf,.png,.jpg,.jpeg,.doc,.docx" onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  if (!confirm('לסמן הצעה כנחתמת ולהעלות את הקובץ החתום?')) return;
                  await p.uploadAttachment(q.id, file);
                  await p.updateQuoteStatus(q.id, 'signed');
                  e.target.value = '';
                }} />
              </label>
            )}
            {q.status !== 'rejected' && q.status !== 'signed' && (
              <button onClick={() => setShowReject(true)} className="text-[12px] bg-danger-soft text-danger px-3 py-1 rounded-lg hover:bg-danger-soft transition-colors"><Icon name="error" size={16} /> נדחה</button>
            )}

            <div className="grow" />

            {!isEditing && items.length > 0 && (
              <div className="flex items-center gap-1 text-[12px] text-content-muted">
                <span>הנחה כללית:</span>
                <input type="number" value={q.global_discount_pct || ''} onChange={(e) => p.updateGlobalDiscount(q.id, parseFloat(e.target.value) || 0)} placeholder="0" className="w-14 border border-line-subtle rounded px-1.5 py-0.5 text-[12px] text-center bg-warning-soft" />
                <span>%</span>
              </div>
            )}

            {/* Overflow menu — opens on hover (group-hover) for desktop;
                tap on the ⋯ button activates :hover on touch devices. */}
            <div className="relative group">
              <button className="text-[14px] leading-none bg-neutral-50 text-content-body px-3 py-1.5 rounded-lg hover:bg-neutral-100 transition-colors" aria-label="פעולות נוספות">⋯</button>
              <div className="hidden group-hover:block absolute top-full left-0 z-30 pt-1">
                <div className="bg-white border border-line-subtle rounded-lg shadow-lg py-1 min-w-[180px]">
                  {!isEditing && (
                    <label className={`block px-3 py-1.5 text-[12px] cursor-pointer ${p.uploadingFile ? 'text-neutral-400' : 'text-primary hover:bg-primary-50'}`}>
                      {p.uploadingFile ? <><Icon name="loading" size={14} /> מעלה...</> : <><Icon name="attach" size={14} /> צרף שרטוט</>}
                      <input type="file" className="hidden" accept=".pdf,.dwg,.dxf,.png,.jpg,.jpeg,.doc,.docx,.xlsx" disabled={p.uploadingFile} onChange={(e) => { if (e.target.files?.[0]) { p.uploadAttachment(q.id, e.target.files[0]); e.target.value = ''; } }} />
                    </label>
                  )}
                  <button onClick={() => p.duplicateQuote(q.id)} className="block w-full text-right px-3 py-1.5 text-[12px] text-primary hover:bg-primary-50"><Icon name="copy" size={16} /> שכפל</button>
                  {q.status === 'draft' && (
                    <button onClick={() => { if (confirm('למחוק הצעה זו?')) p.deleteQuote(q.id); }} className="block w-full text-right px-3 py-1.5 text-[12px] text-danger hover:bg-danger-soft"><Icon name="delete" size={16} /> מחק</button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {!isEditing && p.projectDrawings.length > 0 && (
            <div className="mb-3 bg-neutral-50 border border-line-subtle rounded-lg px-3 py-2">
              <p className="text-[12px] font-semibold text-content-body mb-1.5"><Icon name="drawings" size={14} /> שרטוטים ומפרטים לצירוף להצעה זו</p>
              <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                {p.projectDrawings.map((d: any) => {
                  const on = (p.quoteDrawings[q.id] || []).includes(d.id);
                  const isSpec = d.file_type === 'spec';
                  return (
                    <label key={d.id} className="flex items-center gap-1.5 text-[12px] text-content-body cursor-pointer">
                      <input type="checkbox" checked={on} onChange={() => p.toggleQuoteDrawing(q.id, d.id)} />
                      {isSpec
                        ? <span className="font-medium text-warning"><Icon name="spec" size={14} /> מפרט</span>
                        : <span dir="ltr" className="font-medium"><Icon name="drawings" size={14} /> {d.drawing_number || '?'}</span>}
                      <span className="text-neutral-400 truncate max-w-[160px]">{d.file_name}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {!isEditing && items.length > 0 && <QuoteSummaryPanel q={q} items={items} p={p} />}
          {!isEditing && q.status !== 'draft' && <QuoteViewsPanel quoteId={q.id} />}
          {q.notes ? (
            <div className="flex items-start gap-2 mb-3">
              <p className="text-[12px] text-content-muted flex-1"><Icon name="pin" size={14} /> {q.notes}</p>
              <button
                onClick={async () => { const v = prompt('ערוך הערה (השאר ריק כדי למחוק):', q.notes || ''); if (v !== null) await p.setQuoteNotes(q.id, v); }}
                className="text-[11px] text-neutral-400 hover:text-content-body px-1"
                title="ערוך"
              ><Icon name="edit" size={16} /></button>
              <button
                onClick={async () => { if (confirm('למחוק את ההערה?')) await p.setQuoteNotes(q.id, ''); }}
                className="text-[11px] text-danger hover:text-danger px-1"
                title="מחק"
              ><Icon name="delete" size={16} /></button>
            </div>
          ) : q.status === 'draft' && (
            <button
              onClick={async () => { const v = prompt('הוסף הערה:', ''); if (v?.trim()) await p.setQuoteNotes(q.id, v); }}
              className="text-[11px] text-neutral-400 hover:text-primary mb-3"
            >+ הוסף הערה</button>
          )}

          {isEditing ? (
            <QuoteItemsEditor q={q} p={p} />
          ) : items.length > 0 ? (
            <QuoteItemsDisplay q={q} items={items} p={p} />
          ) : (
            <p className="text-sm text-neutral-400 text-center py-2">אין פריטים. לחץ &quot;ערוך פריטים&quot; להוסיף.</p>
          )}
        </div>
      )}
      {editTermsQuoteId === q.id && (
        <ContractTermsModal q={q} p={p} onClose={() => setEditTermsQuoteId(null)} />
      )}
      {showReject && (
        <RejectQuoteModal q={q} p={p} onClose={() => setShowReject(false)} />
      )}
    </div>
  );
}

// Captures WHY a quote was lost — feeds win-rate analysis later.
const SUPERSEDED_REASON = 'נשלחה הצעה מעודכנת במקום';
const LOST_REASONS = ['מחיר גבוה', 'מתחרה זכה', SUPERSEDED_REASON, 'המכרז בוטל', 'הפרויקט נדחה/הוקפא', 'אחר'];

function RejectQuoteModal({ q, p, onClose }: { q: any; p: ReturnType<typeof usePricing>; onClose: () => void }) {
  const [reason, setReason] = useState(LOST_REASONS[0]);
  const [competitor, setCompetitor] = useState('');
  const [replacementId, setReplacementId] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  // Other quotes on this project — offered as the replacement when this one was
  // superseded by an updated quote.
  const otherQuotes = (p.quotes || []).filter((x: any) => x.id !== q.id);

  async function save() {
    setSaving(true);
    try {
      const parts = [reason];
      if (reason === 'מתחרה זכה' && competitor.trim()) parts.push(`מתחרה: ${competitor.trim()}`);
      if (reason === SUPERSEDED_REASON && replacementId) {
        const rep = otherQuotes.find((x: any) => x.id === replacementId);
        if (rep) parts.push(`במקום: ${rep.quote_number}`);
      }
      if (note.trim()) parts.push(note.trim());
      await p.updateQuoteStatus(q.id, 'rejected', { lost_reason: parts.join(' · ') });
      onClose();
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-[92vw] max-w-[400px]" onClick={(e) => e.stopPropagation()} dir="rtl">
        <div className="px-4 py-3 border-b border-line-subtle flex items-center justify-between">
          <h3 className="text-base font-bold text-content-strong">סימון הצעה כנדחתה — {q.quote_number}</h3>
          <button onClick={onClose} className="text-neutral-400 hover:text-content-body"><Icon name="close" size={18} /></button>
        </div>
        <div className="p-4 space-y-3">
          <div>
            <label className="block text-[12px] font-medium text-content-body mb-1">למה הפסדנו?</label>
            <select value={reason} onChange={(e) => setReason(e.target.value)} className="w-full text-[13px] border border-line-subtle rounded-lg px-2 py-1.5">
              {LOST_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          {reason === 'מתחרה זכה' && (
            <div>
              <label className="block text-[12px] font-medium text-content-body mb-1">שם המתחרה (אם ידוע)</label>
              <input value={competitor} onChange={(e) => setCompetitor(e.target.value)} className="w-full text-[13px] border border-line-subtle rounded-lg px-2 py-1.5" />
            </div>
          )}
          {reason === SUPERSEDED_REASON && (
            <div>
              <label className="block text-[12px] font-medium text-content-body mb-1">איזו הצעה נשלחה במקום? (אופציונלי)</label>
              <select value={replacementId} onChange={(e) => setReplacementId(e.target.value)} className="w-full text-[13px] border border-line-subtle rounded-lg px-2 py-1.5">
                <option value="">— בחר הצעה —</option>
                {otherQuotes.map((x: any) => (
                  <option key={x.id} value={x.id}>{x.quote_number}{x.client_name ? ` · ${x.client_name}` : ''}</option>
                ))}
              </select>
              {otherQuotes.length === 0 && <p className="text-[11px] text-neutral-400 mt-1">אין הצעה אחרת בפרויקט. שכפל את ההצעה קודם כדי ליצור גרסה מעודכנת.</p>}
            </div>
          )}
          <div>
            <label className="block text-[12px] font-medium text-content-body mb-1">הערה (אופציונלי)</label>
            <input value={note} onChange={(e) => setNote(e.target.value)} className="w-full text-[13px] border border-line-subtle rounded-lg px-2 py-1.5" placeholder="למשל: פער של 12% מהזוכה" />
          </div>
          <button onClick={save} disabled={saving} className="w-full bg-danger text-white text-sm font-semibold py-2 rounded-lg hover:opacity-90 disabled:opacity-50">
            {saving ? 'שומר…' : 'סמן כנדחתה'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ContractTermsModal({ q, p, onClose }: { q: any; p: ReturnType<typeof usePricing>; onClose: () => void }) {
  const [sections, setSections] = useState<{ title: string; clauses: { num: number; text: string }[] }[] | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      if (q.contract_overrides && Array.isArray(q.contract_overrides) && q.contract_overrides.length) {
        setSections(q.contract_overrides);
      } else if (q.contract_template_id) {
        const tpl = await p.fetchTemplateContent(q.contract_template_id);
        setSections(tpl?.content || []);
      } else {
        setSections([]);
      }
    })();
  }, [q.id]); // eslint-disable-line react-hooks/exhaustive-deps

  function updateClause(si: number, ci: number, text: string) {
    setSections((prev) => prev?.map((s, i) => i === si ? { ...s, clauses: s.clauses.map((c, j) => j === ci ? { ...c, text } : c) } : s) || []);
  }
  function updateTitle(si: number, title: string) {
    setSections((prev) => prev?.map((s, i) => i === si ? { ...s, title } : s) || []);
  }
  function deleteClause(si: number, ci: number) {
    setSections((prev) => prev?.map((s, i) => i === si ? { ...s, clauses: s.clauses.filter((_, j) => j !== ci) } : s) || []);
  }
  function addClause(si: number) {
    setSections((prev) => prev?.map((s, i) => {
      if (i !== si) return s;
      const nextNum = s.clauses.length ? Math.max(...s.clauses.map((c) => c.num)) + 1 : 1;
      return { ...s, clauses: [...s.clauses, { num: nextNum, text: '' }] };
    }) || []);
  }
  function deleteSection(si: number) {
    if (!confirm('למחוק את הפרק וכל סעיפיו?')) return;
    setSections((prev) => prev?.filter((_, i) => i !== si) || []);
  }
  function addSection() {
    setSections((prev) => [...(prev || []), { title: 'פרק חדש', clauses: [] }]);
  }
  function moveSection(si: number, dir: -1 | 1) {
    setSections((prev) => {
      if (!prev) return prev;
      const next = [...prev];
      const j = si + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[si], next[j]] = [next[j], next[si]];
      return next;
    });
  }
  async function save() {
    if (!sections) return;
    setSaving(true);
    await p.setQuoteContractOverrides(q.id, sections);
    setSaving(false);
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-[95vw] max-w-[900px] max-h-[90vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()} dir="rtl">
        <div className="px-5 py-3 border-b border-line-subtle flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-content-strong"><Icon name="contract" size={18} /> עריכת תנאי הסכם להצעה {q.quote_number}</h3>
            <p className="text-[11px] text-content-muted">השינויים נשמרים רק על הצעה זו (לא משנים את התבנית).</p>
          </div>
          <button onClick={onClose} className="text-neutral-400 hover:text-content-body text-2xl leading-none">×</button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {sections === null && <p className="text-sm text-neutral-400 text-center py-6">טוען…</p>}
          {sections && sections.length === 0 && <p className="text-sm text-neutral-400 text-center py-6">אין פרקים עדיין. לחץ "+ הוסף פרק" כדי להתחיל.</p>}
          {sections?.map((s, si) => (
            <div key={si} className="border border-line-subtle rounded-lg p-3 bg-neutral-50">
              <div className="flex items-center gap-2 mb-2">
                <input value={s.title} onChange={(e) => updateTitle(si, e.target.value)} className="flex-1 border border-line-subtle rounded-lg px-3 py-1.5 text-sm font-semibold bg-white" />
                <button onClick={() => moveSection(si, -1)} disabled={si === 0} className="text-[11px] bg-white border border-line-subtle px-2 py-1 rounded hover:bg-neutral-50 disabled:opacity-30">↑</button>
                <button onClick={() => moveSection(si, 1)} disabled={si === (sections?.length || 0) - 1} className="text-[11px] bg-white border border-line-subtle px-2 py-1 rounded hover:bg-neutral-50 disabled:opacity-30">↓</button>
                <button onClick={() => deleteSection(si)} className="text-[11px] text-danger hover:text-danger px-2"><Icon name="delete" size={16} /></button>
              </div>
              <div className="space-y-2">
                {s.clauses.map((c, ci) => (
                  <div key={ci} className="flex gap-2 items-start">
                    <span className="text-[12px] font-bold text-navy-700 pt-2 min-w-[24px]">{c.num}.</span>
                    <textarea value={c.text} onChange={(e) => updateClause(si, ci, e.target.value)} rows={2} className="flex-1 border border-line-subtle rounded-lg px-3 py-1.5 text-[12px] text-content-body bg-white leading-relaxed resize-y" />
                    <button onClick={() => deleteClause(si, ci)} className="text-danger hover:text-danger text-lg pt-1">×</button>
                  </div>
                ))}
                <button onClick={() => addClause(si)} className="text-[11px] text-primary hover:underline">+ הוסף סעיף</button>
              </div>
            </div>
          ))}
          {sections !== null && (
            <button onClick={addSection} className="w-full text-sm border-2 border-dashed border-line-strong rounded-lg py-2 text-content-muted hover:bg-neutral-50">+ הוסף פרק</button>
          )}
        </div>
        <div className="px-5 py-3 border-t border-line-subtle flex items-center justify-between">
          <p className="text-[11px] text-neutral-400">ההצעה תציג את התנאים העדכניים שתשמור.</p>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="text-sm text-content-muted px-4 py-1.5 rounded-lg hover:bg-neutral-100">ביטול</button>
            <button onClick={save} disabled={saving || sections === null} className="text-sm bg-primary text-white px-4 py-1.5 rounded-lg hover:bg-primary-700 disabled:opacity-50">{saving ? 'שומר…' : 'שמור'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function QuoteItemsEditor({ q, p }: { q: any; p: ReturnType<typeof usePricing> }) {
  const [bulkProfit, setBulkProfit] = useState('');
  const dnd = useRowDnd(p.reorderEditingItems);
  const subtotal = p.editingItems.reduce((s, i) => {
    const qty = parseFloat(i.quantity) || 0;
    const up = parseFloat(i.unit_price) || 0;
    return s + qty * up;
  }, 0);
  const totalAfterDisc = p.editingItems.reduce((s, i) => s + (parseFloat(i.total_price) || 0), 0);
  const totalCost = p.editingItems.reduce((s, i) => s + ((parseFloat(i.cost_price) || 0) * (parseFloat(i.quantity) || 0)), 0);
  const diffPct = totalCost > 0 ? ((totalAfterDisc - totalCost) / totalCost) * 100 : 0;
  const hasAnyDiscount = p.editingItems.some((i) => parseFloat(i.discount_pct) > 0);

  function applyBulk(category: 'pipe' | 'accessory' | 'all') {
    const pct = parseFloat(bulkProfit);
    if (isNaN(pct)) return;
    p.bulkSetProfit(category, pct);
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap bg-neutral-50 border border-line-subtle rounded-lg px-3 py-2">
        <span className="text-[12px] font-semibold text-content-body">החל רווח</span>
        <input
          type="number"
          value={bulkProfit}
          onChange={(e) => setBulkProfit(e.target.value)}
          placeholder="%"
          className="w-16 border border-line-subtle rounded px-2 py-1 text-[12px] text-center"
        />
        <span className="text-[12px] text-content-muted">% על:</span>
        <button onClick={() => applyBulk('pipe')} disabled={bulkProfit === ''} className="text-[12px] bg-white border border-primary text-primary px-3 py-1 rounded-lg hover:bg-primary-50 disabled:opacity-40 disabled:cursor-not-allowed">צנרת</button>
        <button onClick={() => applyBulk('accessory')} disabled={bulkProfit === ''} className="text-[12px] bg-white border border-primary text-primary px-3 py-1 rounded-lg hover:bg-primary-50 disabled:opacity-40 disabled:cursor-not-allowed">אביזרים</button>
        <button onClick={() => applyBulk('all')} disabled={bulkProfit === ''} className="text-[12px] bg-white border border-line-strong text-content-body px-3 py-1 rounded-lg hover:bg-neutral-100 disabled:opacity-40 disabled:cursor-not-allowed">הכל</button>
        <span className="text-[11px] text-neutral-400">(צינור קצר/רוקר נכלל באביזרים)</span>
      </div>
      <div className="overflow-x-auto">
        <div className="grid grid-cols-[18px_minmax(130px,1fr)_58px_50px_64px_56px_70px_58px_52px_74px_58px_54px_84px_54px_92px_26px_46px] gap-1 text-[11px] font-semibold text-content-muted px-1 min-w-[1120px]">
          <span></span><span>מוצר</span><span>קוטר</span><span>לחץ PN</span><span>קשיחות SN</span><span title="אורך יחידה במטרים">אורך יח׳</span><span>כמות</span><span title="כמות ÷ אורך יחידה">יחידות</span><span>יחידה</span><span>עלות ₪</span><span>תקורות%</span><span>רווח%</span><span>מחיר מכירה</span><span>הנחה%</span><span>סה״כ</span><span title="ייצור בישראל">🏭</span><span></span>
        </div>
        {p.editingItems.map((item, idx) => {
          const specFromProject = p.resolvePnSn(item.dn_size);
          return (
          <div key={idx}>
          <div
            className={`grid grid-cols-[18px_minmax(130px,1fr)_58px_50px_64px_56px_70px_58px_52px_74px_58px_54px_84px_54px_92px_26px_46px] gap-1 min-w-[1120px] rounded ${dnd.overIdx === idx ? 'ring-2 ring-primary ring-inset bg-primary-50' : ''}`}
            {...dnd.rowProps(idx)}
          >
            <DragHandle {...dnd.handleProps(idx)} />
            <AutoTextarea value={item.product_name} onChange={(v) => p.updateItem(idx, 'product_name', v)} placeholder="שם מוצר" className="border border-line-subtle rounded px-1.5 py-1 text-[12px] min-w-0 w-full" />
            <input type="text" value={item.dn_size || ''} onChange={(e) => p.updateItem(idx, 'dn_size', e.target.value)} placeholder="DN" className="border border-line-subtle rounded px-1.5 py-1 text-[12px] min-w-0" />
            <input type="number" value={item.pn ?? ''} onChange={(e) => p.updateItem(idx, 'pn', e.target.value)} placeholder={specFromProject.pn != null ? String(specFromProject.pn) : 'PN'} title="לחץ עבודה (בר) — נמשך מהמפרט לפי DN, ניתן לעריכה" className="border border-line-subtle rounded px-1 py-1 text-[12px] min-w-0 text-center" dir="ltr" />
            <input type="number" value={item.sn ?? ''} onChange={(e) => p.updateItem(idx, 'sn', e.target.value)} placeholder={specFromProject.sn != null ? String(specFromProject.sn) : 'SN'} title="קשיחות (פסקל) — נמשכת מהמפרט לפי DN, ניתנת לעריכה" className="border border-line-subtle rounded px-1 py-1 text-[12px] min-w-0 text-center" dir="ltr" />
            <input type="number" value={item.length_m ?? ''} onChange={(e) => p.updateItem(idx, 'length_m', e.target.value)} placeholder="מ׳" title="אורך יחידה במטרים (למשל 5.7)" className="border border-line-subtle rounded px-1 py-1 text-[12px] min-w-0 text-center" dir="ltr" />
            <input type="number" value={item.quantity || ''} onChange={(e) => p.updateItem(idx, 'quantity', e.target.value)} title="כמות כללית (מטרים / יחידות)" className="border border-line-subtle rounded px-1 py-1 text-[12px] min-w-0" />
            {(() => {
              const len = parseFloat(item.length_m) || 0;
              const qty = parseFloat(item.quantity) || 0;
              const units = len > 0 ? qty / len : 0;
              const rounded = Math.round(units * 100) / 100;
              const frac = len > 0 && qty > 0 && Math.abs(units - Math.round(units)) > 0.001;
              const commit = (raw: string) => {
                const u = parseFloat(raw);
                if (!isNaN(u) && u >= 0 && len > 0) {
                  p.updateItem(idx, 'quantity', Math.round(u * len * 100) / 100);
                }
              };
              return (
                <input
                  // Free typing; committed on blur/Enter. The key remounts the
                  // field with the fresh derived value when qty/length change
                  // from outside (typing in the quantity field etc.).
                  key={`units-${item.length_m}-${item.quantity}`}
                  type="number"
                  defaultValue={len > 0 && qty > 0 ? rounded : ''}
                  disabled={!(len > 0)}
                  onBlur={(e) => commit(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                  placeholder={len > 0 ? '' : '—'}
                  title={frac ? 'שברי יחידות — הכמות הכללית אינה כפולה שלמה של אורך היחידה' : 'מספר יחידות — הקלד ועבור שדה (או Enter) לעדכון הכמות הכללית'}
                  className={`border rounded px-1 py-1 text-[12px] min-w-0 text-center ${frac ? 'border-danger text-danger font-bold bg-danger-soft' : 'border-line-subtle'} ${len > 0 ? '' : 'bg-neutral-50 text-neutral-300'}`}
                  dir="ltr"
                />
              );
            })()}
            <input type="text" value={item.unit || 'מטר'} onChange={(e) => p.updateItem(idx, 'unit', e.target.value)} className="border border-line-subtle rounded px-1 py-1 text-[12px] min-w-0" />
            <input type="number" value={item.cost_price || ''} onChange={(e) => p.updateItem(idx, 'cost_price', e.target.value)} placeholder="₪" className="border border-line-subtle rounded px-1.5 py-1 text-[12px] min-w-0" />
            <input type="number" value={item.overheads_pct ?? ''} onChange={(e) => p.updateItem(idx, 'overheads_pct', e.target.value)} placeholder="%" className="border border-line-subtle rounded px-1 py-1 text-[12px] min-w-0" />
            <input type="number" value={item.profit_pct ?? ''} onChange={(e) => p.updateItem(idx, 'profit_pct', e.target.value)} placeholder="%" className="border border-line-subtle rounded px-1 py-1 text-[12px] min-w-0" />
            <input type="number" value={item.unit_price || ''} onChange={(e) => p.updateItem(idx, 'unit_price', e.target.value)} placeholder="₪" className="border border-line-subtle rounded px-1.5 py-1 text-[12px] min-w-0 bg-azure-100" />
            <input type="number" value={item.discount_pct || ''} onChange={(e) => p.updateItem(idx, 'discount_pct', e.target.value)} placeholder="%" className="border border-line-subtle rounded px-1 py-1 text-[12px] min-w-0 bg-warning-soft" />
            <span className="flex items-center text-[12px] font-medium text-content-body px-0.5 min-w-0 truncate" dir="ltr">{formatCurrency2(parseFloat(item.total_price) || 0)}</span>
            <button
              onClick={() => {
                const turningOn = !item.requires_production;
                p.updateItem(idx, 'requires_production', turningOn);
                if (turningOn && !item.production_input) p.updateItem(idx, 'production_input', item.product_name || '');
              }}
              title={item.requires_production ? 'מסומן: ייצור בישראל — לחץ לביטול' : 'סמן: שורה זו דורשת ייצור בישראל'}
              className={`rounded flex items-center justify-center ${item.requires_production ? 'bg-primary text-white' : 'bg-neutral-100 text-neutral-400 hover:text-primary'}`}
            >
              <Icon name="production" size={14} />
            </button>
            <div className="flex items-center justify-center gap-1">
              <button onClick={() => p.duplicateEditingItem(idx)} title="שכפל שורה" className="text-neutral-400 hover:text-primary"><Icon name="copy" size={14} /></button>
              <button onClick={() => p.removeEditingItem(idx)} title="מחק שורה" className="text-danger hover:text-danger text-lg">×</button>
            </div>
          </div>
          {item.requires_production && (
            <div className="flex flex-wrap items-center gap-1.5 bg-primary-50 border border-primary rounded-lg px-2 py-1.5 mb-1">
              <span className="text-primary"><Icon name="production" size={14} /></span>
              <span className="text-[11px] font-semibold text-primary whitespace-nowrap">ייצור בישראל:</span>
              <input
                value={item.production_input || ''}
                onChange={(e) => p.updateItem(idx, 'production_input', e.target.value)}
                placeholder="חומר גלם שנרכש (למשל: מחבר REKA DN800 רגיל)"
                className="flex-1 min-w-[180px] border border-line-subtle rounded px-1.5 py-1 text-[12px] bg-white"
              />
              <input
                value={item.production_notes || ''}
                onChange={(e) => p.updateItem(idx, 'production_notes', e.target.value)}
                placeholder="הערות עבודה למפעל (מה לעשות)"
                className="flex-1 min-w-[180px] border border-line-subtle rounded px-1.5 py-1 text-[12px] bg-white"
              />
            </div>
          )}
          </div>
          );
        })}
      </div>
      <div className="flex items-center justify-between pt-2">
        <button onClick={() => p.addEditingItem()} className="text-[12px] text-primary hover:underline">+ הוסף שורה</button>
        <div className="flex items-center gap-2">
          <span className="text-[12px] text-neutral-400">עלות: {formatCurrency(totalCost)}</span>
          {hasAnyDiscount && <span className="text-[12px] text-neutral-400">לפני הנחה: {formatCurrency(subtotal)}</span>}
          <span className="text-sm font-bold text-content-body">מכירה: {formatCurrency(totalAfterDisc)}</span>
          {totalCost > 0 && (
            <span className="text-[12px] font-semibold text-success bg-success-soft border border-success rounded px-2 py-0.5 whitespace-nowrap" title="אחוז ההפרש בין מחיר המכירה לעלות הישירה">
              פער מהעלות: +{diffPct.toFixed(1)}%
            </span>
          )}
          <button onClick={p.cancelEditQuote} className="text-sm text-content-muted px-3 py-1.5 rounded-lg hover:bg-neutral-100 transition-colors">ביטול</button>
          <button onClick={() => p.saveQuoteItems(q.id)} disabled={p.saving} className="text-sm bg-primary text-white px-4 py-1.5 rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50">{p.saving ? 'שומר...' : 'שמור'}</button>
        </div>
      </div>
    </div>
  );
}

function QuoteItemsDisplay({ q, items, p }: { q: any; items: any[]; p: ReturnType<typeof usePricing> }) {
  const linkedCost = q.cost_input_id ? p.costInputs.find((c) => c.id === q.cost_input_id) : null;
  const forexCurrency = linkedCost?.currency && linkedCost.currency !== 'ILS' ? linkedCost.currency : null;
  const forexRate = forexCurrency ? parseFloat(linkedCost.exchange_rate) || p.exchangeRates[forexCurrency]?.rate || 0 : 0;
  const forexSym = forexCurrency ? CURRENCY_SYMBOLS[forexCurrency] : '';
  const hasAnyDiscount = items.some((i: any) => parseFloat(i.discount_pct) > 0);
  const globalDisc = parseFloat(q.global_discount_pct) || 0;
  const subtotalBeforeDisc = items.reduce((s: number, i: any) => {
    const qty = parseFloat(i.quantity) || 0;
    const up = parseFloat(i.unit_price) || 0;
    return s + qty * up;
  }, 0);
  const totalAfterLineDisc = parseFloat(q.total_amount) || 0;
  const finalTotal = globalDisc > 0 ? Math.round(totalAfterLineDisc * (1 - globalDisc / 100) * 100) / 100 : totalAfterLineDisc;
  const colCount = hasAnyDiscount ? 14 : 13;

  return (
    <div className="overflow-x-auto rounded-lg border border-line-subtle">
      <table className="w-full text-sm border-collapse" style={{ minWidth: 900 }}>
        <colgroup>
          <col />
          <col style={{ width: '52px' }} />
          <col style={{ width: '56px' }} />
          <col style={{ width: '72px' }} />
          <col style={{ width: '58px' }} />
          <col style={{ width: '90px' }} />
          <col style={{ width: '56px' }} />
          <col style={{ width: '76px' }} />
          <col style={{ width: '62px' }} />
          <col style={{ width: '52px' }} />
          <col style={{ width: '82px' }} />
          {hasAnyDiscount && <col style={{ width: '58px' }} />}
          <col style={{ width: '88px' }} />
          <col style={{ width: '24px' }} />
        </colgroup>
        <thead>
          <tr className="bg-neutral-50 border-b border-line-subtle">
            <th className="text-right text-[11px] text-content-muted font-semibold py-2 px-2">מוצר</th>
            <th className="text-right text-[11px] text-content-muted font-semibold py-2 px-1 border-r border-line-subtle">קוטר</th>
            <th className="text-right text-[11px] text-content-muted font-semibold py-2 px-1 border-r border-line-subtle">לחץ (PN)</th>
            <th className="text-right text-[11px] text-content-muted font-semibold py-2 px-1 border-r border-line-subtle">קשיחות (SN)</th>
            <th className="text-right text-[11px] text-content-muted font-semibold py-2 px-1 border-r border-line-subtle" title="אורך יחידה במטרים">אורך יח׳</th>
            <th className="text-right text-[11px] text-content-muted font-semibold py-2 px-1 border-r border-line-subtle">כמות</th>
            <th className="text-right text-[11px] text-content-muted font-semibold py-2 px-1 border-r border-line-subtle" title="כמות ÷ אורך יחידה">יחידות</th>
            <th className="text-right text-[11px] text-content-muted font-semibold py-2 px-1 border-r border-line-subtle">עלות</th>
            <th className="text-right text-[11px] text-content-muted font-semibold py-2 px-1 border-r border-line-subtle">תקורות%</th>
            <th className="text-right text-[11px] text-content-muted font-semibold py-2 px-1 border-r border-line-subtle">רווח%</th>
            <th className="text-right text-[11px] text-content-muted font-semibold py-2 px-1 border-r border-line-subtle">מחיר מכירה</th>
            {hasAnyDiscount && <th className="text-right text-[11px] text-warning font-semibold py-2 px-1 border-r border-line-subtle">הנחה%</th>}
            <th className="text-right text-[11px] text-content-body font-semibold py-2 px-1 border-r border-line-subtle">סה״כ</th>
            <th className="py-2 w-6"></th>
          </tr>
        </thead>
        <tbody>
          {items.map((item: any) => {
            const cost = parseFloat(item.cost_price) || 0;
            const qty = parseFloat(item.quantity) || 0;
            const ohPct = parseFloat(item.overheads_pct) || 0;
            const prPct = parseFloat(item.profit_pct) || 0;
            const unit = parseFloat(item.unit_price) || 0;
            const tot = parseFloat(item.total_price) || 0;
            const disc = parseFloat(item.discount_pct) || 0;
            const costTot = cost * qty;
            const ohAmt = costTot * (ohPct / 100);
            const profitAmt = tot - costTot - ohAmt;
            const originalCost = forexRate > 0 ? cost / forexRate : 0;

            const tooltip = [
              forexCurrency && originalCost > 0 ? `מחיר מקורי: ${forexSym}${originalCost.toFixed(2)} × ${forexRate.toFixed(2)} = ₪${cost.toFixed(2)}` : `עלות ליחידה: ₪${cost.toFixed(2)}`,
              `× ${qty} ${item.unit} = ₪${costTot.toFixed(2)}`,
              `+ תקורות ${ohPct}% = ₪${ohAmt.toFixed(2)}`,
              `+ רווח ${prPct}% = ₪${profitAmt.toFixed(2)}`,
              disc > 0 ? `- הנחה ${disc}%` : null,
              `= מכירה: ₪${tot.toFixed(2)}`,
            ].filter(Boolean).join('\n');

            return (
              <tr key={item.id} className="border-b border-line-subtle hover:bg-azure-100 transition-colors">
                <td className="py-2 px-2 text-content-body text-[12px]">
                  <span title={item.product_name} className="block break-words text-right" dir="rtl">
                    {item.requires_production && <span className="text-primary" title={`ייצור בישראל${item.production_input ? ` — מתוך: ${item.production_input}` : ''}`}><Icon name="production" size={12} /> </span>}
                    {item.product_name}
                  </span>
                </td>
                <td className="py-2 px-1 text-content-body text-[12px] text-center border-r border-line-subtle whitespace-nowrap">{item.dn_size || '—'}</td>
                {(() => { const spec = parsePipeSpec(item.product_name, { pn: item.pn, sn: item.sn }); return (<>
                  <td className="py-2 px-1 text-content-body text-[12px] text-center border-r border-line-subtle whitespace-nowrap">{spec.pn || '—'}</td>
                  <td className="py-2 px-1 text-content-body text-[12px] text-center border-r border-line-subtle whitespace-nowrap">{fmtSn(spec.sn) || '—'}</td>
                </>); })()}
                {(() => {
                  const len = parseFloat(item.length_m) || 0;
                  const lenTxt = len > 0 ? (Number.isInteger(len) ? len.toFixed(1) : String(len)) : '—';
                  const units = len > 0 && qty > 0 ? Math.round((qty / len) * 100) / 100 : null;
                  const frac = units != null && Math.abs(units - Math.round(units)) > 0.001;
                  return (<>
                    <td className="py-2 px-1 text-content-body text-[12px] text-center border-r border-line-subtle whitespace-nowrap" dir="ltr">{lenTxt}</td>
                    <td className="py-2 px-1 text-content-body text-[12px] border-r border-line-subtle whitespace-nowrap">{item.quantity} {item.unit}</td>
                    <td className={`py-2 px-1 text-[12px] text-center border-r border-line-subtle whitespace-nowrap ${frac ? 'text-danger font-bold bg-danger-soft' : 'text-content-body'}`} dir="ltr" title={frac ? 'שברי יחידות — הכמות אינה כפולה שלמה של אורך היחידה' : undefined}>{units ?? '—'}</td>
                  </>);
                })()}
                <td className="py-2 px-1 text-content-body text-[12px] border-r border-line-subtle whitespace-nowrap">{formatCurrency(cost)}</td>
                <td className="py-2 px-1 text-content-muted text-[12px] text-center border-r border-line-subtle whitespace-nowrap">{item.overheads_pct}%</td>
                <td className="py-2 px-1 text-content-muted text-[12px] text-center border-r border-line-subtle whitespace-nowrap">{item.profit_pct}%</td>
                <td className="py-2 px-1 text-content-body text-[12px] border-r border-line-subtle whitespace-nowrap">{formatCurrency(unit)}</td>
                {hasAnyDiscount && <td className="py-2 px-1 text-warning text-[12px] font-medium text-center border-r border-line-subtle whitespace-nowrap">{disc > 0 ? `${disc}%` : '—'}</td>}
                <td className="py-2 px-1 font-semibold text-content-strong text-[12px] border-r border-line-subtle whitespace-nowrap">{formatCurrency(tot)}</td>
                <td className="py-2 text-center">
                  <span title={tooltip} className="cursor-help text-neutral-300 hover:text-primary text-[13px]"><Icon name="info" size={14} /></span>
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          {(hasAnyDiscount || globalDisc > 0) && (
            <tr className="border-t border-line-subtle bg-neutral-50">
              <td colSpan={colCount - 2} className="py-1.5 px-2 text-left text-[12px] text-neutral-400"></td>
              <td className="py-1.5 px-1 text-right text-[12px] text-content-muted border-r border-line-subtle">סה״כ לפני הנחה</td>
              <td className="py-1.5 px-1 text-[12px] text-content-muted whitespace-nowrap">{formatCurrency(subtotalBeforeDisc)}</td>
            </tr>
          )}
          {hasAnyDiscount && (
            <tr className="bg-warning-soft">
              <td colSpan={colCount - 2} className="py-1 px-2 text-left text-[12px] text-neutral-400"></td>
              <td className="py-1 px-1 text-right text-[12px] text-warning border-r border-line-subtle">הנחות שורה</td>
              <td className="py-1 px-1 text-[12px] text-warning whitespace-nowrap">-{formatCurrency(subtotalBeforeDisc - totalAfterLineDisc)}</td>
            </tr>
          )}
          {globalDisc > 0 && (
            <tr className="bg-warning-soft">
              <td colSpan={colCount - 2} className="py-1 px-2 text-left text-[12px] text-neutral-400"></td>
              <td className="py-1 px-1 text-right text-[12px] text-warning border-r border-line-subtle">הנחה כללית {globalDisc}%</td>
              <td className="py-1 px-1 text-[12px] text-warning whitespace-nowrap">-{formatCurrency(totalAfterLineDisc - finalTotal)}</td>
            </tr>
          )}
          <tr className="border-t-2 border-line-subtle bg-neutral-50">
            <td colSpan={5} className="py-2 px-2 text-right text-[12px] text-neutral-400">
              עלות: {formatCurrency(q.total_cost || 0)}
              {(q.total_cost || 0) > 0 && (
                <span className="mr-2 font-semibold text-success" title="אחוז ההפרש בין מחיר המכירה לעלות הישירה">
                  · פער מהעלות +{(((finalTotal - q.total_cost) / q.total_cost) * 100).toFixed(1)}%
                </span>
              )}
            </td>
            <td colSpan={colCount - 7} className="py-2 px-1 text-right font-bold text-content-body">סה״כ מכירה</td>
            <td className="py-2 px-1 font-bold text-primary text-[13px] whitespace-nowrap">{formatCurrency(finalTotal)}</td>
            <td className="py-2"></td>
          </tr>
        </tfoot>
      </table>
      <div className="mt-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[11px] font-semibold text-content-body">הערות משפטיות:</span>
          <button onClick={() => { if (confirm('לרענן מתבנית ברירת המחדל?')) p.refreshDisclaimer(q.id); }} className="text-[10px] text-azure hover:text-azure-600 hover:underline"><Icon name="refresh" size={12} /> רענן מתבנית</button>
        </div>
        <textarea
          value={q.disclaimer_text || ''}
          onChange={(e) => p.setQuoteField(q.id, 'disclaimer_text', e.target.value)}
          onBlur={(e) => p.updateDisclaimerText(q.id, e.target.value)}
          className="w-full border border-line-subtle rounded-lg px-3 py-2 text-[11px] text-content-body bg-neutral-50 focus:outline-none focus:ring-2 focus:ring-primary-100 min-h-[80px] resize-y leading-relaxed"
        />
      </div>
      <div className="mt-3">
        <span className="text-[11px] font-semibold text-content-body">תנאי תשלום:</span>
        <textarea
          rows={2}
          value={q.payment_terms || ''}
          onChange={(e) => p.setQuoteField(q.id, 'payment_terms', e.target.value)}
          onBlur={(e) => p.updatePaymentTerms(q.id, e.target.value)}
          className="w-full border border-line-subtle rounded-lg px-3 py-1.5 text-[11px] text-content-body bg-neutral-50 focus:outline-none focus:ring-2 focus:ring-primary-100 mt-1 resize-y leading-relaxed whitespace-pre-wrap"
          placeholder="40% מקדמה, יתרה שוטף +30"
        />
        {/* Billing-trigger anchor — drives the automatic billing alerts (cron 9a-9c). */}
        <div className="flex flex-wrap items-center gap-2 mt-1.5 text-[11px]">
          <span className="font-semibold text-content-body">עוגן חיוב:</span>
          <select
            value={q.billing_trigger || 'auto'}
            onChange={async (e) => {
              p.setQuoteField(q.id, 'billing_trigger', e.target.value);
              await createClient().from('quotes').update({ billing_trigger: e.target.value }).eq('id', q.id);
            }}
            className="border border-line-subtle rounded px-2 py-0.5 text-[11px] bg-white"
          >
            <option value="auto">אוטומטי — זוהה: {BILLING_ANCHOR_LABELS[detectBillingAnchor(q.payment_terms)]}</option>
            <option value="delivery">אספקה ללקוח</option>
            <option value="port_arrival">הגעה לנמל</option>
          </select>
          {(() => { const pct = effectiveAdvancePct(q); return pct ? <span className="text-content-muted">מקדמה שזוהתה: {pct}%</span> : null; })()}
        </div>
      </div>
      <div className="mt-3">
        <span className="text-[11px] font-semibold text-content-body">זמן אספקה:</span>
        <textarea
          rows={2}
          value={q.delivery_time || ''}
          onChange={(e) => p.setQuoteField(q.id, 'delivery_time', e.target.value)}
          onBlur={(e) => p.updateDeliveryTime(q.id, e.target.value)}
          className="w-full border border-line-subtle rounded-lg px-3 py-1.5 text-[11px] text-content-body bg-neutral-50 focus:outline-none focus:ring-2 focus:ring-primary-100 mt-1 resize-y leading-relaxed whitespace-pre-wrap"
          placeholder="70 ימי עבודה מיום סגירת הזמנה..."
        />
      </div>
      {q.cost_input_id && (
        <p className="mt-1 text-[11px] text-azure cursor-pointer hover:underline" onClick={(e) => { e.stopPropagation(); p.setPricingTab('costs'); p.setExpandedCostInput(q.cost_input_id); }}><Icon name="link" size={14} /> מקושר לתמחור</p>
      )}
      {(() => {
        const qAtts = p.attachments.filter((a) => a.entity_type === 'quote' && a.entity_id === q.id);
        if (qAtts.length === 0) return null;
        return (
          <div className="mt-3 border-t border-line-subtle pt-2">
            <span className="text-[11px] font-semibold text-content-body"><Icon name="attach" size={14} /> שרטוטים ומסמכים ({qAtts.length}):</span>
            <div className="flex flex-wrap gap-2 mt-1">
              {qAtts.map((a: any) => (
                <div key={a.id} className="flex items-center gap-1 bg-primary-50 rounded px-2 py-1 text-[11px] text-primary">
                  <button onClick={() => {
                    let path = a.file_url;
                    if (path.startsWith('http')) {
                      const m = path.match(/project-files\/(.+)$/);
                      if (m) path = m[1];
                    }
                    const newWin = window.open('about:blank', '_blank');
                    const sb = createClient();
                    sb.storage.from('project-files').createSignedUrl(path, 300).then(({ data, error }) => {
                      if (error || !data?.signedUrl) { if (newWin) newWin.close(); alert(`לא הצלחתי לפתוח את הקובץ: ${error?.message || ''}`); return; }
                      if (newWin) newWin.location.href = data.signedUrl;
                      else window.location.href = data.signedUrl;
                    });
                  }} className="hover:underline truncate max-w-[180px] cursor-pointer">{a.file_name}</button>
                  <button onClick={() => { if (confirm('למחוק קובץ זה?')) p.deleteAttachment(a.id); }} className="text-danger hover:text-danger mr-1">×</button>
                </div>
              ))}
            </div>
          </div>
        );
      })()}
    </div>
  );
}

function QuoteSummaryPanel({ q, items, p }: { q: any; items: any[]; p: ReturnType<typeof usePricing> }) {
  const priced: QuoteLineItemPriced[] = items.map((it) => {
    const lineItem: QuoteLineItem = {
      item_type: it.item_type ?? undefined,
      product_name: it.product_name,
      dn_size: it.dn_size ?? undefined,
      quantity: parseFloat(it.quantity) || 0,
      unit: it.unit || 'מטר',
      cost_price: parseFloat(it.cost_price) || 0,
      overheads_pct: parseFloat(it.overheads_pct) || 0,
      profit_pct: parseFloat(it.profit_pct) || 0,
      length_m: parseFloat(it.length_m) || undefined,
    };
    if (it.unit_price && parseFloat(it.unit_price) > 0) {
      const cost = lineItem.cost_price * lineItem.quantity;
      const overheads = cost * (lineItem.overheads_pct / 100);
      const selling = parseFloat(it.unit_price) * lineItem.quantity;
      const profit = selling - cost - overheads;
      const margin = selling > 0 ? (profit / selling) * 100 : 0;
      return {
        ...lineItem,
        unit_price: parseFloat(it.unit_price),
        total_price: Math.round(selling * 100) / 100,
        overheads_amount: Math.round(overheads * 100) / 100,
        profit_amount: Math.round(profit * 100) / 100,
        margin_pct: Math.round(margin * 100) / 100,
      };
    }
    return calcItemPrice(lineItem);
  });

  const summary = calcQuoteSummary(priced);
  const warnings = validateQuoteMargins(priced);

  const linkedCost = q.cost_input_id ? p.costInputs.find((c) => c.id === q.cost_input_id) : null;
  const forexCurrency = linkedCost?.currency && linkedCost.currency !== 'ILS' ? linkedCost.currency : null;
  const forexRate = forexCurrency ? parseFloat(linkedCost.exchange_rate) || p.exchangeRates[forexCurrency]?.rate || 0 : 0;
  const forexSym = forexCurrency ? CURRENCY_SYMBOLS[forexCurrency] : '';
  const sellingForex = forexRate > 0 ? summary.totalSelling / forexRate : 0;

  return (
    <div className="mb-3 bg-neutral-50 rounded-lg p-3 space-y-2">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px]">
        <span className="text-content-muted">עלות: <strong className="text-content-body">{formatCurrency(summary.totalCost)}</strong></span>
        <span className="text-content-muted">תקורות: <strong className="text-content-body">{formatCurrency(summary.totalOverheads)}</strong></span>
        <span className="text-content-muted">רווח: <strong className="text-success">{formatCurrency(summary.totalProfit)}</strong></span>
        <span className="text-content-muted">מכירה: <strong className="text-content-body">{formatCurrency(summary.totalSelling)}</strong></span>
        <span className={`font-bold ${summary.avgMarginPct < 10 ? 'text-danger' : summary.avgMarginPct > 60 ? 'text-warning' : 'text-success'}`}>
          מרווח ממוצע: {summary.avgMarginPct.toFixed(1)}%
        </span>
        {forexCurrency && forexRate > 0 && (
          <span className="text-azure-600">
            ≈ {forexSym}{sellingForex.toLocaleString('he-IL', { maximumFractionDigits: 0 })} @ {forexRate.toFixed(2)}
          </span>
        )}
      </div>

      {Object.keys(summary.byCategory).length > 1 && (
        <div className="flex flex-wrap gap-1.5 pt-1 border-t border-line-subtle">
          {Object.entries(summary.byCategory).map(([cat, v]) => {
            const pct = summary.totalSelling > 0 ? (v.selling / summary.totalSelling) * 100 : 0;
            return (
              <span key={cat} className="text-[11px] bg-white border border-line-subtle rounded-full px-2 py-0.5 text-content-body">
                <strong className="text-content-body">{cat}</strong>
                <span className="mx-1 text-neutral-300">·</span>
                <span>{formatCurrency(v.selling)}</span>
                <span className="text-neutral-400 ml-1">({pct.toFixed(0)}%)</span>
              </span>
            );
          })}
        </div>
      )}

      {warnings.length > 0 && (
        <div className="flex flex-wrap gap-1 pt-1 border-t border-line-subtle">
          {warnings.map((w, i) => {
            const { bg, icon, msg } = WARNING_STYLE[w.issue];
            return (
              <span key={i} className={`text-[11px] rounded px-2 py-0.5 ${bg}`}>
                <Icon name={icon} size={14} /> <strong>{w.product_name || `שורה ${w.index + 1}`}</strong>
                <span className="mx-1">—</span>
                <span>{msg}{w.issue !== 'zero_cost' ? ` (${w.margin_pct.toFixed(1)}%)` : ''}</span>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

const WARNING_STYLE: Record<'low_margin' | 'high_margin' | 'zero_cost', { bg: string; icon: IconName; msg: string }> = {
  low_margin:  { bg: 'bg-danger-soft text-danger border border-danger',     icon: 'warning' as IconName, msg: 'מרווח נמוך מ-10%' },
  high_margin: { bg: 'bg-warning-soft text-warning border border-warning', icon: 'zap' as IconName, msg: 'מרווח גבוה מ-60%' },
  zero_cost:   { bg: 'bg-primary-50 text-primary border border-primary', icon: 'search' as IconName, msg: 'עלות אפס' },
};

function OrdersTab({ p, projectId }: { p: ReturnType<typeof usePricing>; projectId: string }) {
  if (p.orders.length === 0) {
    return <p className="text-sm text-neutral-400 text-center py-3">אין הזמנות. הזמנות נוצרות אוטומטית כשהצעת מחיר נחתמת.</p>;
  }

  return (
    <div className="space-y-3">
      {p.orders.map((ord) => {
        const ost = ORDER_STATUS_MAP[ord.status] || ORDER_STATUS_MAP.pending;
        const linkedQuote = p.quotes.find((q) => q.id === ord.quote_id);
        return (
          <div key={ord.id} className="border border-line-subtle rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <span className="text-sm font-mono text-neutral-400">{ord.order_number}</span>
                <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${ost.color}`}>{ost.label}</span>
              </div>
              <span className="text-sm font-bold text-content-body">{formatCurrency(ord.total_amount || 0)}</span>
            </div>
            {linkedQuote && (
              <p className="text-[12px] text-azure mb-2 cursor-pointer hover:underline" onClick={() => { p.setPricingTab('quotes'); p.setExpandedQuote(linkedQuote.id); }}>
                <Icon name="link" size={14} /> הצעה: {linkedQuote.quote_number} — {linkedQuote.client_name}
              </p>
            )}
            <div className="flex items-center gap-2 text-[12px] text-content-muted mb-3">
              <span>מקדמה {ord.advance_percent}%: {ord.advance_paid ? <><Icon name="success" size={14} /> שולם</> : <><Icon name="pending" size={14} /> טרם שולם</>}</span>
              <span className="text-neutral-300">|</span>
              <span>יתרה: {ord.balance_paid ? <><Icon name="success" size={14} /> שולם</> : <><Icon name="pending" size={14} /> טרם שולם</>}</span>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {ord.status === 'pending' && (
                <button onClick={() => p.updateOrderStatus(ord.id, 'confirmed')} className="text-[12px] bg-azure-100 text-azure-600 px-3 py-1 rounded-lg hover:bg-azure-100 transition-colors"><Icon name="success" size={16} /> אשר הזמנה</button>
              )}
              {ord.status === 'confirmed' && (
                <button onClick={() => p.updateOrderStatus(ord.id, 'in_production')} className="text-[12px] bg-primary-50 text-primary px-3 py-1 rounded-lg hover:bg-primary-50 transition-colors"><Icon name="production" size={16} /> בייצור</button>
              )}
              {ord.status === 'in_production' && (
                <button onClick={() => p.updateOrderStatus(ord.id, 'delivered')} className="text-[12px] bg-success-soft text-success px-3 py-1 rounded-lg hover:bg-success-soft transition-colors"><Icon name="truck" size={16} /> סופק</button>
              )}
              {ord.status === 'delivered' && (
                <button onClick={() => p.updateOrderStatus(ord.id, 'completed')} className="text-[12px] bg-neutral-100 text-content-body px-3 py-1 rounded-lg hover:bg-neutral-200 transition-colors"><Icon name="confirm" size={16} /> הושלם</button>
              )}
            </div>
            {ord.notes && <p className="text-[12px] text-content-muted mt-2"><Icon name="pin" size={14} /> {ord.notes}</p>}
            <OrderDocs orderId={ord.id} projectId={projectId} />
          </div>
        );
      })}
    </div>
  );
}

// Order-confirmation documents, attached per customer order. Self-contained
// (own fetch/upload/open/delete) — file_type='order_confirmation',
// entity_type='order' keeps them out of the drawings/specs/quote surfaces.
function OrderDocs({ orderId, projectId }: { orderId: string; projectId: string }) {
  const supabase = createClient();
  const [docs, setDocs] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);

  async function load() {
    const { data } = await supabase.from('attachments')
      .select('id, file_name, file_url, created_at')
      .eq('entity_type', 'order').eq('entity_id', orderId).eq('file_type', 'order_confirmation')
      .order('created_at', { ascending: false });
    setDocs(data || []);
  }
  useEffect(() => { load(); }, [orderId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function upload(file: File) {
    setUploading(true);
    try {
      const ext = file.name.split('.').pop() || 'file';
      const path = `${projectId}/orders/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from('project-files').upload(path, file);
      if (upErr) { alert(`שגיאת העלאה: ${upErr.message}`); return; }
      const { error: insErr } = await supabase.from('attachments').insert({
        entity_type: 'order', entity_id: orderId, project_id: projectId,
        file_name: file.name, file_url: path, file_type: 'order_confirmation', file_size_bytes: file.size,
      });
      if (insErr) { alert(`שגיאה: ${insErr.message}`); return; }
      await load();
    } finally { setUploading(false); }
  }

  function openFile(path: string) {
    if (/^https?:/.test(path)) { window.open(path, '_blank'); return; }
    const w = window.open('about:blank', '_blank');
    supabase.storage.from('project-files').createSignedUrl(path, 3600).then(({ data, error }) => {
      if (error || !data?.signedUrl) { if (w) w.close(); alert('לא ניתן לפתוח את הקובץ'); return; }
      if (w) w.location.href = data.signedUrl; else window.location.href = data.signedUrl;
    });
  }

  async function del(id: string, name: string) {
    if (!confirm(`למחוק את ${name}?`)) return;
    await supabase.from('attachments').delete().eq('id', id);
    await load();
  }

  return (
    <div className="mt-3 pt-3 border-t border-line-subtle">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[12px] font-semibold text-content-muted"><Icon name="attach" size={14} /> אישור הזמנת לקוח (חתום){docs.length > 0 ? ` (${docs.length})` : ''}</span>
        <label className={`text-[12px] px-2.5 py-1 rounded-lg cursor-pointer transition-colors ${uploading ? 'bg-neutral-100 text-neutral-400' : 'bg-primary-50 text-primary hover:bg-primary-100'}`}>
          {uploading ? 'מעלה…' : '+ העלה אישור לקוח'}
          <input type="file" className="hidden" accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.xls,.xlsx,.msg,.eml" multiple disabled={uploading}
            onChange={async (e) => { const files = Array.from(e.target.files || []); e.target.value = ''; for (const f of files) await upload(f); }} />
        </label>
      </div>
      {docs.length > 0 && (
        <div className="space-y-1.5">
          {docs.map((att) => (
            <div key={att.id} className="flex items-center gap-2 bg-neutral-50 rounded-lg px-3 py-1.5 text-[13px]">
              <span className="text-[10px] font-bold text-success bg-success-soft px-2 py-0.5 rounded-full whitespace-nowrap">אישור לקוח</span>
              <button onClick={() => openFile(att.file_url)} className="text-primary hover:underline truncate flex-1 text-right min-w-0" title="צפייה בקובץ">
                <Icon name={att.file_name.endsWith('.pdf') ? 'pdf' : 'attach'} size={14} /> {att.file_name} <Icon name="external" size={12} />
              </button>
              <span className="text-[10px] text-neutral-400 whitespace-nowrap">{att.created_at ? new Date(att.created_at).toLocaleDateString('he-IL') : ''}</span>
              <button onClick={() => del(att.id, att.file_name)} className="text-danger hover:text-danger text-base shrink-0">×</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function QuoteViewsPanel({ quoteId }: { quoteId: string }) {
  const [views, setViews] = useState<any[]>([]);
  const [shareToken, setShareToken] = useState<any>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const sb = createClient();
    async function load() {
      try {
        const [{ data: tokens }, { data: viewsData }] = await Promise.all([
          sb.from('quote_share_tokens').select('*').eq('quote_id', quoteId).order('created_at', { ascending: false }).limit(1),
          sb.from('quote_views').select('*').eq('quote_id', quoteId).order('viewed_at', { ascending: false }),
        ]);
        setShareToken(tokens?.[0] || null);
        setViews(viewsData || []);
      } catch {}
      setLoaded(true);
    }
    load();
  }, [quoteId]);

  if (!loaded || !shareToken) return null;

  const isExpired = new Date(shareToken.expires_at) < new Date();
  const expiresAt = new Date(shareToken.expires_at).toLocaleString('he-IL');

  return (
    <div className="mb-3 p-3 bg-primary-50 rounded-lg border border-primary">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-[12px] font-semibold text-primary"><Icon name="link" size={14} /> קישור שיתוף</h4>
        <span className={`text-[11px] px-2 py-0.5 rounded-full ${isExpired ? 'bg-danger-soft text-danger' : 'bg-success-soft text-success'}`}>
          {isExpired ? 'פג תוקף' : `בתוקף עד ${expiresAt}`}
        </span>
      </div>
      {views.length > 0 ? (
        <div className="space-y-1 max-h-28 overflow-y-auto">
          <p className="text-[11px] font-semibold text-success mb-1"><Icon name="eye" size={14} /> {views.length} צפייות</p>
          {views.map((v: any) => (
            <div key={v.id} className="flex items-center gap-3 text-[11px] text-content-body">
              <span>{new Date(v.viewed_at).toLocaleString('he-IL')}</span>
              {v.ip_address && <span className="text-neutral-400 font-mono text-[10px]">{v.ip_address}</span>}
              <span className="text-neutral-400">{v.user_agent?.includes('Mobile') ? <><Icon name="mobile" size={14} /> נייד</> : <><Icon name="desktop" size={14} /> מחשב</>}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-[11px] text-neutral-400">הלקוח עדיין לא צפה בקישור</p>
      )}
    </div>
  );
}
