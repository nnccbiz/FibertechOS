'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import Icon, { type IconName } from '@/components/ui/Icon';

// Live balance from the movements ledger (purchase receipts in, deliveries out).
interface BalanceRow {
  item_key: string;
  description: string | null;
  category: string | null;
  dn: number | null;
  pn: number | null;
  sn: number | null;
  length_m: number | null;
  unit: string | null;
  in_stock: number;
}

interface CategorySummary {
  label: string;
  icon: IconName;
  count: number;
}

function fmtQty(n: any) {
  const v = Number(n) || 0;
  return Number.isInteger(v) ? v.toLocaleString('he-IL') : v.toLocaleString('he-IL', { maximumFractionDigits: 2 });
}

export default function InventoryWidget() {
  const [items, setItems] = useState<BalanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    async function fetchInventory() {
      const supabase = createClient();
      try {
        const { data, error } = await supabase
          .from('inventory_balance')
          .select('*')
          .order('category')
          .order('dn');
        if (error) throw error;
        setItems((data || []) as BalanceRow[]);
      } catch {
        setItems([]);
      } finally {
        setLoading(false);
      }
    }
    fetchInventory();
  }, []);

  const sumCat = (cat: string) =>
    items.filter((i) => (i.category || 'צינורות') === cat).reduce((sum, i) => sum + (Number(i.in_stock) || 0), 0);

  const categories: CategorySummary[] = [
    { label: 'צינורות', icon: 'wrench', count: sumCat('צינורות') },
    { label: 'אביזרים', icon: 'gear', count: sumCat('אביזרים') },
    { label: 'חומרי סיכה', icon: 'drop', count: sumCat('חומרי סיכה') },
  ];

  const pipeItems = items.filter((i) => (i.category || 'צינורות') === 'צינורות' && Number(i.in_stock) !== 0);

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-line-subtle p-5">
        <div className="skeleton h-5 w-24 mb-4" />
        <div className="grid grid-cols-3 gap-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="skeleton h-16 w-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-line-subtle p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-bold text-content-body"><Icon name="inventory" size={20} /> מלאי מהיר</h3>
        <a href="/inventory" className="text-[12px] text-primary hover:underline">למסך המלאי</a>
      </div>

      {/* Category summary tiles */}
      <div className="grid grid-cols-3 gap-2">
        {categories.map((cat) => (
          <div key={cat.label} className="bg-neutral-50 rounded-lg p-3 text-center">
            <span className="block mb-1 text-primary"><Icon name={cat.icon} size={22} /></span>
            <p className="text-[12px] text-content-muted font-medium">{cat.label}</p>
            <p className={`text-lg font-bold mt-0.5 ${cat.count < 0 ? 'text-danger' : 'text-content-body'}`}>
              {cat.count !== 0 ? fmtQty(cat.count) : '—'}
            </p>
          </div>
        ))}
      </div>

      {pipeItems.length > 0 && (
        <button onClick={() => setExpanded(!expanded)} className="mt-2 text-[12px] text-primary hover:underline">
          {expanded ? 'סגור' : 'פירוט'}
        </button>
      )}

      {/* Expanded table for pipes */}
      {expanded && pipeItems.length > 0 && (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-line-subtle">
                <th className="text-right text-content-muted font-medium pb-1.5 pr-1">פריט</th>
                <th className="text-right text-content-muted font-medium pb-1.5">DN</th>
                <th className="text-right text-content-muted font-medium pb-1.5">PN</th>
                <th className="text-right text-content-muted font-medium pb-1.5">SN</th>
                <th className="text-right text-content-muted font-medium pb-1.5">מלאי</th>
              </tr>
            </thead>
            <tbody>
              {pipeItems.map((item) => (
                <tr key={item.item_key} className="border-b border-line-subtle">
                  <td className="py-1.5 pr-1 text-content-body font-medium" dir="ltr">{item.description || item.item_key}</td>
                  <td className="py-1.5 text-content-body" dir="ltr">{item.dn ?? '—'}</td>
                  <td className="py-1.5 text-content-body" dir="ltr">{item.pn ?? '—'}</td>
                  <td className="py-1.5 text-content-body" dir="ltr">{item.sn ?? '—'}</td>
                  <td className="py-1.5">
                    <span className={`font-bold ${Number(item.in_stock) > 0 ? 'text-success' : 'text-danger'}`} dir="ltr">
                      {fmtQty(item.in_stock)}{item.unit ? ` ${item.unit}` : ''}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
