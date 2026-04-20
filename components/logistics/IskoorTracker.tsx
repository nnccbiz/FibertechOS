'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

interface IskoorRow {
  lot_number: string;
  bl_number: string | null;
  release_date: string | null;
  eta: string | null;
  delivery_date: string | null;
  shipment_status: string;
  container_number: string;
  invoice_date: string | null;
  dn_number: string | null;
  invoice_number: string | null;
  invoice_value: number | null;
  dn900_qty: number;
  dn500_qty: number;
  dn1280_standard: number;
  dn1280_nozzles: number;
  dn1280_first: number;
  dn1000_standard: number;
  dn1000_nozzles: number;
  dn1000_first: number;
  dn750_standard: number;
  dn750_nozzles: number;
  dn750_first: number;
  purchase_order: string | null;
  coa_1: string | null;
  coa_2: string | null;
  coa_3: string | null;
  coa_4: string | null;
  coa_5: string | null;
  coa_6: string | null;
  project_name: string | null;
}

function statusBadge(status: string) {
  const map: Record<string, string> = {
    in_transit: 'bg-yellow-100 text-yellow-800',
    released: 'bg-green-100 text-green-800',
    delivered: 'bg-blue-100 text-blue-800',
    pending: 'bg-gray-100 text-gray-800',
  };
  const labels: Record<string, string> = {
    in_transit: 'בדרך',
    released: 'שוחרר',
    delivered: 'נמסר',
    pending: 'ממתין',
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-sm font-medium ${map[status] ?? map.pending}`}>
      {labels[status] ?? status}
    </span>
  );
}

function formatDate(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('he-IL');
}

export default function IskoorTracker() {
  const [rows, setRows] = useState<IskoorRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('v_iskoor_tracking')
        .select('*')
        .order('eta', { ascending: false });

      if (!error && data) setRows(data as IskoorRow[]);
      setLoading(false);
    }
    load();
  }, []);

  if (loading) return <div className="p-8 text-center text-gray-500">טוען נתוני ISKOOR...</div>;

  // Group by lot
  const lots = rows.reduce<Record<string, IskoorRow[]>>((acc, row) => {
    (acc[row.lot_number] ??= []).push(row);
    return acc;
  }, {});

  return (
    <div className="space-y-6 p-4" dir="rtl">
      <h2 className="text-2xl font-bold">מעקב אספקת ISKOOR</h2>

      {Object.entries(lots).map(([lot, containers]) => (
        <div key={lot} className="border rounded-lg overflow-hidden">
          {/* Lot header */}
          <div className="bg-gray-50 px-4 py-3 flex items-center justify-between">
            <div>
              <span className="font-semibold text-2xl">{lot}</span>
              {containers[0].bl_number && (
                <span className="text-lg text-gray-500 mr-3">BL: {containers[0].bl_number}</span>
              )}
              {containers[0].project_name && (
                <span className="text-lg text-gray-500 mr-3">{containers[0].project_name}</span>
              )}
            </div>
            <div className="flex gap-4 text-lg">
              <span>שחרור: <strong>{formatDate(containers[0].release_date)}</strong></span>
              <span>ETA: <strong>{formatDate(containers[0].eta)}</strong></span>
              <span>אספקה: <strong>{formatDate(containers[0].delivery_date)}</strong></span>
              {statusBadge(containers[0].shipment_status)}
            </div>
          </div>

          {/* Container table */}
          <div className="overflow-x-auto">
            <table className="w-full text-lg">
              <thead className="bg-gray-100 text-gray-600">
                <tr>
                  <th className="px-3 py-2 text-right">מכולה</th>
                  <th className="px-3 py-2">חשבונית</th>
                  <th className="px-3 py-2">סכום</th>
                  <th className="px-3 py-2">DN900</th>
                  <th className="px-3 py-2">DN500</th>
                  <th className="px-3 py-2">DN1280</th>
                  <th className="px-3 py-2">DN1000</th>
                  <th className="px-3 py-2">DN750</th>
                  <th className="px-3 py-2">ת.מ רכש</th>
                  <th className="px-3 py-2">COA</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {containers.map((c) => (
                  <tr key={c.container_number} className="hover:bg-blue-50">
                    <td className="px-3 py-2 font-mono text-sm">{c.container_number}</td>
                    <td className="px-3 py-2 text-center">{c.invoice_number ?? '—'}</td>
                    <td className="px-3 py-2 text-center">{c.invoice_value ? `€${c.invoice_value.toLocaleString()}` : '—'}</td>
                    <td className="px-3 py-2 text-center">{c.dn900_qty || ''}</td>
                    <td className="px-3 py-2 text-center">{c.dn500_qty || ''}</td>
                    <td className="px-3 py-2 text-center">
                      {[c.dn1280_standard, c.dn1280_nozzles, c.dn1280_first].filter(Boolean).join(' / ') || ''}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {[c.dn1000_standard, c.dn1000_nozzles, c.dn1000_first].filter(Boolean).join(' / ') || ''}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {[c.dn750_standard, c.dn750_nozzles, c.dn750_first].filter(Boolean).join(' / ') || ''}
                    </td>
                    <td className="px-3 py-2 text-center">{c.purchase_order ?? '—'}</td>
                    <td className="px-3 py-2 text-center">
                      {[c.coa_1, c.coa_2, c.coa_3, c.coa_4, c.coa_5, c.coa_6].filter(Boolean).length > 0
                        ? `${[c.coa_1, c.coa_2, c.coa_3, c.coa_4, c.coa_5, c.coa_6].filter(Boolean).length}/6`
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {rows.length === 0 && (
        <div className="text-center py-12 text-gray-400">אין נתוני מכולות</div>
      )}
    </div>
  );
}
