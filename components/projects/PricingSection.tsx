'use client';

import { usePricing } from '@/hooks/usePricing';
import { DISCLAIMER_TYPES } from '@/lib/disclaimers';
import { CURRENCY_SYMBOLS } from '@/lib/exchange-rate';
import { calcCostPerMeter, calcRokerCostPerMeter } from '@/lib/pricing';
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
  { value: 'roker', label: 'רוקר' },
  { value: 'elbow', label: 'ברך' },
  { value: 'flange', label: 'אוגן' },
  { value: 'reducer', label: 'מעבר קטרים' },
  { value: 'other', label: 'אחר' },
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
            {label}{key === 'costs' && p.costInputs.length > 0 ? ` (${p.costInputs.length})` : ''}{key === 'quotes' && p.quotes.length > 0 ? ` (${p.quotes.length})` : ''}{key === 'orders' && p.orders.length > 0 ? ` (${p.orders.length})` : ''}
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
      <div className="flex justify-end mb-3">
        <button onClick={() => p.setShowNewCostInput(!p.showNewCostInput)} className="text-sm bg-amber-600 text-white px-3 py-1.5 rounded-lg hover:bg-amber-700 transition-colors">
          {p.showNewCostInput ? 'ביטול' : '+ תמחור חדש'}
        </button>
      </div>

      {/* New cost input form */}
      {p.showNewCostInput && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
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
            <div>
              <label className="block text-[12px] font-semibold text-gray-500 mb-1">שם מקור</label>
              <input type="text" value={p.newCostInput.source_name} onChange={(e) => p.setNewCostInput({ ...p.newCostInput, source_name: e.target.value })} className="w-full border border-[#e2e8f0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a56db]/20" placeholder={p.newCostInput.source_type === 'supplier' ? 'Amiblu' : 'הלל'} autoFocus />
            </div>
            {p.newCostInput.source_type === 'supplier' && (
              <div>
                <label className="block text-[12px] font-semibold text-gray-500 mb-1">מטבע</label>
                <select value={p.newCostInput.currency} onChange={(e) => p.setNewCostInput({ ...p.newCostInput, currency: e.target.value })} className="w-full border border-[#e2e8f0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a56db]/20">
                  <option value="USD">$ דולר</option>
                  <option value="EUR">€ אירו</option>
                  <option value="ILS">₪ שקל</option>
                </select>
              </div>
            )}
            <div>
              <label className="block text-[12px] font-semibold text-gray-500 mb-1">הערות</label>
              <input type="text" value={p.newCostInput.notes} onChange={(e) => p.setNewCostInput({ ...p.newCostInput, notes: e.target.value })} className="w-full border border-[#e2e8f0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a56db]/20" placeholder="אופציונלי" />
            </div>
          </div>
          {p.newCostInput.source_type === 'supplier' && p.newCostInput.currency !== 'ILS' && (
            <div className="text-[12px] text-gray-500">
              שער {CURRENCY_SYMBOLS[p.newCostInput.currency] || ''}/₪: <strong>{p.exchangeRates[p.newCostInput.currency]?.rate?.toFixed(4) || 'טוען...'}</strong>
            </div>
          )}
          <button onClick={p.createCostInput} disabled={!p.newCostInput.source_name.trim()} className="bg-amber-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-amber-700 transition-colors disabled:opacity-50">צור תמחור</button>
        </div>
      )}

      {/* Cost inputs list */}
      {p.costInputs.length === 0 && !p.showNewCostInput ? (
        <p className="text-sm text-gray-400 text-center py-3">אין תמחורים. לחץ &quot;+ תמחור חדש&quot; להוסיף.</p>
      ) : (
        <div className="space-y-3">
          {p.costInputs.map((ci) => (
            <CostInputCard key={ci.id} ci={ci} p={p} />
          ))}
        </div>
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

  return (
    <div className="border border-[#e2e8f0] rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 bg-amber-50/50 cursor-pointer hover:bg-amber-50 transition-colors" onClick={() => p.setExpandedCostInput(isExp ? null : ci.id)}>
        <div className="flex items-center gap-3">
          <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${ci.source_type === 'supplier' ? 'bg-orange-100 text-orange-700' : 'bg-purple-100 text-purple-700'}`}>{ci.source_type === 'supplier' ? 'ספק' : 'פנימי'}</span>
          <span className="text-sm font-bold text-gray-700">{ci.source_name}</span>
          {isForex && <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 font-medium">{ci.currency} {ci.exchange_rate ? `@ ${parseFloat(ci.exchange_rate).toFixed(2)}` : ''}</span>}
          <span className="text-[11px] text-gray-400">{formatDate(ci.created_at)}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm font-bold text-gray-700">{formatCurrency(ciTotal)}</span>
          <svg className={`w-4 h-4 text-gray-400 transition-transform ${isExp ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9" /></svg>
        </div>
      </div>

      {isExp && (
        <div className="px-4 py-3 border-t border-[#e2e8f0]">
          {/* Action buttons */}
          {!isEdit && (
            <div className="flex items-center gap-2 mb-3">
              <button onClick={() => p.startEditCostInput(ci.id)} className="text-[12px] bg-amber-50 text-amber-700 px-3 py-1 rounded-lg hover:bg-amber-100 transition-colors">✏️ ערוך פריטים</button>
              <label className={`text-[12px] px-3 py-1 rounded-lg cursor-pointer transition-colors ${p.parsingCostFile ? 'bg-purple-100 text-purple-400' : 'bg-purple-50 text-purple-700 hover:bg-purple-100'}`}>
                {p.parsingCostFile ? '🔄 Roxy מעבדת...' : '📎 העלה קובץ ל-Roxy'}
                <input type="file" className="hidden" accept="image/*,.pdf,.xlsx,.xls,.csv,.doc,.docx" multiple disabled={p.parsingCostFile} onChange={(e) => { if (e.target.files?.length) { p.parseCostFile(e.target.files, ci.id); e.target.value = ''; } }} />
              </label>
            </div>
          )}
          {ci.notes && <p className="text-[12px] text-gray-500 mb-3">📌 {ci.notes}</p>}

          {/* Edit mode */}
          {isEdit ? (
            <CostItemsEditor ci={ci} p={p} />
          ) : citems.length > 0 ? (
            <CostItemsDisplay citems={citems} ciTotal={ciTotal} isForex={isForex} sym={sym} ci={ci} />
          ) : (
            <p className="text-sm text-gray-400 text-center py-2">אין פריטים. לחץ &quot;ערוך פריטים&quot; להוסיף.</p>
          )}

          {/* Pipe calculator helper */}
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
          /* Foreign currency grid */
          <>
            <div className="grid grid-cols-[1fr_80px_70px_55px_70px_80px_60px_80px_32px] gap-1 text-[11px] font-semibold text-gray-500 px-1 min-w-[700px]">
              <span>מוצר</span><span>סוג</span><span>קוטר</span><span>כמות</span><span>יחידה</span><span>מחיר {sym}</span><span>שער</span><span>מחיר ₪</span><span></span>
            </div>
            {p.editingCostItems.map((item: any, idx: number) => (
              <div key={idx} className="grid grid-cols-[1fr_80px_70px_55px_70px_80px_60px_80px_32px] gap-1 min-w-[700px]">
                <input type="text" value={item.product_name} onChange={(e) => p.updateCostItem(idx, 'product_name', e.target.value)} placeholder="שם מוצר" className="border border-[#e2e8f0] rounded px-2 py-1.5 text-sm" />
                <select value={item.item_type || ''} onChange={(e) => p.updateCostItem(idx, 'item_type', e.target.value)} className="border border-[#e2e8f0] rounded px-1 py-1.5 text-[11px]">
                  {ITEM_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
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
          /* ILS grid (same as before) */
          <>
            <div className="grid grid-cols-[1fr_80px_70px_55px_70px_80px_80px_32px] gap-1 text-[11px] font-semibold text-gray-500 px-1">
              <span>מוצר</span><span>סוג</span><span>קוטר</span><span>כמות</span><span>יחידה</span><span>מחיר עלות</span><span>סה״כ</span><span></span>
            </div>
            {p.editingCostItems.map((item: any, idx: number) => (
              <div key={idx} className="grid grid-cols-[1fr_80px_70px_55px_70px_80px_80px_32px] gap-1">
                <input type="text" value={item.product_name} onChange={(e) => p.updateCostItem(idx, 'product_name', e.target.value)} placeholder="שם מוצר" className="border border-[#e2e8f0] rounded px-2 py-1.5 text-sm" />
                <select value={item.item_type || ''} onChange={(e) => p.updateCostItem(idx, 'item_type', e.target.value)} className="border border-[#e2e8f0] rounded px-1 py-1.5 text-[11px]">
                  {ITEM_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
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
        <button onClick={p.addCostItem} className="text-[12px] text-amber-700 hover:underline">+ הוסף שורה</button>
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-gray-700">סה״כ: {formatCurrency(p.editingCostItems.reduce((s: number, i: any) => s + (parseFloat(i.total_cost) || 0), 0))}</span>
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
      <table className="w-full text-sm">
        <thead><tr className="border-b border-[#e2e8f0]">
          <th className="text-right text-[11px] text-gray-500 font-medium pb-1.5 pr-1">מוצר</th>
          <th className="text-right text-[11px] text-gray-500 font-medium pb-1.5">סוג</th>
          <th className="text-right text-[11px] text-gray-500 font-medium pb-1.5">קוטר</th>
          <th className="text-right text-[11px] text-gray-500 font-medium pb-1.5">כמות</th>
          {isForex && <th className="text-right text-[11px] text-gray-500 font-medium pb-1.5">מחיר {sym}</th>}
          <th className="text-right text-[11px] text-gray-500 font-medium pb-1.5">מחיר ₪</th>
          <th className="text-right text-[11px] text-gray-500 font-medium pb-1.5">סה״כ ₪</th>
        </tr></thead>
        <tbody>{citems.map((item: any) => {
          const typeLabel = ITEM_TYPES.find((t) => t.value === item.item_type)?.label || '';
          return (
            <tr key={item.id} className="border-b border-gray-50">
              <td className="py-1.5 pr-1 text-gray-700">{item.product_name}</td>
              <td className="py-1.5 text-[11px] text-gray-500">{typeLabel}</td>
              <td className="py-1.5 text-gray-500">{item.dn_size || '—'}</td>
              <td className="py-1.5 text-gray-500">{item.quantity} {item.unit}</td>
              {isForex && <td className="py-1.5 text-gray-500">{sym}{parseFloat(item.original_price || 0).toFixed(2)}</td>}
              <td className="py-1.5 text-gray-500">{formatCurrency(item.cost_price)}</td>
              <td className="py-1.5 font-medium text-gray-700">{formatCurrency(item.total_cost)}</td>
            </tr>
          );
        })}</tbody>
        <tfoot><tr className="border-t border-[#e2e8f0]">
          <td colSpan={isForex ? 5 : 4} className="py-2 text-left font-bold text-gray-700">סה״כ עלות</td>
          <td colSpan={2} className="py-2 font-bold text-gray-700">{formatCurrency(ciTotal)}</td>
        </tr></tfoot>
      </table>
    </div>
  );
}

function PipeCalcHelper({ citems, ci, rates }: { citems: any[]; ci: any; rates: Record<string, any> }) {
  // Find pipe_bare + coupling pairs by DN
  const bareItems = citems.filter((i: any) => i.item_type === 'pipe_bare');
  const couplingItems = citems.filter((i: any) => i.item_type === 'coupling');
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
      <p className="text-[12px] font-bold text-blue-700 mb-2">📐 חישוב עלות למ״ר (צינור + מחבר)</p>
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
              <span>צינור ({length}מ׳): </span>
              {isForex && <span className="text-gray-500">{sym}{costPerMeter.toFixed(2)} → </span>}
              <span className="font-bold text-blue-800">₪{costPerMeterILS.toFixed(2)}/מ׳</span>
              {roker && dnNum > 0 && (
                <>
                  <span className="mx-2 text-gray-300">|</span>
                  <span>רוקר ({roker.rokerLength.toFixed(1)}מ׳): </span>
                  {isForex && <span className="text-gray-500">{sym}{roker.costPerMeter.toFixed(2)} → </span>}
                  <span className="font-bold text-purple-700">₪{rokerILS?.toFixed(2)}/מ׳</span>
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
  return (
    <>
      <div className="flex justify-end mb-3">
        <button onClick={() => p.setShowNewQuote(!p.showNewQuote)} className="text-sm bg-[#1a56db] text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 transition-colors">
          {p.showNewQuote ? 'ביטול' : '+ הצעה חדשה'}
        </button>
      </div>

      {/* New quote form */}
      {p.showNewQuote && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-[12px] font-semibold text-gray-500 mb-1">שם לקוח / קבלן</label>
              <input type="text" value={p.newQuote.client_name} onChange={(e) => p.setNewQuote({ ...p.newQuote, client_name: e.target.value })} className="w-full border border-[#e2e8f0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a56db]/20" placeholder="שם הלקוח" autoFocus />
            </div>
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
                <select value={p.newQuote.cost_input_id} onChange={(e) => p.setNewQuote({ ...p.newQuote, cost_input_id: e.target.value })} className="w-full border border-[#e2e8f0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a56db]/20">
                  <option value="">ללא קישור</option>
                  {p.costInputs.map((ci) => <option key={ci.id} value={ci.id}>{ci.source_name} ({ci.source_type === 'supplier' ? 'ספק' : 'פנימי'})</option>)}
                </select>
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
              <select value={p.newQuote.disclaimer_type} onChange={(e) => p.setNewQuote({ ...p.newQuote, disclaimer_type: e.target.value })} className="w-full border border-[#e2e8f0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a56db]/20">
                {DISCLAIMER_TYPES.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[12px] font-semibold text-gray-500 mb-1">תנאי תשלום</label>
              <input type="text" value={p.newQuote.payment_terms} onChange={(e) => p.setNewQuote({ ...p.newQuote, payment_terms: e.target.value })} className="w-full border border-[#e2e8f0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a56db]/20" />
            </div>
          </div>
          <div>
            <label className="block text-[12px] font-semibold text-gray-500 mb-1">הערות</label>
            <input type="text" value={p.newQuote.notes} onChange={(e) => p.setNewQuote({ ...p.newQuote, notes: e.target.value })} className="w-full border border-[#e2e8f0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a56db]/20" placeholder="אופציונלי" />
          </div>
          <button onClick={p.createQuote} disabled={!p.newQuote.client_name.trim()} className="bg-[#1a56db] text-white text-sm px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50">צור הצעה</button>
        </div>
      )}

      {/* Quotes list */}
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
  const isExpanded = p.expandedQuote === q.id;
  const isEditing = p.editingQuote === q.id;
  const items = p.quoteItems[q.id] || [];

  return (
    <div className="border border-[#e2e8f0] rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 bg-gray-50 cursor-pointer hover:bg-gray-100 transition-colors" onClick={() => p.setExpandedQuote(isExpanded ? null : q.id)}>
        <div className="flex items-center gap-3">
          <span className="text-sm font-mono text-gray-400">{q.quote_number}</span>
          <span className="text-sm font-bold text-gray-700">{q.client_name}</span>
          <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${st.color}`}>{st.label}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm font-bold text-gray-700">{formatCurrency(q.total_amount || 0)}</span>
          <svg className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9" /></svg>
        </div>
      </div>

      {isExpanded && (
        <div className="px-4 py-3 border-t border-[#e2e8f0]">
          {/* Action buttons */}
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            {!isEditing && (
              <button onClick={() => p.startEditQuote(q.id)} className="text-[12px] bg-blue-50 text-[#1a56db] px-3 py-1 rounded-lg hover:bg-blue-100 transition-colors">✏️ ערוך פריטים</button>
            )}
            {q.status === 'draft' && (
              <button onClick={() => p.updateQuoteStatus(q.id, 'sent')} className="text-[12px] bg-blue-50 text-blue-700 px-3 py-1 rounded-lg hover:bg-blue-100 transition-colors">📤 סמן כנשלח</button>
            )}
            {(q.status === 'sent' || q.status === 'draft') && (
              <button onClick={() => p.updateQuoteStatus(q.id, 'signed')} className="text-[12px] bg-green-50 text-green-700 px-3 py-1 rounded-lg hover:bg-green-100 transition-colors">✅ נחתם</button>
            )}
            {q.status !== 'rejected' && q.status !== 'signed' && (
              <button onClick={() => p.updateQuoteStatus(q.id, 'rejected')} className="text-[12px] bg-red-50 text-red-600 px-3 py-1 rounded-lg hover:bg-red-100 transition-colors">❌ נדחה</button>
            )}
            {q.status === 'draft' && (
              <button onClick={() => { if (confirm('למחוק הצעה זו?')) p.deleteQuote(q.id); }} className="text-[12px] text-red-400 px-3 py-1 rounded-lg hover:bg-red-50 transition-colors mr-auto">🗑️ מחק</button>
            )}
          </div>

          {/* Margin summary */}
          {q.total_cost > 0 && q.total_amount > 0 && (
            <div className="flex items-center gap-4 text-[11px] text-gray-500 mb-3 bg-gray-50 rounded px-3 py-1.5">
              <span>עלות: {formatCurrency(q.total_cost)}</span>
              <span>מכירה: {formatCurrency(q.total_amount)}</span>
              <span className="font-bold text-green-700">מרווח: {((1 - q.total_cost / q.total_amount) * 100).toFixed(1)}%</span>
            </div>
          )}

          {q.notes && <p className="text-[12px] text-gray-500 mb-3">📌 {q.notes}</p>}

          {/* Items — edit or display */}
          {isEditing ? (
            <QuoteItemsEditor q={q} p={p} />
          ) : items.length > 0 ? (
            <QuoteItemsDisplay q={q} items={items} p={p} />
          ) : (
            <p className="text-sm text-gray-400 text-center py-2">אין פריטים. לחץ &quot;ערוך פריטים&quot; להוסיף.</p>
          )}
        </div>
      )}
    </div>
  );
}

function QuoteItemsEditor({ q, p }: { q: any; p: ReturnType<typeof usePricing> }) {
  return (
    <div className="space-y-2">
      <div className="overflow-x-auto">
        <div className="grid grid-cols-[1fr_70px_55px_70px_85px_65px_65px_85px_90px_28px] gap-1 text-[11px] font-semibold text-gray-500 px-1 min-w-[750px]">
          <span>מוצר</span><span>קוטר</span><span>כמות</span><span>יחידה</span><span>עלות ₪</span><span>תקורות%</span><span>רווח%</span><span>מחיר מכירה</span><span>סה״כ</span><span></span>
        </div>
        {p.editingItems.map((item, idx) => (
          <div key={idx} className="grid grid-cols-[1fr_70px_55px_70px_85px_65px_65px_85px_90px_28px] gap-1 min-w-[750px]">
            <input type="text" value={item.product_name} onChange={(e) => p.updateItem(idx, 'product_name', e.target.value)} placeholder="שם מוצר" className="border border-[#e2e8f0] rounded px-2 py-1.5 text-sm" />
            <input type="text" value={item.dn_size || ''} onChange={(e) => p.updateItem(idx, 'dn_size', e.target.value)} placeholder="DN" className="border border-[#e2e8f0] rounded px-2 py-1.5 text-sm" />
            <input type="number" value={item.quantity || ''} onChange={(e) => p.updateItem(idx, 'quantity', e.target.value)} className="border border-[#e2e8f0] rounded px-2 py-1.5 text-sm" />
            <input type="text" value={item.unit || 'מטר'} onChange={(e) => p.updateItem(idx, 'unit', e.target.value)} className="border border-[#e2e8f0] rounded px-2 py-1.5 text-sm" />
            <input type="number" value={item.cost_price || ''} onChange={(e) => p.updateItem(idx, 'cost_price', e.target.value)} placeholder="₪" className="border border-[#e2e8f0] rounded px-2 py-1.5 text-sm" />
            <input type="number" value={item.overheads_pct ?? ''} onChange={(e) => p.updateItem(idx, 'overheads_pct', e.target.value)} placeholder="%" className="border border-[#e2e8f0] rounded px-2 py-1.5 text-sm" />
            <input type="number" value={item.profit_pct ?? ''} onChange={(e) => p.updateItem(idx, 'profit_pct', e.target.value)} placeholder="%" className="border border-[#e2e8f0] rounded px-2 py-1.5 text-sm" />
            <input type="number" value={item.unit_price || ''} onChange={(e) => p.updateItem(idx, 'unit_price', e.target.value)} placeholder="₪" className="border border-[#e2e8f0] rounded px-2 py-1.5 text-sm bg-blue-50" />
            <span className="flex items-center text-sm font-medium text-gray-600 px-1">{formatCurrency(parseFloat(item.total_price) || 0)}</span>
            <button onClick={() => p.removeEditingItem(idx)} className="text-red-400 hover:text-red-600 text-lg">×</button>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between pt-2">
        <button onClick={() => p.addEditingItem()} className="text-[12px] text-[#1a56db] hover:underline">+ הוסף שורה</button>
        <div className="flex items-center gap-2">
          <span className="text-[12px] text-gray-400">עלות: {formatCurrency(p.editingItems.reduce((s, i) => s + ((parseFloat(i.cost_price) || 0) * (parseFloat(i.quantity) || 0)), 0))}</span>
          <span className="text-sm font-bold text-gray-700">מכירה: {formatCurrency(p.editingItems.reduce((s, i) => s + (parseFloat(i.total_price) || 0), 0))}</span>
          <button onClick={p.cancelEditQuote} className="text-sm text-gray-500 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors">ביטול</button>
          <button onClick={() => p.saveQuoteItems(q.id)} disabled={p.saving} className="text-sm bg-[#1a56db] text-white px-4 py-1.5 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50">{p.saving ? 'שומר...' : 'שמור'}</button>
        </div>
      </div>
    </div>
  );
}

function QuoteItemsDisplay({ q, items, p }: { q: any; items: any[]; p: ReturnType<typeof usePricing> }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[#e2e8f0]">
            <th className="text-right text-[11px] text-gray-500 font-medium pb-1.5 pr-1">מוצר</th>
            <th className="text-right text-[11px] text-gray-500 font-medium pb-1.5">קוטר</th>
            <th className="text-right text-[11px] text-gray-500 font-medium pb-1.5">כמות</th>
            <th className="text-right text-[11px] text-gray-500 font-medium pb-1.5">עלות</th>
            <th className="text-right text-[11px] text-gray-500 font-medium pb-1.5">תקורות%</th>
            <th className="text-right text-[11px] text-gray-500 font-medium pb-1.5">רווח%</th>
            <th className="text-right text-[11px] text-gray-500 font-medium pb-1.5">מחיר מכירה</th>
            <th className="text-right text-[11px] text-gray-500 font-medium pb-1.5">סה״כ</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item: any) => (
            <tr key={item.id} className="border-b border-gray-50">
              <td className="py-1.5 pr-1 text-gray-700">{item.product_name}</td>
              <td className="py-1.5 text-gray-500">{item.dn_size || '—'}</td>
              <td className="py-1.5 text-gray-500">{item.quantity} {item.unit}</td>
              <td className="py-1.5 text-gray-500">{formatCurrency(item.cost_price)}</td>
              <td className="py-1.5 text-gray-500">{item.overheads_pct}%</td>
              <td className="py-1.5 text-gray-500">{item.profit_pct}%</td>
              <td className="py-1.5 text-gray-500">{formatCurrency(item.unit_price)}</td>
              <td className="py-1.5 font-medium text-gray-700">{formatCurrency(item.total_price)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-[#e2e8f0]">
            <td colSpan={3} className="py-2 text-left text-[12px] text-gray-400">עלות: {formatCurrency(q.total_cost || 0)}</td>
            <td colSpan={4} className="py-2 text-left font-bold text-gray-700">סה״כ מכירה</td>
            <td className="py-2 font-bold text-gray-700">{formatCurrency(q.total_amount)}</td>
          </tr>
        </tfoot>
      </table>
      {q.disclaimer_text && (
        <div className="mt-3 p-3 bg-gray-50 rounded-lg text-[11px] text-gray-500 whitespace-pre-line border border-gray-100">
          <span className="font-semibold text-gray-600">הערות משפטיות:</span><br/>{q.disclaimer_text}
        </div>
      )}
      {q.payment_terms && <p className="mt-2 text-[12px] text-gray-500">💳 תנאי תשלום: {q.payment_terms}</p>}
      {q.cost_input_id && (
        <p className="mt-1 text-[11px] text-blue-500 cursor-pointer hover:underline" onClick={(e) => { e.stopPropagation(); p.setPricingTab('costs'); p.setExpandedCostInput(q.cost_input_id); }}>🔗 מקושר לתמחור</p>
      )}
    </div>
  );
}

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
