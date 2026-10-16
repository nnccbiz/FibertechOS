'use client';

import { useRef, useState } from 'react';
import PODocument, { type PODocumentHandle } from '@/components/procurement/PODocument';
import Icon from '@/components/ui/Icon';

// Read-only branded PO PDF (the same document Nitzan sent from /procurement),
// so Nurit can see exactly what went out to the supplier.
export default function POViewModal({ order, items, projectName, onClose }: {
  order: any; items: any[]; projectName?: string | null; onClose: () => void;
}) {
  const [pdfLang, setPdfLang] = useState<'he' | 'en' | null>(null);
  const pdfRef = useRef<PODocumentHandle>(null);
  const effLang = pdfLang ?? ((order.currency || 'ILS') !== 'ILS' ? 'en' : 'he');
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center overflow-y-auto p-4" onClick={onClose}>
      <div className="bg-neutral-100 rounded-xl max-w-[850px] w-full my-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 bg-white rounded-t-xl border-b border-line-subtle sticky top-0 z-10">
          <p className="font-bold text-content-strong">הזמנת רכש <span dir="ltr">{order.po_number || order.supplier_order_no || ''}</span></p>
          <div className="flex items-center gap-2">
            <div className="flex bg-neutral-100 rounded-lg p-0.5" title="שפת המסמך (ברירת מחדל לפי המטבע)">
              <button onClick={() => setPdfLang('he')} className={`text-[12px] px-2.5 py-1 rounded-md ${effLang === 'he' ? 'bg-white shadow-sm font-semibold text-content-strong' : 'text-content-muted'}`}>עברית</button>
              <button onClick={() => setPdfLang('en')} className={`text-[12px] px-2.5 py-1 rounded-md ${effLang === 'en' ? 'bg-white shadow-sm font-semibold text-content-strong' : 'text-content-muted'}`}>English</button>
            </div>
            <button onClick={() => pdfRef.current?.downloadPdf()} className="text-[13px] font-semibold bg-primary text-white px-4 py-2 rounded-lg hover:bg-primary-700">
              <Icon name="download" size={14} /> הורד PDF
            </button>
            <button onClick={onClose} className="text-content-muted hover:text-content-strong px-2"><Icon name="close" size={18} /></button>
          </div>
        </div>
        <div className="p-4">
          <PODocument
            ref={pdfRef}
            order={order}
            items={items}
            supplier={order.suppliers || null}
            projectName={order.project_name || projectName || null}
            projectNameHe={projectName || order.projects?.name || null}
            lang={pdfLang}
          />
        </div>
      </div>
    </div>
  );
}
