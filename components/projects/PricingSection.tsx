'use client';

import { useState, useEffect, useRef } from 'react';
import { usePricing } from '@/hooks/usePricing';
import { DISCLAIMER_TYPES } from '@/lib/disclaimers';
import { CURRENCY_SYMBOLS } from '@/lib/exchange-rate';
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
  type QuoteLineItem,
  type QuoteLineItemPriced,
} from '@/lib/pricing';

function fmtSn(sn: string) {
  if (!sn) return '';
  const n = parseInt(sn, 10);
  return isNaN(n) ? sn : n.toLocaleString('en-US');
}
import ExchangeRateWidget from './ExchangeRateWidget';

function formatCurrency(v: number) {
  return new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(v);
}

function formatDate(d: string | null) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('he-IL');
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
      <button ref={btnRef} type="button" onClick={() => (open ? setOpen(false) : openMenu())} className="w-full border border-[#e2e8f0] rounded px-1.5 py-1 text-[11px] text-right bg-white leading-tight whitespace-normal break-words min-h-[34px]">
        {itemTypeLabels(value)}
      </button>
      {open && coords && (
        <div ref={popRef} style={{ position: 'fixed', top: coords.top, right: coords.right, zIndex: 50 }}
          className="bg-white border border-[#e2e8f0] rounded-lg shadow-lg p-1 min-w-[160px] max-h-72 overflow-y-auto">
          {opts.map((o) => (
            <label key={o.value} className="flex items-center gap-2 px-2 py-1.5 text-[12px] hover:bg-gray-50 rounded cursor-pointer">
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
    <button onClick={open} className="text-[#1a56db] hover:underline truncate flex-1 text-right min-w-0" dir="ltr" title={att.file_name}>
      📄 {att.file_name}
    </button>
  );
}

const QUOTE_TIER_MAP: Record<string, { label: string; color: string }> = {
  planner_estimate:      { label: 'הערכת מתכנן',  color: 'bg-purple-100 text-purple-700' },
  contractor_pre_tender: { label: 'טרום מכרז',     color: 'bg-amber-100 text-amber-700' },
  contractor_final:      { label: 'הצעה סופית',    color: 'bg-blue-100 text-blue-800' },
};

const QUOTE_TIERS = [
  { value: 'planner_estimate',      label: 'הערכת מתכנן' },
  { value: 'contractor_pre_tender', label: 'טרום מכרז' },
  { value: 'contractor_final',      label: 'הצעה סופית' },
];

const QUOTE_STATUS_MAP: Record<string, { label: string; color: string }> = {
  draft: { label: 'טיוטה', color: 'bg-gray-100 text-gray-600' },
  sent: { label: 'נשלח', color: 'bg-blue-100 text-blue-700' },
  signed: { label: 'נחתם', color: 'bg-green-100 text-green-700' },
  rejected: { label: 'נדחה', color: 'bg-red-100 text-red-700' },
};

const ORDER_STATUS_MAP: Record<string, { label: string; color: string }> = {
  pending: { label: 'ממתין', color: 'bg-yellow-100 text-yellow-700' },
  confirmed: { label: 'מאושר', color: 'bg-blue-100 text-blue-700' },
  in_production: { label: 'בייצור', color: 'bg-purple-100 text-purple-700' },
  delivered: { label: 'סופק', color: 'bg-green-100 text-green-700' },
  completed: { label: 'הושלם', color: 'bg-gray-100 text-gray-600' },
};

export default function PricingSection({ projectId }: { projectId: string }) {
  const p = usePricing(projectId);

  return (
    <section className="bg-white rounded-xl border border-[#e2e8f0] p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-gray-700">💰 תמחור והצעות מחיר</h2>
      </div>

      <ExchangeRateWidget rates={p.exchangeRates} loading={p.rateLoading} onRefresh={p.refreshRate} />

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b border-[#e2e8f0] pb-2">
        {([['costs', 'תמחור'], ['quotes', 'הצעות מחיר'], ['orders', 'הזמנות']] as const).map(([key, label]) => (
          <button key={key} onClick={() => p.setPricingTab(key as any)} className={`text-sm px-4 py-1.5 rounded-t-lg transition-colors ${p.pricingTab === key ? 'bg-[#1a56db] text-white font-bold' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            {label}{key === 'costs' && p.costInputs.filter((c: any) => !c.is_archived).length > 0 ? ` (${p.costInputs.filter((c: any) => !c.is_archived).length})` : ''}{key === 'quotes' && p.quotes.length > 0 ? ` (${p.quotes.length})` : ''}{key === 'orders' && p.orders.length > 0 ? ` (${p.orders.length})` : ''}
          </button>
        ))}
      </div>

      {/* COSTS TAB */}
      {p.pricingTab === 'costs' && <CostsTab p={p} />}

      {/* QUOTES TAB */}
      {p.pricingTab === 'quotes' && <QuotesTab p={p} />}

      {/* ORDERS TAB */}
      {p.pricingTab === 'orders' && <OrdersTab p={p} />}
    </section>
  );
}

function CostsTab({ p }: { p: ReturnType<typeof usePricing> }) {
  return (
    <div>
      <div className="flex items-center justify-end gap-2 mb-3">
        <button onClick={() => p.setShowNewCostInput(!p.showNewCostInput)} className="text-sm bg-amber-600 text-white px-3 py-1.5 rounded-lg hover:bg-amber-700 transition-colors">
          {p.showNewCostInput ? 'ביטול' : '+ תמחור חדש'}
        </button>
      </div>

      {/* New cost input form */}
      {p.showNewCostInput && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4 space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[140px]">
              <label className="block text-[12px] font-semibold text-gray-500 mb-1">סוג מקור</label>
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
              <label className="block text-[12px] font-semibold text-gray-500 mb-1">שם מקור</label>
              <input type="text" value={p.newCostInput.source_name} onChange={(e) => p.setNewCostInput({ ...p.newCostInput, source_name: e.target.value })} className="w-full border border-[#e2e8f0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a56db]/20" placeholder={p.newCostInput.source_type === 'supplier' ? 'Amiblu' : 'ציין שם מקור'} autoFocus />
            </div>
            {p.newCostInput.source_type === 'supplier' && (
              <div className="min-w-[120px]">
                <label className="block text-[12px] font-semibold text-gray-500 mb-1">מטבע</label>
                <SearchableSelect value={p.newCostInput.currency} onChange={(v) => p.setNewCostInput({ ...p.newCostInput, currency: v })} className="w-full border border-[#e2e8f0] rounded-lg px-3 py-2 text-sm"
                  options={[{ value: 'USD', label: '$ דולר' }, { value: 'EUR', label: '€ אירו' }, { value: 'ILS', label: '₪ שקל' }]} />
              </div>
            )}
            <div className="flex-1 min-w-[150px]">
              <label className="block text-[12px] font-semibold text-gray-500 mb-1">הערות</label>
              <input type="text" value={p.newCostInput.notes} onChange={(e) => p.setNewCostInput({ ...p.newCostInput, notes: e.target.value })} className="w-full border border-[#e2e8f0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a56db]/20" placeholder="אופציונלי" />
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[200px]">
              <label className="block text-[12px] font-semibold text-gray-500 mb-1">תנאי תשלום לספק</label>
              <textarea value={p.newCostInput.payment_terms} onChange={(e) => p.setNewCostInput({ ...p.newCostInput, payment_terms: e.target.value })} className="w-full border border-[#e2e8f0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a56db]/20 min-h-[60px] resize-y" placeholder="למשל: 30% מקדמה, יתרה שוטף +60" />
            </div>
          </div>
          {p.newCostInput.source_type === 'supplier' && p.newCostInput.currency !== 'ILS' && (
            <div className="text-[12px] text-gray-500">
              שער {CURRENCY_SYMBOLS[p.newCostInput.currency] || ''}/₪: <strong>{p.exchangeRates[p.newCostInput.currency]?.rate?.toFixed(4) || 'טוען...'}</strong>
            </div>
          )}
          <button onClick={p.createCostInput} disabled={!p.newCostInput.source_name.trim()} className="bg-amber-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-amber-700 transition-colors disabled:opacity-50">צור מסמך תמחור</button>
        </div>
      )}

      {/* Cost inputs list */}
      {p.costInputs.length === 0 && !p.showNewCostInput ? (
        <p className="text-sm text-gray-400 text-center py-3">אין תמחורים. לחץ &quot;+ תמחור חדש&quot; להוסיף.</p>
      ) : (
        <>
          <div className="space-y-3">
            {p.costInputs.filter((ci) => !ci.is_archived).map((ci) => (
              <CostInputCard key={ci.id} ci={ci} p={p} />
            ))}
          </div>
          {p.costInputs.some((ci) => ci.is_archived) && (
            <div className="mt-4">
              <p className="text-[12px] text-gray-400 mb-2">ארכיון</p>
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
  const isForex = ci.currency && ci.currency !== 'ILS';
  const sym = CURRENCY_SYMBOLS[ci.currency] || '₪';

  const archived = ci.is_archived;

  return (
    <div className={`border rounded-xl overflow-hidden ${archived ? 'border-gray-200 opacity-60' : 'border-[#e2e8f0]'}`}>
      <div className={`flex items-center justify-between px-4 py-3 cursor-pointer transition-colors ${archived ? 'bg-gray-50 hover:bg-gray-100' : 'bg-amber-50/50 hover:bg-amber-50'}`} onClick={() => p.setExpandedCostInput(isExp ? null : ci.id)}>
        <div className="flex items-center gap-3">
          <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${archived ? 'bg-gray-200 text-gray-500' : ci.source_type === 'supplier' ? 'bg-orange-100 text-orange-700' : 'bg-purple-100 text-purple-700'}`}>{ci.source_type === 'supplier' ? 'ספק' : 'פנימי'}</span>
          <span className={`text-sm font-bold ${archived ? 'text-gray-400' : 'text-gray-700'}`}>
            {ci.source_name}
            <span className={`mr-1.5 text-[11px] font-normal ${archived ? 'text-gray-400' : 'text-gray-500'}`}>· {formatDate(ci.created_at)}</span>
          </span>
          {isForex && <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 font-medium">{ci.currency} {ci.exchange_rate ? `@ ${parseFloat(ci.exchange_rate).toFixed(2)}` : ''}</span>}
        </div>
        <div className="flex items-center gap-3">
          <span className={`text-sm font-bold ${archived ? 'text-gray-400' : 'text-gray-700'}`}>{formatCurrency(ciTotal)}</span>
          <svg className={`w-4 h-4 text-gray-400 transition-transform ${isExp ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9" /></svg>
        </div>
      </div>

      {isExp && (
        <div className="px-4 py-3 border-t border-[#e2e8f0]">
          {!isEdit && (
            <div className="flex items-center gap-2 mb-3">
              {!archived && <button onClick={() => p.startEditCostInput(ci.id)} className="text-[12px] bg-amber-50 text-amber-700 px-3 py-1 rounded-lg hover:bg-amber-100 transition-colors">✏️ ערוך פריטים</button>}
              {!archived && (
                <label className={`text-[12px] px-3 py-1 rounded-lg cursor-pointer transition-colors ${p.parsingCostFile ? 'bg-purple-100 text-purple-400' : 'bg-purple-50 text-purple-700 hover:bg-purple-100'}`}>
                  {p.parsingCostFile ? '🔄 Roxy מעבדת...' : '📎 העלה קובץ ל-Roxy'}
                  <input type="file" className="hidden" accept="image/*,.pdf,.xlsx,.xls,.csv,.doc,.docx" multiple disabled={p.parsingCostFile} onChange={(e) => { if (e.target.files?.length) { p.parseCostFile(e.target.files, ci.id); e.target.value = ''; } }} />
                </label>
              )}
              {!archived && (
                <label className="text-[12px] bg-indigo-50 text-indigo-700 px-3 py-1 rounded-lg hover:bg-indigo-100 transition-colors cursor-pointer">
                  📁 צרף קובץ
                  <input type="file" className="hidden" accept="image/*,.pdf,.xlsx,.xls,.csv,.doc,.docx" multiple onChange={async (e) => {
                    const files = Array.from(e.target.files || []);
                    e.target.value = '';
                    for (const f of files) { await p.uploadCostInputAttachment(ci.id, f); }
                  }} />
                </label>
              )}
              <button onClick={(e) => { e.stopPropagation(); p.duplicateCostInput(ci.id); }} className="text-[12px] bg-purple-50 text-purple-700 px-3 py-1 rounded-lg hover:bg-purple-100 transition-colors">📋 שכפל</button>
              <button onClick={(e) => { e.stopPropagation(); p.toggleArchiveCostInput(ci.id); }} className={`text-[12px] px-3 py-1 rounded-lg transition-colors ${archived ? 'bg-green-50 text-green-700 hover:bg-green-100' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>{archived ? '↩ שחזר' : '🗁 סיים תמחור'}</button>
              <button onClick={(e) => {
                e.stopPropagation();
                if (!confirm(`למחוק את התמחור "${ci.source_name}" וכל הפריטים והקבצים שלו? פעולה זו אינה הפיכה.`)) return;
                if (!confirm('בטוח? למחוק לצמיתות?')) return;
                p.deleteCostInput(ci.id);
              }} className="text-[12px] text-red-400 px-3 py-1 rounded-lg hover:bg-red-50 transition-colors mr-auto">🗑️ מחק</button>
            </div>
          )}
          {ci.payment_terms && <p className="text-[12px] text-gray-500 mb-2 whitespace-pre-line">💳 תנאי תשלום לספק: {ci.payment_terms}</p>}
          {ci.notes && <p className="text-[12px] text-gray-500 mb-3">📌 {ci.notes}</p>}
          {(() => {
            const ciAtts = p.attachments.filter((a: any) => a.entity_type === 'cost_input' && a.entity_id === ci.id);
            if (ciAtts.length === 0) return null;
            return (
              <div className="mb-3 p-2 bg-indigo-50/40 border border-indigo-100 rounded-lg">
                <p className="text-[11px] font-semibold text-indigo-700 mb-1.5">📎 קבצים מצורפים ({ciAtts.length})</p>
                <div className="space-y-1">
                  {ciAtts.map((a: any) => (
                    <div key={a.id} className="flex items-center gap-2 text-[12px]">
                      <CostAttachmentLink att={a} />
                      <button onClick={async () => { if (!confirm('למחוק את הקובץ?')) return; await p.deleteAttachment(a.id); }} className="text-red-400 hover:text-red-600 text-[14px]">×</button>
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
            <p className="text-sm text-gray-400 text-center py-2">אין פריטים. לחץ &quot;ערוך פריטים&quot; להוסיף.</p>
          )}

          {!isEdit && citems.length > 0 && <PipeCalcHelper citems={citems} ci={ci} rates={p.exchangeRates} />}
        </div>
      )}
    </div>
  );
}

function CostItemsEditor({ ci, p }: { ci: any; p: ReturnType<typeof usePricing> }) {
  const isForex = ci.currency && ci.currency !== 'ILS';
  const sym = CURRENCY_SYMBOLS[ci.currency] || '$';

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto">
        {isForex ? (
          <>
            <div className="grid grid-cols-[1fr_115px_70px_80px_70px_80px_60px_80px_32px] gap-1 text-[11px] font-semibold text-gray-500 px-1 min-w-[740px]">
              <span>מוצר</span><span>סוג</span><span>קוטר</span><span>כמות</span><span>יחידה</span><span>מחיר {sym}</span><span>שער</span><span>מחיר ₪</span><span></span>
            </div>
            {p.editingCostItems.map((item: any, idx: number) => (
              <div key={idx} className="grid grid-cols-[1fr_115px_70px_80px_70px_80px_60px_80px_32px] gap-1 min-w-[740px]">
                <AutoTextarea value={item.product_name} onChange={(v) => p.updateCostItem(idx, 'product_name', v)} placeholder="שם מוצר" className="border border-[#e2e8f0] rounded px-2 py-1.5 text-sm w-full" />
                <MultiTypeSelect value={item.item_type || ''} onChange={(v) => p.updateCostItem(idx, 'item_type', v)} />
                <input type="text" value={item.dn_size || ''} onChange={(e) => p.updateCostItem(idx, 'dn_size', e.target.value)} placeholder="DN" className="border border-[#e2e8f0] rounded px-2 py-1.5 text-sm" />
                <input type="number" value={item.quantity || ''} onChange={(e) => p.updateCostItem(idx, 'quantity', e.target.value)} className="border border-[#e2e8f0] rounded px-2 py-1.5 text-sm" />
                <input type="text" value={item.unit || 'מטר'} onChange={(e) => p.updateCostItem(idx, 'unit', e.target.value)} className="border border-[#e2e8f0] rounded px-2 py-1.5 text-sm" />
                <input type="number" value={item.original_price || ''} onChange={(e) => p.updateCostItem(idx, 'original_price', e.target.value)} placeholder={sym} className="border border-[#e2e8f0] rounded px-2 py-1.5 text-sm bg-yellow-50" dir="ltr" />
                <span className="flex items-center text-[11px] text-gray-400 px-1">{parseFloat(ci.exchange_rate || p.exchangeRates[ci.currency]?.rate || 0).toFixed(2)}</span>
                <span className="flex items-center text-sm font-medium text-gray-600 px-1">₪{(parseFloat(item.cost_price) || 0).toFixed(0)}</span>
                <button onClick={() => p.removeCostItem(idx)} className="text-red-400 hover:text-red-600 text-lg">×</button>
              </div>
            ))}
          </>
        ) : (
          <>
            <div className="grid grid-cols-[1fr_115px_70px_80px_70px_80px_80px_32px] gap-1 text-[11px] font-semibold text-gray-500 px-1">
              <span>מוצר</span><span>סוג</span><span>קוטר</span><span>כמות</span><span>יחידה</span><span>מחיר עלות</span><span>סה״כ</span><span></span>
            </div>
            {p.editingCostItems.map((item: any, idx: number) => (
              <div key={idx} className="grid grid-cols-[1fr_115px_70px_80px_70px_80px_80px_32px] gap-1">
                <AutoTextarea value={item.product_name} onChange={(v) => p.updateCostItem(idx, 'product_name', v)} placeholder="שם מוצר" className="border border-[#e2e8f0] rounded px-2 py-1.5 text-sm w-full" />
                <MultiTypeSelect value={item.item_type || ''} onChange={(v) => p.updateCostItem(idx, 'item_type', v)} />
                <input type="text" value={item.dn_size || ''} onChange={(e) => p.updateCostItem(idx, 'dn_size', e.target.value)} placeholder="DN" className="border border-[#e2e8f0] rounded px-2 py-1.5 text-sm" />
                <input type="number" value={item.quantity || ''} onChange={(e) => p.updateCostItem(idx, 'quantity', e.target.value)} className="border border-[#e2e8f0] rounded px-2 py-1.5 text-sm" />
                <input type="text" value={item.unit || 'מטר'} onChange={(e) => p.updateCostItem(idx, 'unit', e.target.value)} className="border border-[#e2e8f0] rounded px-2 py-1.5 text-sm" />
                <input type="number" value={item.cost_price || ''} onChange={(e) => p.updateCostItem(idx, 'cost_price', e.target.value)} placeholder="₪" className="border border-[#e2e8f0] rounded px-2 py-1.5 text-sm" />
                <span className="flex items-center text-sm font-medium text-gray-600 px-1">{formatCurrency(parseFloat(item.total_cost) || 0)}</span>
                <button onClick={() => p.removeCostItem(idx)} className="text-red-400 hover:text-red-600 text-lg">×</button>
              </div>
            ))}
          </>
        )}
      </div>
      <div className="flex items-center justify-between pt-2">
        <div className="flex items-center gap-3">
          <button onClick={p.addCostItem} className="text-[12px] text-amber-700 hover:underline">+ הוסף שורה</button>
          <label className={`text-[12px] px-3 py-1 rounded-lg cursor-pointer transition-colors ${p.parsingCostFile ? 'bg-purple-100 text-purple-400' : 'bg-purple-50 text-purple-700 hover:bg-purple-100'}`}>
            {p.parsingCostFile ? '🔄 Roxy מעבדת...' : '📎 העלה עוד קובץ ל-Roxy'}
            <input type="file" className="hidden" accept="image/*,.pdf,.xlsx,.xls,.csv,.doc,.docx" multiple disabled={p.parsingCostFile} onChange={(e) => { if (e.target.files?.length) { p.parseCostFile(e.target.files, ci.id); e.target.value = ''; } }} />
          </label>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-gray-700">סה״כ עלות: {formatCurrency(p.editingCostItems.reduce((s: number, i: any) => s + (parseFloat(i.total_cost) || 0), 0))}</span>
          <button onClick={p.cancelEditCostInput} className="text-sm text-gray-500 px-3 py-1.5 rounded-lg hover:bg-gray-100">ביטול</button>
          <button onClick={() => p.saveCostInputItems(ci.id)} disabled={p.saving} className="text-sm bg-amber-600 text-white px-4 py-1.5 rounded-lg hover:bg-amber-700 disabled:opacity-50">{p.saving ? 'שומר...' : 'שמור'}</button>
        </div>
      </div>
    </div>
  );
}

function CostItemsDisplay({ citems, ciTotal, isForex, sym, ci }: { citems: any[]; ciTotal: number; isForex: boolean; sym: string; ci: any }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse" style={{ minWidth: isForex ? 660 : 560 }}>
        <thead><tr className="border-b border-[#e2e8f0]">
          <th className="text-right text-[11px] text-gray-500 font-medium pb-1.5 pr-1 w-[40%]">מוצר</th>
          <th className="text-right text-[11px] text-gray-500 font-medium pb-1.5 px-2 whitespace-nowrap">סוג</th>
          <th className="text-right text-[11px] text-gray-500 font-medium pb-1.5 px-2 whitespace-nowrap">קוטר</th>
          <th className="text-right text-[11px] text-gray-500 font-medium pb-1.5 px-2 whitespace-nowrap">כמות</th>
          {isForex && <th className="text-right text-[11px] text-gray-500 font-medium pb-1.5 px-2 whitespace-nowrap">מחיר {sym}</th>}
          <th className="text-right text-[11px] text-gray-500 font-medium pb-1.5 px-2 whitespace-nowrap">מחיר ₪</th>
          <th className="text-right text-[11px] text-gray-500 font-medium pb-1.5 px-2 whitespace-nowrap">סה״כ ₪</th>
        </tr></thead>
        <tbody>{citems.map((item: any) => {
          const typeLabel = itemTypeLabels(item.item_type) === '—' ? '' : itemTypeLabels(item.item_type);
          return (
            <tr key={item.id} className="border-b border-gray-50 align-top">
              <td className="py-1.5 pr-1 text-gray-700 leading-snug break-words text-right" dir="ltr">{item.product_name}</td>
              <td className="py-1.5 px-2 text-[11px] text-gray-500 whitespace-nowrap">{typeLabel}</td>
              <td className="py-1.5 px-2 text-gray-500 whitespace-nowrap">{item.dn_size || '—'}</td>
              <td className="py-1.5 px-2 text-gray-500 whitespace-nowrap">{item.quantity} {item.unit}</td>
              {isForex && <td className="py-1.5 px-2 text-gray-500 whitespace-nowrap text-right" dir="ltr">{sym}{parseFloat(item.original_price || 0).toFixed(2)}</td>}
              <td className="py-1.5 px-2 text-gray-500 whitespace-nowrap text-right" dir="ltr">{formatCurrency(item.cost_price)}</td>
              <td className="py-1.5 px-2 font-medium text-gray-700 whitespace-nowrap text-right" dir="ltr">{formatCurrency(item.total_cost)}</td>
            </tr>
          );
        })}</tbody>
        <tfoot><tr className="border-t border-[#e2e8f0]">
          <td colSpan={isForex ? 5 : 4} className="py-2 pr-1 font-bold text-gray-700">סה״כ עלות</td>
          <td colSpan={2} className="py-2 px-2 font-bold text-gray-700 whitespace-nowrap text-right" dir="ltr">{formatCurrency(ciTotal)}</td>
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
    <div className="mt-3 bg-blue-50 border border-blue-200 rounded-lg p-3">
      <p className="text-[12px] font-bold text-blue-700 mb-2">📐 חישוב עלות למדלק (צינור + מחבר)</p>
      <div className="space-y-2">
        {pairs.map(({ dn, barePrice, couplingPrice, length }) => {
          const costPerMeter = calcCostPerMeter(barePrice, couplingPrice, length);
          const costPerMeterILS = isForex ? Math.round(costPerMeter * rate * 100) / 100 : costPerMeter;
          const dnNum = parseInt(dn.replace(/\D/g, '')) || 0;
          const roker = dnNum > 0 ? calcRokerCostPerMeter(barePrice, dnNum, couplingPrice) : null;
          const rokerILS = roker && isForex ? Math.round(roker.costPerMeter * rate * 100) / 100 : roker?.costPerMeter;

          return (
            <div key={dn} className="text-[12px] text-gray-700">
              <span className="font-bold">{dn}</span>
              <span className="mx-1">—</span>
              <span>צינור ({length}מי): </span>
              {isForex && <span className="text-gray-500">{sym}{costPerMeter.toFixed(2)} → </span>}
              <span className="font-bold text-blue-800">₪{costPerMeterILS.toFixed(2)}/מי</span>
              {roker && dnNum > 0 && (
                <>
                  <span className="mx-2 text-gray-300">|</span>
                  <span>רוקר ({roker.rokerLength.toFixed(1)}מי): </span>
                  {isForex && <span className="text-gray-500">{sym}{roker.costPerMeter.toFixed(2)} → </span>}
                  <span className="font-bold text-purple-700">₪{rokerILS?.toFixed(2)}/מי</span>
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
        <button onClick={() => p.setShowNewQuote(!p.showNewQuote)} className="text-sm bg-[#1a56db] text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 transition-colors">
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
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="md:col-span-2">
              <label className="block text-[12px] font-semibold text-gray-500 mb-1">לקוח</label>
              <div className="flex items-center gap-2">
                <SearchableSelect
                  value={p.newQuote.customer_id}
                  onChange={(v) => {
                    const cust = p.customers.find((c: any) => c.id === v);
                    p.setNewQuote({ ...p.newQuote, customer_id: v, client_name: cust?.name || p.newQuote.client_name });
                  }}
                  className="flex-1 border border-[#e2e8f0] rounded-lg px-3 py-2 text-sm"
                  placeholder="— ללא לקוח —"
                  options={[{ value: '', label: '— ללא לקוח —' }, ...p.customers.map((c: any) => ({ value: c.id, label: c.name }))]}
                />
                <button onClick={() => setShowCustomerForm(true)} className="text-[13px] bg-white border border-[#1a56db] text-[#1a56db] px-3 py-2 rounded-lg hover:bg-blue-50 whitespace-nowrap">+ לקוח חדש</button>
              </div>
            </div>
            <div>
              <label className="block text-[12px] font-semibold text-gray-500 mb-1">שם לקוח / קבלן (ל&quot;לכבוד&quot;)</label>
              <input type="text" value={p.newQuote.client_name} onChange={(e) => p.setNewQuote({ ...p.newQuote, client_name: e.target.value })} className="w-full border border-[#e2e8f0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a56db]/20" placeholder="שם הלקוח" />
            </div>
            <div>
              <label className="block text-[12px] font-semibold text-gray-500 mb-1">איש קשר</label>
              <SearchableSelect value={p.newQuote.contact_id} onChange={(v) => p.setNewQuote({ ...p.newQuote, contact_id: v })} className="w-full border border-[#e2e8f0] rounded-lg px-3 py-2 text-sm"
                placeholder="— ללא / איש קשר ראשון —"
                options={[{ value: '', label: '— ללא / איש קשר ראשון —' }, ...p.contacts.map((c: any) => ({ value: c.id, label: `${c.name}${c.role ? ` (${c.role})` : ''}${c.phone ? ` · ${c.phone}` : ''}` }))]} />
            </div>
            <div>
              <label className="block text-[12px] font-semibold text-gray-500 mb-1">סוג הצעה</label>
              <SearchableSelect value={p.newQuote.tier} onChange={(v) => p.setNewQuote({ ...p.newQuote, tier: v })} className="w-full border border-[#e2e8f0] rounded-lg px-3 py-2 text-sm"
                options={QUOTE_TIERS.map((t) => ({ value: t.value, label: t.label }))} />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-[12px] font-semibold text-gray-500 mb-1">מקור תמחור</label>
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
                <label className="block text-[12px] font-semibold text-gray-500 mb-1">קישור לתמחור</label>
                <SearchableSelect value={p.newQuote.cost_input_id} onChange={(v) => p.setNewQuote({ ...p.newQuote, cost_input_id: v })} className="w-full border border-[#e2e8f0] rounded-lg px-3 py-2 text-sm"
                  placeholder="ללא קישור"
                  options={[{ value: '', label: 'ללא קישור' }, ...p.costInputs.map((ci: any) => ({ value: ci.id, label: `${ci.source_name} (${ci.source_type === 'supplier' ? 'ספק' : 'פנימי'}) · ${formatDate(ci.created_at)}` }))]} />
              </div>
            )}
            <div>
              <label className="block text-[12px] font-semibold text-gray-500 mb-1">תקורות %</label>
              <input type="number" value={p.newQuote.default_overheads_pct} onChange={(e) => p.setNewQuote({ ...p.newQuote, default_overheads_pct: parseFloat(e.target.value) || 0 })} className="w-full border border-[#e2e8f0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a56db]/20" />
            </div>
            <div>
              <label className="block text-[12px] font-semibold text-gray-500 mb-1">רווח %</label>
              <input type="number" value={p.newQuote.default_profit_pct} onChange={(e) => p.setNewQuote({ ...p.newQuote, default_profit_pct: parseFloat(e.target.value) || 0 })} className="w-full border border-[#e2e8f0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a56db]/20" />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-[12px] font-semibold text-gray-500 mb-1">סוג הערות משפטיות</label>
              <SearchableSelect value={p.newQuote.disclaimer_type} onChange={(v) => p.setNewQuote({ ...p.newQuote, disclaimer_type: v })} className="w-full border border-[#e2e8f0] rounded-lg px-3 py-2 text-sm"
                options={DISCLAIMER_TYPES.map((d) => ({ value: d.value, label: d.label }))} />
            </div>
            <div>
              <label className="block text-[12px] font-semibold text-gray-500 mb-1">תנאי תשלום</label>
              <textarea value={p.newQuote.payment_terms} onChange={(e) => p.setNewQuote({ ...p.newQuote, payment_terms: e.target.value })} className="w-full border border-[#e2e8f0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a56db]/20 min-h-[60px] resize-y" />
            </div>
          </div>
          <div>
            <label className="block text-[12px] font-semibold text-gray-500 mb-1">הערות</label>
            <input type="text" value={p.newQuote.notes} onChange={(e) => p.setNewQuote({ ...p.newQuote, notes: e.target.value })} className="w-full border border-[#e2e8f0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a56db]/20" placeholder="אופציונלי" />
          </div>
          <button onClick={p.createQuote} disabled={!p.newQuote.client_name.trim()} className="bg-[#1a56db] text-white text-sm px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50">צור הצעה</button>
        </div>
      )}

      {p.quotes.length === 0 && !p.showNewQuote ? (
        <p className="text-sm text-gray-400 text-center py-3">אין הצעות מחיר. לחץ &quot;+ הצעה חדשה&quot; להוסיף.</p>
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

function QuoteCard({ q, p }: { q: any; p: ReturnType<typeof usePricing> }) {
  const st = QUOTE_STATUS_MAP[q.status] || QUOTE_STATUS_MAP.draft;
  const tier = QUOTE_TIER_MAP[q.tier] || QUOTE_TIER_MAP.contractor_pre_tender;
  const isExpanded = p.expandedQuote === q.id;
  const isEditing = p.editingQuote === q.id;
  const items = p.quoteItems[q.id] || [];
  const [editTermsQuoteId, setEditTermsQuoteId] = useState<string | null>(null);

  return (
    <div className="border border-[#e2e8f0] rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 bg-gray-50 cursor-pointer hover:bg-gray-100 transition-colors" onClick={() => p.setExpandedQuote(isExpanded ? null : q.id)}>
        <div className="flex items-center gap-3">
          <span className="text-sm font-mono text-gray-400">{q.quote_number}</span>
          {q.client_name?.trim()
            ? <span className="text-sm font-bold text-gray-700">{q.client_name}</span>
            : <span className="text-sm font-semibold text-amber-600">לקוח חסר</span>}
          <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${tier.color}`}>{tier.label}</span>
          <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${st.color}`}>{st.label}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm font-bold text-gray-700">{formatCurrency(q.total_amount || 0)}</span>
          <svg className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9" /></svg>
        </div>
      </div>

      {isExpanded && (
        <div className="px-4 py-3 border-t border-[#e2e8f0]">
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            {!isEditing && (
              <>
                <button onClick={() => p.startEditQuote(q.id)} className="text-[12px] bg-blue-50 text-[#1a56db] px-3 py-1 rounded-lg hover:bg-blue-100 transition-colors">✏️ ערוך פריטים</button>
                {items.length > 0 && (
                  <a href={`/projects/${q.project_id}/quote/${q.id}`} target="_blank" rel="noopener noreferrer" className="text-[12px] bg-green-50 text-green-700 px-3 py-1 rounded-lg hover:bg-green-100 transition-colors">📄 תצוגה מקדימית</a>
                )}
                <label className={`text-[12px] px-3 py-1 rounded-lg cursor-pointer transition-colors ${p.uploadingFile ? 'bg-gray-100 text-gray-400' : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100'}`}>
                  {p.uploadingFile ? '⏳ מעלה...' : '📎 צרף שרטוט'}
                  <input type="file" className="hidden" accept=".pdf,.dwg,.dxf,.png,.jpg,.jpeg,.doc,.docx,.xlsx" disabled={p.uploadingFile} onChange={(e) => { if (e.target.files?.[0]) { p.uploadAttachment(q.id, e.target.files[0]); e.target.value = ''; } }} />
                </label>
                <span className="flex items-center gap-1 text-[12px] text-gray-500">
                  👤 איש קשר:
                  <SearchableSelect value={q.contact_id ? `pc:${q.contact_id}` : ''} onChange={(v) => p.assignQuoteContact(q.id, v)} className="border border-[#e2e8f0] rounded-lg px-2 py-1 text-[12px] min-w-[150px]"
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
                <span className="flex items-center gap-1 text-[12px] text-gray-500">
                  🏢 לקוח:
                  <SearchableSelect value={q.customer_id || ''} onChange={(v) => p.setQuoteCustomer(q.id, v)} className="border border-[#e2e8f0] rounded-lg px-2 py-1 text-[12px] min-w-[150px]"
                    placeholder="— ללא —"
                    options={[{ value: '', label: '— ללא —' }, ...p.customers.map((c: any) => ({ value: c.id, label: c.name }))]} />
                </span>
                {q.status === 'draft' && p.costInputs.length > 0 && (
                  <span className="flex items-center gap-1 text-[12px] text-gray-500">
                    💰 קישור לתמחור:
                    <SearchableSelect value={q.cost_input_id || ''} onChange={(v) => p.setQuoteCostInput(q.id, v)} className="border border-[#e2e8f0] rounded-lg px-2 py-1 text-[12px] min-w-[180px]"
                      placeholder="ללא קישור"
                      options={[{ value: '', label: 'ללא קישור' }, ...p.costInputs.map((ci: any) => ({ value: ci.id, label: `${ci.source_name} (${ci.source_type === 'supplier' ? 'ספק' : 'פנימי'}) · ${formatDate(ci.created_at)}` }))]} />
                  </span>
                )}
                {q.status === 'draft' && p.contractTemplates.length > 0 && (
                  <span className="flex items-center gap-1 text-[12px] text-gray-500">
                    📜 תנאי הסכם:
                    <SearchableSelect value={q.contract_template_id || ''} onChange={(v) => p.setQuoteContractTemplate(q.id, v)} className="border border-[#e2e8f0] rounded-lg px-2 py-1 text-[12px] min-w-[170px]"
                      placeholder="תבנית"
                      options={p.contractTemplates.map((t: any) => ({ value: t.id, label: `${t.name}${t.is_default ? ' (ברירת מחדל)' : ''}` }))} />
                    <button onClick={() => setEditTermsQuoteId(q.id)} className="text-[11px] bg-blue-50 text-[#1a56db] px-2 py-0.5 rounded-lg hover:bg-blue-100">✏️ ערוך להצעה זו</button>
                    {q.contract_overrides && (
                      <button onClick={() => { if (confirm('לשחזר את התנאים מהתבנית ולמחוק את העריכה הייעודית?')) p.setQuoteContractOverrides(q.id, null); }} className="text-[11px] bg-amber-50 text-amber-700 px-2 py-0.5 rounded-lg hover:bg-amber-100">🔄 שחזר מהתבנית</button>
                    )}
                  </span>
                )}
              </>
            )}
            {q.status === 'draft' && (
              <button onClick={() => p.updateQuoteStatus(q.id, 'sent')} className="text-[12px] bg-blue-50 text-blue-700 px-3 py-1 rounded-lg hover:bg-blue-100 transition-colors">📤 סמן כנשלח</button>
            )}
            {(q.status === 'sent' || q.status === 'draft') && (
              <label className="text-[12px] bg-green-50 text-green-700 px-3 py-1 rounded-lg hover:bg-green-100 transition-colors cursor-pointer">
                ✅ נחתם
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
              <button onClick={() => p.updateQuoteStatus(q.id, 'rejected')} className="text-[12px] bg-red-50 text-red-600 px-3 py-1 rounded-lg hover:bg-red-100 transition-colors">❌ נדחה</button>
            )}
            <button onClick={() => p.duplicateQuote(q.id)} className="text-[12px] bg-purple-50 text-purple-700 px-3 py-1 rounded-lg hover:bg-purple-100 transition-colors">📋 שכפל</button>
            {q.status === 'draft' && (
              <button onClick={() => { if (confirm('למחוק הצעה זו?')) p.deleteQuote(q.id); }} className="text-[12px] text-red-400 px-3 py-1 rounded-lg hover:bg-red-50 transition-colors mr-auto">🗑️ מחק</button>
            )}
            {!isEditing && items.length > 0 && (
              <div className="flex items-center gap-1 text-[12px] text-gray-500">
                <span>הנחה כללית:</span>
                <input type="number" value={q.global_discount_pct || ''} onChange={(e) => p.updateGlobalDiscount(q.id, parseFloat(e.target.value) || 0)} placeholder="0" className="w-14 border border-[#e2e8f0] rounded px-1.5 py-0.5 text-[12px] text-center bg-orange-50" />
                <span>%</span>
              </div>
            )}
          </div>

          {!isEditing && p.projectDrawings.length > 0 && (
            <div className="mb-3 bg-gray-50 border border-[#e2e8f0] rounded-lg px-3 py-2">
              <p className="text-[12px] font-semibold text-gray-600 mb-1.5">📐 שרטוטים לצירוף להצעה זו</p>
              <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                {p.projectDrawings.map((d: any) => {
                  const on = (p.quoteDrawings[q.id] || []).includes(d.id);
                  return (
                    <label key={d.id} className="flex items-center gap-1.5 text-[12px] text-gray-700 cursor-pointer">
                      <input type="checkbox" checked={on} onChange={() => p.toggleQuoteDrawing(q.id, d.id)} />
                      <span dir="ltr" className="font-medium">{d.drawing_number || '?'}</span>
                      <span className="text-gray-400 truncate max-w-[160px]">{d.file_name}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {!isEditing && items.length > 0 && <QuoteSummaryPanel q={q} items={items} p={p} />}
          {!isEditing && q.status !== 'draft' && <QuoteViewsPanel quoteId={q.id} />}
          {q.notes && <p className="text-[12px] text-gray-500 mb-3">📌 {q.notes}</p>}

          {isEditing ? (
            <QuoteItemsEditor q={q} p={p} />
          ) : items.length > 0 ? (
            <QuoteItemsDisplay q={q} items={items} p={p} />
          ) : (
            <p className="text-sm text-gray-400 text-center py-2">אין פריטים. לחץ &quot;ערוך פריטים&quot; להוסיף.</p>
          )}
        </div>
      )}
      {editTermsQuoteId === q.id && (
        <ContractTermsModal q={q} p={p} onClose={() => setEditTermsQuoteId(null)} />
      )}
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
        <div className="px-5 py-3 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-gray-800">📜 עריכת תנאי הסכם להצעה {q.quote_number}</h3>
            <p className="text-[11px] text-gray-500">השינויים נשמרים רק על הצעה זו (לא משנים את התבנית).</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {sections === null && <p className="text-sm text-gray-400 text-center py-6">טוען…</p>}
          {sections && sections.length === 0 && <p className="text-sm text-gray-400 text-center py-6">אין פרקים עדיין. לחץ "+ הוסף פרק" כדי להתחיל.</p>}
          {sections?.map((s, si) => (
            <div key={si} className="border border-gray-200 rounded-lg p-3 bg-gray-50">
              <div className="flex items-center gap-2 mb-2">
                <input value={s.title} onChange={(e) => updateTitle(si, e.target.value)} className="flex-1 border border-[#e2e8f0] rounded-lg px-3 py-1.5 text-sm font-semibold bg-white" />
                <button onClick={() => moveSection(si, -1)} disabled={si === 0} className="text-[11px] bg-white border border-gray-200 px-2 py-1 rounded hover:bg-gray-50 disabled:opacity-30">↑</button>
                <button onClick={() => moveSection(si, 1)} disabled={si === (sections?.length || 0) - 1} className="text-[11px] bg-white border border-gray-200 px-2 py-1 rounded hover:bg-gray-50 disabled:opacity-30">↓</button>
                <button onClick={() => deleteSection(si)} className="text-[11px] text-red-500 hover:text-red-700 px-2">🗑️</button>
              </div>
              <div className="space-y-2">
                {s.clauses.map((c, ci) => (
                  <div key={ci} className="flex gap-2 items-start">
                    <span className="text-[12px] font-bold text-[#003d77] pt-2 min-w-[24px]">{c.num}.</span>
                    <textarea value={c.text} onChange={(e) => updateClause(si, ci, e.target.value)} rows={2} className="flex-1 border border-[#e2e8f0] rounded-lg px-3 py-1.5 text-[12px] text-gray-700 bg-white leading-relaxed resize-y" />
                    <button onClick={() => deleteClause(si, ci)} className="text-red-400 hover:text-red-600 text-lg pt-1">×</button>
                  </div>
                ))}
                <button onClick={() => addClause(si)} className="text-[11px] text-[#1a56db] hover:underline">+ הוסף סעיף</button>
              </div>
            </div>
          ))}
          {sections !== null && (
            <button onClick={addSection} className="w-full text-sm border-2 border-dashed border-gray-300 rounded-lg py-2 text-gray-500 hover:bg-gray-50">+ הוסף פרק</button>
          )}
        </div>
        <div className="px-5 py-3 border-t border-gray-200 flex items-center justify-between">
          <p className="text-[11px] text-gray-400">ההצעה תציג את התנאים העדכניים שתשמור.</p>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="text-sm text-gray-500 px-4 py-1.5 rounded-lg hover:bg-gray-100">ביטול</button>
            <button onClick={save} disabled={saving || sections === null} className="text-sm bg-[#1a56db] text-white px-4 py-1.5 rounded-lg hover:bg-blue-700 disabled:opacity-50">{saving ? 'שומר…' : 'שמור'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function QuoteItemsEditor({ q, p }: { q: any; p: ReturnType<typeof usePricing> }) {
  const [bulkProfit, setBulkProfit] = useState('');
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
      <div className="flex items-center gap-2 flex-wrap bg-gray-50 border border-[#e2e8f0] rounded-lg px-3 py-2">
        <span className="text-[12px] font-semibold text-gray-600">החל רווח</span>
        <input
          type="number"
          value={bulkProfit}
          onChange={(e) => setBulkProfit(e.target.value)}
          placeholder="%"
          className="w-16 border border-[#e2e8f0] rounded px-2 py-1 text-[12px] text-center"
        />
        <span className="text-[12px] text-gray-500">% על:</span>
        <button onClick={() => applyBulk('pipe')} disabled={bulkProfit === ''} className="text-[12px] bg-white border border-[#1a56db] text-[#1a56db] px-3 py-1 rounded-lg hover:bg-blue-50 disabled:opacity-40 disabled:cursor-not-allowed">צנרת</button>
        <button onClick={() => applyBulk('accessory')} disabled={bulkProfit === ''} className="text-[12px] bg-white border border-[#1a56db] text-[#1a56db] px-3 py-1 rounded-lg hover:bg-blue-50 disabled:opacity-40 disabled:cursor-not-allowed">אביזרים</button>
        <button onClick={() => applyBulk('all')} disabled={bulkProfit === ''} className="text-[12px] bg-white border border-gray-300 text-gray-600 px-3 py-1 rounded-lg hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed">הכל</button>
        <span className="text-[11px] text-gray-400">(צינור קצר/רוקר נכלל באביזרים)</span>
      </div>
      <div className="overflow-x-auto">
        <div className="grid grid-cols-[1fr_55px_46px_60px_45px_50px_70px_55px_50px_75px_50px_75px_24px] gap-1 text-[11px] font-semibold text-gray-500 px-1">
          <span>מוצר</span><span>קוטר</span><span>לחץ PN</span><span>קשיחות SN</span><span>כמות</span><span>יחידה</span><span>עלות ₪</span><span>תקורות%</span><span>רווח%</span><span>מחיר מכירה</span><span>הנחה%</span><span>סה״כ</span><span></span>
        </div>
        {p.editingItems.map((item, idx) => {
          const spec = parsePipeSpec(item.product_name, { pn: item.pn, sn: item.sn });
          return (
          <div key={idx} className="grid grid-cols-[1fr_55px_46px_60px_45px_50px_70px_55px_50px_75px_50px_75px_24px] gap-1">
            <AutoTextarea value={item.product_name} onChange={(v) => p.updateItem(idx, 'product_name', v)} placeholder="שם מוצר" className="border border-[#e2e8f0] rounded px-1.5 py-1 text-[12px] min-w-0 w-full" />
            <input type="text" value={item.dn_size || ''} onChange={(e) => p.updateItem(idx, 'dn_size', e.target.value)} placeholder="DN" className="border border-[#e2e8f0] rounded px-1.5 py-1 text-[12px] min-w-0" />
            <span className="flex items-center justify-center text-[11px] text-gray-500 min-w-0" title="לחץ עבודה (מתוך תיאור המוצר)">{spec.pn || '—'}</span>
            <span className="flex items-center justify-center text-[11px] text-gray-500 min-w-0 truncate" title="קשיחות (מתוך תיאור המוצר)">{fmtSn(spec.sn) || '—'}</span>
            <input type="number" value={item.quantity || ''} onChange={(e) => p.updateItem(idx, 'quantity', e.target.value)} className="border border-[#e2e8f0] rounded px-1 py-1 text-[12px] min-w-0" />
            <input type="text" value={item.unit || 'מטר'} onChange={(e) => p.updateItem(idx, 'unit', e.target.value)} className="border border-[#e2e8f0] rounded px-1 py-1 text-[12px] min-w-0" />
            <input type="number" value={item.cost_price || ''} onChange={(e) => p.updateItem(idx, 'cost_price', e.target.value)} placeholder="₪" className="border border-[#e2e8f0] rounded px-1.5 py-1 text-[12px] min-w-0" />
            <input type="number" value={item.overheads_pct ?? ''} onChange={(e) => p.updateItem(idx, 'overheads_pct', e.target.value)} placeholder="%" className="border border-[#e2e8f0] rounded px-1 py-1 text-[12px] min-w-0" />
            <input type="number" value={item.profit_pct ?? ''} onChange={(e) => p.updateItem(idx, 'profit_pct', e.target.value)} placeholder="%" className="border border-[#e2e8f0] rounded px-1 py-1 text-[12px] min-w-0" />
            <input type="number" value={item.unit_price || ''} onChange={(e) => p.updateItem(idx, 'unit_price', e.target.value)} placeholder="₪" className="border border-[#e2e8f0] rounded px-1.5 py-1 text-[12px] min-w-0 bg-blue-50" />
            <input type="number" value={item.discount_pct || ''} onChange={(e) => p.updateItem(idx, 'discount_pct', e.target.value)} placeholder="%" className="border border-[#e2e8f0] rounded px-1 py-1 text-[12px] min-w-0 bg-orange-50" />
            <span className="flex items-center text-[12px] font-medium text-gray-600 px-0.5 min-w-0 truncate">{formatCurrency(parseFloat(item.total_price) || 0)}</span>
            <button onClick={() => p.removeEditingItem(idx)} className="text-red-400 hover:text-red-600 text-lg">×</button>
          </div>
          );
        })}
      </div>
      <div className="flex items-center justify-between pt-2">
        <button onClick={() => p.addEditingItem()} className="text-[12px] text-[#1a56db] hover:underline">+ הוסף שורה</button>
        <div className="flex items-center gap-2">
          <span className="text-[12px] text-gray-400">עלות: {formatCurrency(totalCost)}</span>
          {hasAnyDiscount && <span className="text-[12px] text-gray-400">לפני הנחה: {formatCurrency(subtotal)}</span>}
          <span className="text-sm font-bold text-gray-700">מכירה: {formatCurrency(totalAfterDisc)}</span>
          {totalCost > 0 && (
            <span className="text-[12px] font-semibold text-green-700 bg-green-50 border border-green-200 rounded px-2 py-0.5 whitespace-nowrap" title="אחוז ההפרש בין מחיר המכירה לעלות הישירה">
              פער מהעלות: +{diffPct.toFixed(1)}%
            </span>
          )}
          <button onClick={p.cancelEditQuote} className="text-sm text-gray-500 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors">ביטול</button>
          <button onClick={() => p.saveQuoteItems(q.id)} disabled={p.saving} className="text-sm bg-[#1a56db] text-white px-4 py-1.5 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50">{p.saving ? 'שומר...' : 'שמור'}</button>
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
  const colCount = hasAnyDiscount ? 12 : 11;

  return (
    <div className="overflow-x-auto rounded-lg border border-[#e2e8f0]">
      <table className="w-full text-sm border-collapse">
        <colgroup>
          <col />
          <col style={{ width: '52px' }} />
          <col style={{ width: '56px' }} />
          <col style={{ width: '72px' }} />
          <col style={{ width: '90px' }} />
          <col style={{ width: '76px' }} />
          <col style={{ width: '62px' }} />
          <col style={{ width: '52px' }} />
          <col style={{ width: '82px' }} />
          {hasAnyDiscount && <col style={{ width: '58px' }} />}
          <col style={{ width: '88px' }} />
          <col style={{ width: '24px' }} />
        </colgroup>
        <thead>
          <tr className="bg-gray-50 border-b border-[#e2e8f0]">
            <th className="text-right text-[11px] text-gray-500 font-semibold py-2 px-2">מוצר</th>
            <th className="text-right text-[11px] text-gray-500 font-semibold py-2 px-1 border-r border-[#e2e8f0]">קוטר</th>
            <th className="text-right text-[11px] text-gray-500 font-semibold py-2 px-1 border-r border-[#e2e8f0]">לחץ (PN)</th>
            <th className="text-right text-[11px] text-gray-500 font-semibold py-2 px-1 border-r border-[#e2e8f0]">קשיחות (SN)</th>
            <th className="text-right text-[11px] text-gray-500 font-semibold py-2 px-1 border-r border-[#e2e8f0]">כמות</th>
            <th className="text-right text-[11px] text-gray-500 font-semibold py-2 px-1 border-r border-[#e2e8f0]">עלות</th>
            <th className="text-right text-[11px] text-gray-500 font-semibold py-2 px-1 border-r border-[#e2e8f0]">תקורות%</th>
            <th className="text-right text-[11px] text-gray-500 font-semibold py-2 px-1 border-r border-[#e2e8f0]">רווח%</th>
            <th className="text-right text-[11px] text-gray-500 font-semibold py-2 px-1 border-r border-[#e2e8f0]">מחיר מכירה</th>
            {hasAnyDiscount && <th className="text-right text-[11px] text-orange-500 font-semibold py-2 px-1 border-r border-[#e2e8f0]">הנחה%</th>}
            <th className="text-right text-[11px] text-gray-700 font-semibold py-2 px-1 border-r border-[#e2e8f0]">סה״כ</th>
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
              <tr key={item.id} className="border-b border-[#f0f0f0] hover:bg-blue-50/30 transition-colors">
                <td className="py-2 px-2 text-gray-700 text-[12px]">
                  <span title={item.product_name} className="block break-words text-right" dir="ltr">{item.product_name}</span>
                </td>
                <td className="py-2 px-1 text-gray-600 text-[12px] text-center border-r border-[#f0f0f0] whitespace-nowrap">{item.dn_size || '—'}</td>
                {(() => { const spec = parsePipeSpec(item.product_name, { pn: item.pn, sn: item.sn }); return (<>
                  <td className="py-2 px-1 text-gray-600 text-[12px] text-center border-r border-[#f0f0f0] whitespace-nowrap">{spec.pn || '—'}</td>
                  <td className="py-2 px-1 text-gray-600 text-[12px] text-center border-r border-[#f0f0f0] whitespace-nowrap">{fmtSn(spec.sn) || '—'}</td>
                </>); })()}
                <td className="py-2 px-1 text-gray-600 text-[12px] border-r border-[#f0f0f0] whitespace-nowrap">{item.quantity} {item.unit}</td>
                <td className="py-2 px-1 text-gray-600 text-[12px] border-r border-[#f0f0f0] whitespace-nowrap">{formatCurrency(cost)}</td>
                <td className="py-2 px-1 text-gray-500 text-[12px] text-center border-r border-[#f0f0f0] whitespace-nowrap">{item.overheads_pct}%</td>
                <td className="py-2 px-1 text-gray-500 text-[12px] text-center border-r border-[#f0f0f0] whitespace-nowrap">{item.profit_pct}%</td>
                <td className="py-2 px-1 text-gray-600 text-[12px] border-r border-[#f0f0f0] whitespace-nowrap">{formatCurrency(unit)}</td>
                {hasAnyDiscount && <td className="py-2 px-1 text-orange-600 text-[12px] font-medium text-center border-r border-[#f0f0f0] whitespace-nowrap">{disc > 0 ? `${disc}%` : '—'}</td>}
                <td className="py-2 px-1 font-semibold text-gray-800 text-[12px] border-r border-[#f0f0f0] whitespace-nowrap">{formatCurrency(tot)}</td>
                <td className="py-2 text-center">
                  <span title={tooltip} className="cursor-help text-gray-300 hover:text-[#1a56db] text-[13px]">ⓘ</span>
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          {(hasAnyDiscount || globalDisc > 0) && (
            <tr className="border-t border-gray-100 bg-gray-50">
              <td colSpan={colCount - 2} className="py-1.5 px-2 text-left text-[12px] text-gray-400"></td>
              <td className="py-1.5 px-1 text-right text-[12px] text-gray-500 border-r border-[#f0f0f0]">סה״כ לפני הנחה</td>
              <td className="py-1.5 px-1 text-[12px] text-gray-500 whitespace-nowrap">{formatCurrency(subtotalBeforeDisc)}</td>
            </tr>
          )}
          {hasAnyDiscount && (
            <tr className="bg-orange-50/50">
              <td colSpan={colCount - 2} className="py-1 px-2 text-left text-[12px] text-gray-400"></td>
              <td className="py-1 px-1 text-right text-[12px] text-orange-600 border-r border-[#f0f0f0]">הנחות שורה</td>
              <td className="py-1 px-1 text-[12px] text-orange-600 whitespace-nowrap">-{formatCurrency(subtotalBeforeDisc - totalAfterLineDisc)}</td>
            </tr>
          )}
          {globalDisc > 0 && (
            <tr className="bg-orange-50/50">
              <td colSpan={colCount - 2} className="py-1 px-2 text-left text-[12px] text-gray-400"></td>
              <td className="py-1 px-1 text-right text-[12px] text-orange-600 border-r border-[#f0f0f0]">הנחה כללית {globalDisc}%</td>
              <td className="py-1 px-1 text-[12px] text-orange-600 whitespace-nowrap">-{formatCurrency(totalAfterLineDisc - finalTotal)}</td>
            </tr>
          )}
          <tr className="border-t-2 border-[#e2e8f0] bg-gray-50">
            <td colSpan={5} className="py-2 px-2 text-right text-[12px] text-gray-400">
              עלות: {formatCurrency(q.total_cost || 0)}
              {(q.total_cost || 0) > 0 && (
                <span className="mr-2 font-semibold text-green-700" title="אחוז ההפרש בין מחיר המכירה לעלות הישירה">
                  · פער מהעלות +{(((finalTotal - q.total_cost) / q.total_cost) * 100).toFixed(1)}%
                </span>
              )}
            </td>
            <td colSpan={colCount - 7} className="py-2 px-1 text-right font-bold text-gray-700">סה״כ מכירה</td>
            <td className="py-2 px-1 font-bold text-[#1a56db] text-[13px] whitespace-nowrap">{formatCurrency(finalTotal)}</td>
            <td className="py-2"></td>
          </tr>
        </tfoot>
      </table>
      <div className="mt-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[11px] font-semibold text-gray-600">הערות משפטיות:</span>
          <button onClick={() => { if (confirm('לרענן מתבנית ברירת המחדל?')) p.refreshDisclaimer(q.id); }} className="text-[10px] text-blue-500 hover:text-blue-700 hover:underline">🔄 רענן מתבנית</button>
        </div>
        <textarea
          value={q.disclaimer_text || ''}
          onChange={(e) => p.setQuoteField(q.id, 'disclaimer_text', e.target.value)}
          onBlur={(e) => p.updateDisclaimerText(q.id, e.target.value)}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-[11px] text-gray-600 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#1a56db]/20 min-h-[80px] resize-y leading-relaxed"
        />
      </div>
      <div className="mt-3">
        <span className="text-[11px] font-semibold text-gray-600">תנאי תשלום:</span>
        <textarea
          rows={2}
          value={q.payment_terms || ''}
          onChange={(e) => p.setQuoteField(q.id, 'payment_terms', e.target.value)}
          onBlur={(e) => p.updatePaymentTerms(q.id, e.target.value)}
          className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-[11px] text-gray-600 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#1a56db]/20 mt-1 resize-y leading-relaxed whitespace-pre-wrap"
          placeholder="40% מקדמה, יתרה שוטף +30"
        />
      </div>
      <div className="mt-3">
        <span className="text-[11px] font-semibold text-gray-600">זמן אספקה:</span>
        <textarea
          rows={2}
          value={q.delivery_time || ''}
          onChange={(e) => p.setQuoteField(q.id, 'delivery_time', e.target.value)}
          onBlur={(e) => p.updateDeliveryTime(q.id, e.target.value)}
          className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-[11px] text-gray-600 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#1a56db]/20 mt-1 resize-y leading-relaxed whitespace-pre-wrap"
          placeholder="70 ימי עבודה מיום סגירת הזמנה..."
        />
      </div>
      {q.cost_input_id && (
        <p className="mt-1 text-[11px] text-blue-500 cursor-pointer hover:underline" onClick={(e) => { e.stopPropagation(); p.setPricingTab('costs'); p.setExpandedCostInput(q.cost_input_id); }}>🔗 מקושר לתמחור</p>
      )}
      {(() => {
        const qAtts = p.attachments.filter((a) => a.entity_type === 'quote' && a.entity_id === q.id);
        if (qAtts.length === 0) return null;
        return (
          <div className="mt-3 border-t border-gray-100 pt-2">
            <span className="text-[11px] font-semibold text-gray-600">📎 שרטוטים ומסמכים ({qAtts.length}):</span>
            <div className="flex flex-wrap gap-2 mt-1">
              {qAtts.map((a: any) => (
                <div key={a.id} className="flex items-center gap-1 bg-indigo-50 rounded px-2 py-1 text-[11px] text-indigo-700">
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
                  <button onClick={() => { if (confirm('למחוק קובץ זה?')) p.deleteAttachment(a.id); }} className="text-red-400 hover:text-red-600 mr-1">×</button>
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
    <div className="mb-3 bg-gray-50 rounded-lg p-3 space-y-2">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px]">
        <span className="text-gray-500">עלות: <strong className="text-gray-700">{formatCurrency(summary.totalCost)}</strong></span>
        <span className="text-gray-500">תקורות: <strong className="text-gray-700">{formatCurrency(summary.totalOverheads)}</strong></span>
        <span className="text-gray-500">רווח: <strong className="text-green-700">{formatCurrency(summary.totalProfit)}</strong></span>
        <span className="text-gray-500">מכירה: <strong className="text-gray-700">{formatCurrency(summary.totalSelling)}</strong></span>
        <span className={`font-bold ${summary.avgMarginPct < 10 ? 'text-red-600' : summary.avgMarginPct > 60 ? 'text-amber-600' : 'text-green-700'}`}>
          מרווח ממוצע: {summary.avgMarginPct.toFixed(1)}%
        </span>
        {forexCurrency && forexRate > 0 && (
          <span className="text-blue-600">
            ≈ {forexSym}{sellingForex.toLocaleString('he-IL', { maximumFractionDigits: 0 })} @ {forexRate.toFixed(2)}
          </span>
        )}
      </div>

      {Object.keys(summary.byCategory).length > 1 && (
        <div className="flex flex-wrap gap-1.5 pt-1 border-t border-gray-200">
          {Object.entries(summary.byCategory).map(([cat, v]) => {
            const pct = summary.totalSelling > 0 ? (v.selling / summary.totalSelling) * 100 : 0;
            return (
              <span key={cat} className="text-[11px] bg-white border border-gray-200 rounded-full px-2 py-0.5 text-gray-600">
                <strong className="text-gray-700">{cat}</strong>
                <span className="mx-1 text-gray-300">·</span>
                <span>{formatCurrency(v.selling)}</span>
                <span className="text-gray-400 ml-1">({pct.toFixed(0)}%)</span>
              </span>
            );
          })}
        </div>
      )}

      {warnings.length > 0 && (
        <div className="flex flex-wrap gap-1 pt-1 border-t border-gray-200">
          {warnings.map((w, i) => {
            const { bg, icon, msg } = WARNING_STYLE[w.issue];
            return (
              <span key={i} className={`text-[11px] rounded px-2 py-0.5 ${bg}`}>
                {icon} <strong>{w.product_name || `שורה ${w.index + 1}`}</strong>
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

const WARNING_STYLE: Record<'low_margin' | 'high_margin' | 'zero_cost', { bg: string; icon: string; msg: string }> = {
  low_margin:  { bg: 'bg-red-50 text-red-700 border border-red-200',     icon: '⚠️', msg: 'מרווח נמוך מ-10%' },
  high_margin: { bg: 'bg-amber-50 text-amber-700 border border-amber-200', icon: '⚡', msg: 'מרווח גבוה מ-60%' },
  zero_cost:   { bg: 'bg-purple-50 text-purple-700 border border-purple-200', icon: '🔍', msg: 'עלות אפס' },
};

function OrdersTab({ p }: { p: ReturnType<typeof usePricing> }) {
  if (p.orders.length === 0) {
    return <p className="text-sm text-gray-400 text-center py-3">אין הזמנות. הזמנות נוצרות אוטומטית כשהצעת מחיר נחתמת.</p>;
  }

  return (
    <div className="space-y-3">
      {p.orders.map((ord) => {
        const ost = ORDER_STATUS_MAP[ord.status] || ORDER_STATUS_MAP.pending;
        const linkedQuote = p.quotes.find((q) => q.id === ord.quote_id);
        return (
          <div key={ord.id} className="border border-[#e2e8f0] rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <span className="text-sm font-mono text-gray-400">{ord.order_number}</span>
                <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${ost.color}`}>{ost.label}</span>
              </div>
              <span className="text-sm font-bold text-gray-700">{formatCurrency(ord.total_amount || 0)}</span>
            </div>
            {linkedQuote && (
              <p className="text-[12px] text-blue-500 mb-2 cursor-pointer hover:underline" onClick={() => { p.setPricingTab('quotes'); p.setExpandedQuote(linkedQuote.id); }}>
                🔗 הצעה: {linkedQuote.quote_number} — {linkedQuote.client_name}
              </p>
            )}
            <div className="flex items-center gap-2 text-[12px] text-gray-500 mb-3">
              <span>מקדמה {ord.advance_percent}%: {ord.advance_paid ? '✅ שולם' : '⏳ טרם שולם'}</span>
              <span className="text-gray-300">|</span>
              <span>יתרה: {ord.balance_paid ? '✅ שולם' : '⏳ טרם שולם'}</span>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {ord.status === 'pending' && (
                <button onClick={() => p.updateOrderStatus(ord.id, 'confirmed')} className="text-[12px] bg-blue-50 text-blue-700 px-3 py-1 rounded-lg hover:bg-blue-100 transition-colors">✅ אשר הזמנה</button>
              )}
              {ord.status === 'confirmed' && (
                <button onClick={() => p.updateOrderStatus(ord.id, 'in_production')} className="text-[12px] bg-purple-50 text-purple-700 px-3 py-1 rounded-lg hover:bg-purple-100 transition-colors">🏭 בייצור</button>
              )}
              {ord.status === 'in_production' && (
                <button onClick={() => p.updateOrderStatus(ord.id, 'delivered')} className="text-[12px] bg-green-50 text-green-700 px-3 py-1 rounded-lg hover:bg-green-100 transition-colors">🚚 סופק</button>
              )}
              {ord.status === 'delivered' && (
                <button onClick={() => p.updateOrderStatus(ord.id, 'completed')} className="text-[12px] bg-gray-100 text-gray-600 px-3 py-1 rounded-lg hover:bg-gray-200 transition-colors">✔️ הושלם</button>
              )}
            </div>
            {ord.notes && <p className="text-[12px] text-gray-500 mt-2">📌 {ord.notes}</p>}
          </div>
        );
      })}
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
    <div className="mb-3 p-3 bg-purple-50/50 rounded-lg border border-purple-100">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-[12px] font-semibold text-purple-700">🔗 קישור שיתוף</h4>
        <span className={`text-[11px] px-2 py-0.5 rounded-full ${isExpired ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-700'}`}>
          {isExpired ? 'פג תוקף' : `בתוקף עד ${expiresAt}`}
        </span>
      </div>
      {views.length > 0 ? (
        <div className="space-y-1 max-h-28 overflow-y-auto">
          <p className="text-[11px] font-semibold text-green-700 mb-1">👁 {views.length} צפייות</p>
          {views.map((v: any) => (
            <div key={v.id} className="flex items-center gap-3 text-[11px] text-gray-600">
              <span>{new Date(v.viewed_at).toLocaleString('he-IL')}</span>
              {v.ip_address && <span className="text-gray-400 font-mono text-[10px]">{v.ip_address}</span>}
              <span className="text-gray-400">{v.user_agent?.includes('Mobile') ? '📱 נייד' : '💻 מחשב'}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-[11px] text-gray-400">הלקוח עדיין לא צפה בקישור</p>
      )}
    </div>
  );
}
