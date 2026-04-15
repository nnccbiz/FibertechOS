'use client';

import { useState } from 'react';
import type { ExchangeRateInfo } from '@/lib/exchange-rate';
import { formatRate, CURRENCY_SYMBOLS } from '@/lib/exchange-rate';

interface ExchangeRateWidgetProps {
  rates: Record<string, ExchangeRateInfo>;
  loading: boolean;
  onRefresh: (currency: string) => void;
}

export default function ExchangeRateWidget({ rates, loading, onRefresh }: ExchangeRateWidgetProps) {
  const [manualRate, setManualRate] = useState<Record<string, string>>({});
  const [editingCurrency, setEditingCurrency] = useState<string | null>(null);

  const currencies = ['USD', 'EUR'];

  function getAgeLabel(info: ExchangeRateInfo): { label: string; color: string } {
    if (info.stale) return { label: 'לא עדכני', color: 'text-red-500' };
    const now = new Date();
    const rateDate = new Date(info.date);
    const diffHours = (now.getTime() - rateDate.getTime()) / (1000 * 60 * 60);
    if (diffHours < 24) return { label: 'עדכני', color: 'text-green-600' };
    if (diffHours < 72) return { label: `${Math.floor(diffHours / 24)} ימים`, color: 'text-amber-500' };
    return { label: 'ישן', color: 'text-red-500' };
  }

  return (
    <div className="flex items-center gap-4 flex-wrap bg-gray-50 rounded-lg px-3 py-2 mb-3 text-sm">
      {currencies.map((cur) => {
        const info = rates[cur];
        const age = info ? getAgeLabel(info) : null;
        const isEditing = editingCurrency === cur;
        const sym = CURRENCY_SYMBOLS[cur] || cur;

        return (
          <div key={cur} className="flex items-center gap-1.5">
            <span className="text-gray-500 font-medium">{sym}1 =</span>
            {info ? (
              <>
                {isEditing ? (
                  <input
                    type="number"
                    step="0.0001"
                    value={manualRate[cur] || formatRate(info.rate)}
                    onChange={(e) => setManualRate((p) => ({ ...p, [cur]: e.target.value }))}
                    onBlur={() => setEditingCurrency(null)}
                    onKeyDown={(e) => { if (e.key === 'Enter') setEditingCurrency(null); }}
                    className="w-20 border border-blue-300 rounded px-1.5 py-0.5 text-sm text-center"
                    autoFocus
                    dir="ltr"
                  />
                ) : (
                  <span
                    className="font-bold text-gray-800 cursor-pointer hover:text-blue-600"
                    onClick={() => { setEditingCurrency(cur); setManualRate((p) => ({ ...p, [cur]: formatRate(info.rate) })); }}
                    title="לחץ לעריכה ידנית"
                  >
                    ₪{formatRate(info.rate)}
                  </span>
                )}
                {age && <span className={`text-[10px] ${age.color}`}>({age.label})</span>}
              </>
            ) : (
              <span className="text-gray-400">—</span>
            )}
          </div>
        );
      })}

      <button
        onClick={() => { onRefresh('USD'); onRefresh('EUR'); }}
        disabled={loading}
        className="text-[11px] text-blue-600 hover:text-blue-800 disabled:text-gray-400 mr-auto"
        title="רענן שערים מבנק ישראל"
      >
        {loading ? '⏳' : '🔄'} רענן
      </button>

      <span className="text-[10px] text-gray-400">בנק ישראל</span>
    </div>
  );
}
