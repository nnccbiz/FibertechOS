'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

function formatCurrency(v: number) {
  return new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(v);
}

export default function QuotePreviewPage() {
  const params = useParams();
  const projectId = params.id as string;
  const quoteId = params.quoteId as string;
  const supabase = createClient();

  const [quote, setQuote] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [project, setProject] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [{ data: q }, { data: its }, { data: proj }] = await Promise.all([
        supabase.from('quotes').select('*').eq('id', quoteId).single(),
        supabase.from('quote_items').select('*').eq('quote_id', quoteId).order('sort_order'),
        supabase.from('projects').select('*').eq('id', projectId).single(),
      ]);
      setQuote(q);
      setItems(its || []);
      setProject(proj);
      setLoading(false);
    }
    load();
  }, [quoteId, projectId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-white">
        <p className="text-gray-400">טוען הצעת מחיר...</p>
      </div>
    );
  }

  if (!quote || !project) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-white">
        <p className="text-red-500">הצעת מחיר לא נמצאה</p>
      </div>
    );
  }

  const hasDiscount = items.some((i) => parseFloat(i.discount_pct) > 0);
  const globalDisc = parseFloat(quote.global_discount_pct) || 0;
  const totalAfterLineDisc = items.reduce((s, i) => s + (parseFloat(i.total_price) || 0), 0);
  const finalTotal = globalDisc > 0 ? Math.round(totalAfterLineDisc * (1 - globalDisc / 100) * 100) / 100 : totalAfterLineDisc;
  const quoteDate = quote.created_at ? new Date(quote.created_at).toLocaleDateString('he-IL') : '';
  const validUntil = quote.valid_until ? new Date(quote.valid_until).toLocaleDateString('he-IL') : '';
  const colCount = hasDiscount ? 8 : 7;

  const whatsappText = encodeURIComponent(
    `שלום, מצורפת הצעת מחיר מספר ${quote.quote_number} עבור פרויקט ${project.name || ''}.\nסה״כ: ${formatCurrency(finalTotal)}\nלצפייה: ${typeof window !== 'undefined' ? window.location.href : ''}`
  );

  return (
    <div className="bg-gray-100 min-h-screen">
      {/* Print controls */}
      <div className="print:hidden sticky top-0 z-50 bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-3">
        <button onClick={() => window.print()} className="bg-[#1a56db] text-white text-sm px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors">
          🖨️ הדפס / שמור PDF
        </button>
        <a
          href={`mailto:?subject=${encodeURIComponent(`הצעת מחיר ${quote.quote_number} — פיברטק`)}&body=${encodeURIComponent(`שלום,\n\nמצורפת הצעת מחיר מספר ${quote.quote_number} עבור פרויקט ${project.name || ''}.\nסה״כ: ${formatCurrency(finalTotal)}\n\nבברכה,\nפיברטק תעשיות צנרת וכימיקלים בע״מ`)}`}
          className="bg-gray-100 text-gray-700 text-sm px-4 py-2 rounded-lg hover:bg-gray-200 transition-colors"
        >
          📧 שלח במייל
        </a>
        <a
          href={`https://wa.me/?text=${whatsappText}`}
          target="_blank"
          rel="noopener noreferrer"
          className="bg-green-50 text-green-700 text-sm px-4 py-2 rounded-lg hover:bg-green-100 transition-colors"
        >
          💬 שלח בוואטסאפ
        </a>
        <button onClick={() => window.history.back()} className="text-sm text-gray-500 px-3 py-2 hover:text-gray-700 mr-auto">
          ← חזרה
        </button>
      </div>

      {/* A4 page */}
      <div className="max-w-[210mm] mx-auto bg-white shadow-lg my-6 print:my-0 print:shadow-none flex flex-col" style={{ minHeight: '297mm' }}>
        <div className="px-12 py-10 print:px-10 print:py-8" dir="rtl">

          {/* Header */}
          <div className="flex justify-between items-start mb-8 border-b-2 border-[#1b3a6b] pb-6">
            <div className="flex items-center gap-4">
              <img src="/logo.png" alt="Fibertech" className="h-14 object-contain" />
              <div>
                <h1 className="text-xl font-bold text-[#1b3a6b]">פיברטק תעשיות צנרת וכימיקלים בע״מ</h1>
                <p className="text-xs text-gray-400 mt-1">ח.פ 510931389 | מקבוצת מאיה אופקים</p>
              </div>
            </div>
            <div className="text-left">
              <p className="text-lg font-bold text-green-700">הצעת מחיר</p>
              <p className="text-sm text-gray-500 font-mono">{quote.quote_number}</p>
              <p className="text-xs text-gray-400 mt-1">תאריך: {quoteDate}</p>
              {validUntil && <p className="text-xs text-gray-400">תוקף עד: {validUntil}</p>}
            </div>
          </div>

          {/* Client + Project info */}
          <div className="grid grid-cols-2 gap-8 mb-8">
            <div>
              <h3 className="text-sm font-bold text-gray-600 mb-2">לכבוד</h3>
              <p className="text-base font-bold text-gray-800">{quote.client_name}</p>
              {project.client_name && project.client_name !== quote.client_name && (
                <p className="text-sm text-gray-500">{project.client_name}</p>
              )}
            </div>
            <div>
              <h3 className="text-sm font-bold text-gray-600 mb-2">פרויקט</h3>
              <p className="text-base font-bold text-gray-800">{project.name || '—'}</p>
              {project.location && <p className="text-sm text-gray-500">📍 {project.location}</p>}
            </div>
          </div>

          {/* Items table */}
          <table className="w-full text-sm border-collapse mb-6">
            <thead>
              <tr className="bg-gray-50">
                <th className="text-right py-2.5 px-3 font-semibold text-gray-600 border border-gray-200">#</th>
                <th className="text-right py-2.5 px-3 font-semibold text-gray-600 border border-gray-200">תיאור פריט</th>
                <th className="text-right py-2.5 px-3 font-semibold text-gray-600 border border-gray-200">קוטר</th>
                <th className="text-right py-2.5 px-3 font-semibold text-gray-600 border border-gray-200">כמות</th>
                <th className="text-right py-2.5 px-3 font-semibold text-gray-600 border border-gray-200">יחידה</th>
                <th className="text-right py-2.5 px-3 font-semibold text-gray-600 border border-gray-200">מחיר ליחידה</th>
                {hasDiscount && <th className="text-right py-2.5 px-3 font-semibold text-orange-600 border border-gray-200">הנחה</th>}
                <th className="text-right py-2.5 px-3 font-semibold text-gray-600 border border-gray-200">סה״כ</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => {
                const disc = parseFloat(item.discount_pct) || 0;
                return (
                  <tr key={item.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                    <td className="py-2 px-3 border border-gray-200 text-gray-400 text-center">{idx + 1}</td>
                    <td className="py-2 px-3 border border-gray-200 text-gray-800">{item.product_name}{item.notes ? ` (${item.notes})` : ''}</td>
                    <td className="py-2 px-3 border border-gray-200 text-gray-600">{item.dn_size || '—'}</td>
                    <td className="py-2 px-3 border border-gray-200 text-gray-600">{item.quantity}</td>
                    <td className="py-2 px-3 border border-gray-200 text-gray-600">{item.unit}</td>
                    <td className="py-2 px-3 border border-gray-200 text-gray-600">{formatCurrency(parseFloat(item.unit_price) || 0)}</td>
                    {hasDiscount && <td className="py-2 px-3 border border-gray-200 text-orange-600">{disc > 0 ? `${disc}%` : '—'}</td>}
                    <td className="py-2 px-3 border border-gray-200 font-semibold text-gray-800">{formatCurrency(parseFloat(item.total_price) || 0)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              {globalDisc > 0 && (
                <>
                  <tr className="bg-gray-50">
                    <td colSpan={colCount - 1} className="py-2 px-3 text-left text-sm text-gray-500 border border-gray-200">סה״כ לפני הנחה</td>
                    <td className="py-2 px-3 text-sm text-gray-500 border border-gray-200">{formatCurrency(totalAfterLineDisc)}</td>
                  </tr>
                  <tr>
                    <td colSpan={colCount - 1} className="py-2 px-3 text-left text-sm text-orange-600 border border-gray-200">הנחה {globalDisc}%</td>
                    <td className="py-2 px-3 text-sm text-orange-600 border border-gray-200">-{formatCurrency(totalAfterLineDisc - finalTotal)}</td>
                  </tr>
                </>
              )}
              <tr className="bg-green-50">
                <td colSpan={colCount - 1} className="py-3 px-3 text-left font-bold text-lg text-gray-800 border border-gray-200">סה״כ</td>
                <td className="py-3 px-3 font-bold text-lg text-green-700 border border-gray-200">{formatCurrency(finalTotal)}</td>
              </tr>
            </tfoot>
          </table>

          {/* Delivery time */}
          <div className="mb-6">
            <h3 className="text-sm font-bold text-gray-600 mb-1">זמן אספקה</h3>
            <p className="text-sm text-gray-700">שלושה שבועות מיום סגירת הזמנה — אישור הצעת מחיר, חתימה על שרטוט לייצור ותשלום מקדמה.</p>
          </div>

          {/* Payment terms */}
          {quote.payment_terms && (
            <div className="mb-6">
              <h3 className="text-sm font-bold text-gray-600 mb-1">תנאי תשלום</h3>
              <p className="text-sm text-gray-700 whitespace-pre-line">{quote.payment_terms}</p>
            </div>
          )}

          {/* Disclaimer */}
          {quote.disclaimer_text && (
            <div className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-100">
              <h3 className="text-sm font-bold text-gray-600 mb-2">הערות והתניות</h3>
              <p className="text-xs text-gray-600 whitespace-pre-line leading-relaxed">{quote.disclaimer_text}</p>
            </div>
          )}

          {/* Notes */}
          {quote.notes && (
            <div className="mb-6">
              <h3 className="text-sm font-bold text-gray-600 mb-1">הערות</h3>
              <p className="text-sm text-gray-700 whitespace-pre-line">{quote.notes}</p>
            </div>
          )}

          {/* Signature */}
          <div className="mt-12 pt-6 border-t border-gray-200">
            <div className="grid grid-cols-2 gap-8">
              <div>
                <p className="text-sm font-bold text-gray-600 mb-8">חתימת פיברטק</p>
                <div className="border-b border-gray-300 w-48"></div>
              </div>
              <div>
                <p className="text-sm font-bold text-gray-600 mb-8">חתימת הלקוח</p>
                <div className="border-b border-gray-300 w-48"></div>
              </div>
            </div>
          </div>

        </div>

        {/* Company footer — pinned to bottom */}
        <div className="mt-auto border-t border-[#1b3a6b]/30 px-12 py-3 text-center text-[9px] text-gray-400 leading-relaxed">
          <p className="font-semibold text-[#1b3a6b] text-[10px]">פיברטק תעשיות צנרת וכימיקלים מקבוצת מאיה אופקים</p>
          <p>מפעל פיברטק: אזור תעשיה קרני שומרון, ת.ד 206 44855 | טל׳: 09-7929441 | nitzan@fibertech.co.il</p>
          <p>קבוצת מאיה אופקים: אלי הורוביץ 27, רחובות 7608803 | טל׳: 073-2290900 | shula@maya-group.co.il</p>
          <p className="font-semibold text-[#1b3a6b]">www.fibertech.co.il</p>
        </div>
      </div>

      {/* Print styles */}
      <style jsx global>{`
        @media print {
          body { background: white !important; }
          @page { size: A4; margin: 10mm; }
        }
      `}</style>
    </div>
  );
}
