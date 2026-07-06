'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import Icon, { type IconName } from '@/components/ui/Icon';

interface InventoryItem {
  id: string;
  manufacturer: string;
  pipe_type: string;
  diameter_mm: number;
  pressure_bar: number | null;
  stiffness_sn: number | null;
  length_m: number | null;
  in_stock: number;
  category: string;
}

interface CategorySummary {
  label: string;
  icon: IconName;
  count: number;
}

export default function InventoryWidget() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    async function fetchInventory() {
      const supabase = createClient();
      try {
        const { data, error } = await supabase
          .from('inventory')
          .select('*')
          .order('manufacturer');

        if (error) throw error;
        setItems(data || []);
      } catch {
        // Table might not exist yet — show empty state
        setItems([]);
      } finally {
        setLoading(false);
      }
    }
    fetchInventory();
  }, []);

  const categories: CategorySummary[] = [
    {
      label: 'צינורות',
      icon: 'wrench',
      count: items.filter((i) => i.category === 'צינורות').reduce((sum, i) => sum + i.in_stock, 0),
    },
    {
      label: 'אביזרים',
      icon: 'gear',
      count: items.filter((i) => i.category === 'אביזרים').reduce((sum, i) => sum + i.in_stock, 0),
    },
    {
      label: 'חומרי סיכה',
      icon: 'drop',
      count: items.filter((i) => i.category === 'חומרי סיכה').reduce((sum, i) => sum + i.in_stock, 0),
    },
  ];

  const pipeItems = items.filter((i) => i.category === 'צינורות');

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
        {pipeItems.length > 0 && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-[12px] text-primary hover:underline"
          >
            {expanded ? 'סגור' : 'פירוט'}
          </button>
        )}
      </div>

      {/* Category summary tiles */}
      <div className="grid grid-cols-3 gap-2">
        {categories.map((cat) => (
          <div key={cat.label} className="bg-neutral-50 rounded-lg p-3 text-center">
            <span className="block mb-1 text-primary"><Icon name={cat.icon} size={22} /></span>
            <p className="text-[12px] text-content-muted font-medium">{cat.label}</p>
            <p className="text-lg font-bold text-content-body mt-0.5">
              {cat.count > 0 ? cat.count : '—'}
            </p>
          </div>
        ))}
      </div>

      {/* Expanded table for pipes */}
      {expanded && pipeItems.length > 0 && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-line-subtle">
                <th className="text-right text-content-muted font-medium pb-1.5 pr-1">יצרן</th>
                <th className="text-right text-content-muted font-medium pb-1.5">סוג</th>
                <th className="text-right text-content-muted font-medium pb-1.5">קוטר</th>
                <th className="text-right text-content-muted font-medium pb-1.5">לחץ</th>
                <th className="text-right text-content-muted font-medium pb-1.5">SN</th>
                <th className="text-right text-content-muted font-medium pb-1.5">אורך</th>
                <th className="text-right text-content-muted font-medium pb-1.5">מלאי</th>
              </tr>
            </thead>
            <tbody>
              {pipeItems.map((item) => (
                <tr key={item.id} className="border-b border-line-subtle">
                  <td className="py-1.5 pr-1 text-content-body font-medium">{item.manufacturer}</td>
                  <td className="py-1.5 text-content-body">{item.pipe_type}</td>
                  <td className="py-1.5 text-content-body">{item.diameter_mm}mm</td>
                  <td className="py-1.5 text-content-body">{item.pressure_bar ?? '—'}</td>
                  <td className="py-1.5 text-content-body">{item.stiffness_sn ?? '—'}</td>
                  <td className="py-1.5 text-content-body">{item.length_m ? `${item.length_m}m` : '—'}</td>
                  <td className="py-1.5">
                    <span className={`font-bold ${item.in_stock > 0 ? 'text-success' : 'text-danger'}`}>
                      {item.in_stock}
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
