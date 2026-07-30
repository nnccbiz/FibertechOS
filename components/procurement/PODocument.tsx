'use client';

/**
 * Purchase-order document — A4 render + PDF export in the same visual language
 * as the quote document (QuoteDocument): navy header table, Fibertech logo and
 * footer, fixed 794px page scaled down on narrow screens. Simpler pagination
 * (uniform rows, estimate-based) since a PO has no contract/attachment pages.
 * The document body is bilingual-friendly: item descriptions render LTR.
 */
import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { renderAttachedPages, type RenderedAttachedPage } from '@/lib/po-attachments';

export interface PODocumentData {
  order: any;               // import_orders row
  items: any[];             // import_order_items rows (sorted)
  supplier: any | null;     // suppliers row
  projectName?: string | null;
  msNumber?: string | null; // linked customer order מ"ס
}

export interface PODocumentHandle {
  downloadPdf: (fileName?: string) => Promise<void>;
}

const A4_W = 794;

function fmtSn(sn: string | null | undefined) {
  if (!sn) return '—';
  const n = parseInt(String(sn), 10);
  return isNaN(n) ? String(sn) : n.toLocaleString('en-US');
}

function money(v: number, currency: string) {
  const cur = currency || 'ILS';
  try {
    return new Intl.NumberFormat(cur === 'ILS' ? 'he-IL' : 'en-US', { style: 'currency', currency: cur, maximumFractionDigits: 2 }).format(v);
  } catch {
    return `${v.toLocaleString()} ${cur}`;
  }
}

type POPage = { itemIdxs: number[]; blocks: ('totals' | 'sign')[] };

const PODocument = forwardRef<PODocumentHandle, PODocumentData>(function PODocument(
  { order, items, supplier, projectName, msNumber },
  ref,
) {
  const outerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [fitH, setFitH] = useState<number | null>(null);
  const [measuredPages, setMeasuredPages] = useState<POPage[] | null>(null);
  // Signed-scan / drawing pages attached to the PO (order.attached_pages) —
  // rendered as full A4 pages at the end of the document + PDF export.
  const [extraPages, setExtraPages] = useState<RenderedAttachedPage[]>([]);
  useEffect(() => {
    let cancelled = false;
    const refs = Array.isArray(order?.attached_pages) ? order.attached_pages : [];
    if (!refs.length) { setExtraPages([]); return; }
    renderAttachedPages(refs).then((pages) => { if (!cancelled) setExtraPages(pages); });
    return () => { cancelled = true; };
  }, [JSON.stringify(order?.attached_pages || null)]); // eslint-disable-line react-hooks/exhaustive-deps

  // Exact pagination: measure the real rendered height of every table row and
  // trailer block in a hidden mirror, then pack pages by those heights — a
  // fixed rows-per-page estimate cuts rows when descriptions wrap.
  useEffect(() => {
    let cancelled = false;
    const measure = () => {
      if (cancelled) return;
      const root = document.getElementById('po-measure');
      if (!root) return;
      const rh = (sel: string) => {
        const el = root.querySelector(sel);
        return el ? (el as HTMLElement).getBoundingClientRect().height : 0;
      };
      const page297 = rh('[data-m="page"]');
      const footerH = rh('[data-m="footer"]');
      const padH = rh('[data-m="pad"]');
      const headerH = rh('[data-m="header"]');
      const contLabelH = rh('[data-m="contlabel"]');
      const theadH = rh('[data-m="items"] thead');
      const totalsH = rh('[data-m="totals"]');
      const signH = rh('[data-m="sign"]');
      if (!page297 || !footerH) return;

      const trs = Array.from(root.querySelectorAll('[data-m="items"] tbody tr')) as HTMLElement[];
      const rowHs = trs.map((el) => el.getBoundingClientRect().height);

      const SAFETY = 16;
      const contentAvail = page297 - footerH - padH;
      const pages: POPage[] = [];
      let i = 0;
      if (rowHs.length === 0) pages.push({ itemIdxs: [], blocks: [] });
      while (i < rowHs.length) {
        const first = pages.length === 0;
        const avail = contentAvail - (first ? headerH : contLabelH) - theadH - SAFETY;
        let used = 0;
        const idxs: number[] = [];
        while (i < rowHs.length && (idxs.length === 0 || used + rowHs[i] <= avail)) {
          used += rowHs[i];
          idxs.push(i);
          i++;
        }
        pages.push({ itemIdxs: idxs, blocks: [] });
      }

      // Trailer: totals then notes+signatures, breaking to a new page as needed.
      let cur = pages[pages.length - 1];
      const curUsed = (pages.length === 1 ? headerH : contLabelH)
        + (cur.itemIdxs.length ? theadH : 0)
        + cur.itemIdxs.reduce((s, idx) => s + rowHs[idx], 0);
      let rem = contentAvail - curUsed - SAFETY;
      ([['totals', totalsH], ['sign', signH]] as const).forEach(([kind, h]) => {
        if (h > rem && (cur.itemIdxs.length > 0 || cur.blocks.length > 0)) {
          cur = { itemIdxs: [], blocks: [] };
          pages.push(cur);
          rem = contentAvail - contLabelH - SAFETY;
        }
        cur.blocks.push(kind);
        rem -= h;
      });
      setMeasuredPages(pages);
    };
    const fonts = (document as any).fonts;
    if (fonts?.ready) fonts.ready.then(() => requestAnimationFrame(measure));
    else requestAnimationFrame(measure);
    return () => { cancelled = true; };
  }, [items, order]);

  useEffect(() => {
    const recompute = () => {
      const avail = outerRef.current?.clientWidth ?? A4_W;
      const s = Math.min(1, avail / A4_W);
      setScale(s);
      const h = contentRef.current?.offsetHeight ?? 0;
      setFitH(h ? Math.ceil(h * s) : null);
    };
    recompute();
    const t = setTimeout(recompute, 300);
    window.addEventListener('resize', recompute);
    return () => { window.removeEventListener('resize', recompute); clearTimeout(t); };
  }, [items, order, measuredPages]);

  async function handleDownloadPdf(fileName?: string) {
    const html2canvas = (await import('html2canvas')).default;
    const { jsPDF } = await import('jspdf');
    const wrapper = document.getElementById('po-page-content');
    if (!wrapper) return;
    const prevTransform = wrapper.style.transform;
    const prevPosition = wrapper.style.position;
    wrapper.style.transform = 'none';
    wrapper.style.position = 'static';
    try {
      const pages = wrapper.children;
      const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4', compress: true });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      let first = true;
      for (let i = 0; i < pages.length; i++) {
        const el = pages[i] as HTMLElement;
        if (!el || el.offsetHeight === 0) continue;
        const canvas = await html2canvas(el, { scale: 1.5, useCORS: true, backgroundColor: '#ffffff' });
        const imgData = canvas.toDataURL('image/jpeg', 0.85);
        if (!first) pdf.addPage();
        first = false;
        pdf.addImage(imgData, 'JPEG', 0, 0, pageW, pageH, undefined, 'FAST');
      }
      const blob = pdf.output('blob');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      // Default file name: "הזמנת רכש <project> <date>" (he-IL date uses dots —
      // filename-safe).
      const dateStr = (order.order_date ? new Date(order.order_date) : new Date()).toLocaleDateString('he-IL');
      const defaultName = ['הזמנת רכש', projectName || order.project_name || order.po_number || '', dateStr].filter(Boolean).join(' ');
      a.download = `${(fileName || defaultName).replace(/[\\/:*?"<>|]/g, '')}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } finally {
      wrapper.style.transform = prevTransform;
      wrapper.style.position = prevPosition;
    }
  }

  useImperativeHandle(ref, () => ({ downloadPdf: handleDownloadPdf }), [order, items]);

  const currency = order.currency || 'ILS';
  // Foreign-currency PO goes to a foreign supplier → the whole document is
  // English + LTR. ILS (domestic) stays Hebrew + RTL.
  const en = currency !== 'ILS';
  const L = (he: string, enText: string) => (en ? enText : he);
  const dir = en ? 'ltr' : 'rtl';
  // English date reads "19 July 2026" (day, full month name, year).
  const fmtDocDate = (d: Date) => en
    ? d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    : d.toLocaleDateString('he-IL');
  // Common Hebrew unit values → English on a foreign PO (free-text fallback kept as-is).
  const unitLabel = (u: string | null | undefined) => {
    if (!u) return '—';
    if (!en) return u;
    const map: Record<string, string> = { 'יח׳': 'pcs', "יח'": 'pcs', 'יח': 'pcs', 'מטר': 'm', 'מ׳': 'm', "מ'": 'm', 'קומפלט': 'set' };
    return map[u.trim()] || u;
  };
  const total = items.reduce((s, it) => s + (Number(it.unit_price) || 0) * (Number(it.ordered_qty) || 0), 0);
  const orderDate = fmtDocDate(order.order_date ? new Date(order.order_date) : new Date());
  // Side accent on info blocks follows the reading direction.
  const accent = en ? 'border-l-4 border-navy-700 pl-4 text-left' : 'border-r-4 border-navy-700 pr-4 text-right';

  // Conservative estimate shown only until the measured pass lands.
  const estimatePages: POPage[] = (() => {
    const FIRST = 12, NEXT = 22, TRAILER = 13;
    const pages: POPage[] = [];
    let i = 0;
    while (i < items.length || pages.length === 0) {
      const cap = pages.length === 0 ? FIRST : NEXT;
      pages.push({ itemIdxs: items.slice(i, i + cap).map((_, j) => i + j), blocks: [] });
      i += cap;
      if (items.length === 0) break;
    }
    const lastCap = pages.length === 1 ? FIRST : NEXT;
    if (pages[pages.length - 1].itemIdxs.length > lastCap - TRAILER) pages.push({ itemIdxs: [], blocks: [] });
    pages[pages.length - 1].blocks = ['totals', 'sign'];
    return pages;
  })();
  const renderPages = measuredPages ?? estimatePages;
  const totalPages = renderPages.length;

  const Footer = ({ pageNum }: { pageNum: number }) => (
    <div className="bg-neutral-100 px-10 py-4 text-center" dir={dir}>
      <p className="text-[11px] font-bold text-content-muted">{L('פיברטק תשתיות צנרת וכימיקלים בע״מ', 'Fibertech Piping Infrastructure & Chemicals Ltd.')}</p>
      <p className="text-[9px] text-content-muted mt-0.5">{L('מפעל פיברטק: אזור תעשיה קרני שומרון, ת.ד 44855 | טל׳: 09-7929441 | info@fibertech.co.il', 'Fibertech Plant: Karnei Shomron Industrial Zone, P.O.Box 44855, Israel | Tel: +972-9-7929441 | info@fibertech.co.il')}</p>
      <p className="text-[9px] font-semibold text-content-muted mt-0.5">www.fibertech.co.il</p>
      <div className="border-t border-line-strong mt-2 pt-2 flex justify-between items-center">
        <span className="text-[9px] text-content-muted">
          {L('הזמנת רכש:', 'Purchase Order:')} <span className="font-semibold" dir="ltr">{order.po_number || '—'}</span>
          &nbsp;|&nbsp; {L('תאריך:', 'Date:')} <span className="font-semibold">{orderDate}</span>
        </span>
        <span className="text-[9px] font-semibold text-navy-700">{en ? `Page ${pageNum} of ${totalPages}` : `עמוד ${pageNum} מתוך ${totalPages}`}</span>
      </div>
    </div>
  );

  const Header = () => (
    <>
      <div className="flex justify-between items-start mb-3">
        <div>
          <h1 className="text-3xl font-bold text-content-strong tracking-wide">{en ? 'Purchase Order' : 'הזמנת רכש / Purchase Order'}</h1>
          <p className="text-sm text-content-muted mt-1">
            <span className="font-semibold">{L('מס׳ הזמנה:', 'PO No.:')}</span> <span dir="ltr">{order.po_number || '—'}</span>
            &nbsp;|&nbsp;<span className="font-semibold">{L('תאריך:', 'Date:')}</span> {orderDate}
            {msNumber && <>&nbsp;|&nbsp;<span className="font-semibold">{L('מ"ס:', 'Ref.:')}</span> <span dir="ltr">{msNumber}</span></>}
          </p>
        </div>
        <img src="/logo.png" alt="Fibertech" className="h-14 object-contain" />
      </div>
      <div className="border-b-2 border-content-muted mb-4" />
      <div className="grid grid-cols-2 gap-10 mb-5">
        <div className={accent}>
          <h3 className="text-sm font-bold text-navy-700 mb-2">{L('אל הספק / To Supplier', 'To Supplier')}</h3>
          <p className="text-base font-bold text-content-strong" dir="ltr">{supplier?.name || '—'}</p>
          {supplier?.contact_name && <p className="text-sm text-content-body" dir="ltr">{supplier.contact_name}</p>}
        </div>
        <div className={accent}>
          <h3 className="text-sm font-bold text-navy-700 mb-2">{L('פרטי ההזמנה', 'Order Details')}</h3>
          {projectName && <p className="text-sm text-content-body">{L('פרויקט:', 'Project:')} <span className="font-semibold">{projectName}</span></p>}
          <p className="text-sm text-content-body">{L('מטבע:', 'Currency:')} <span dir="ltr">{currency}</span></p>
          {order.incoterms && <p className="text-sm text-content-body">{L('תנאי סחר:', 'Incoterms:')} <span dir="ltr">{order.incoterms}</span></p>}
          {order.delivery_date && <p className="text-sm text-content-body">{L('מועד אספקה:', 'Delivery Date:')} <span className="font-semibold">{fmtDocDate(new Date(order.delivery_date))}</span></p>}
          {order.payment_terms && <p className="text-sm text-content-body">{L('תנאי תשלום:', 'Payment Terms:')} {order.payment_terms}</p>}
        </div>
      </div>
    </>
  );

  const ItemsTable = ({ slice, startIdx }: { slice: any[]; startIdx: number }) => (
    <table className="w-full text-sm border-collapse mb-4">
      <thead>
        <tr className="bg-navy-700">
          <th className="text-center py-2.5 px-2 font-semibold text-white border border-navy-700 w-8">#</th>
          <th className={`${en ? 'text-left' : 'text-right'} py-2.5 px-3 font-semibold text-white border border-navy-700`}>{L('תיאור / Description', 'Description')}</th>
          <th className="text-center py-2.5 px-2 font-semibold text-white border border-navy-700">DN</th>
          <th className="text-center py-2.5 px-2 font-semibold text-white border border-navy-700">PN</th>
          <th className="text-center py-2.5 px-2 font-semibold text-white border border-navy-700">SN</th>
          <th className="text-center py-2.5 px-2 font-semibold text-white border border-navy-700">{L('אורך יח׳', 'Unit L')}<br /><span className="font-normal text-[10px]">(m)</span></th>
          <th className="text-center py-2.5 px-2 font-semibold text-white border border-navy-700">{L('כמות', 'Qty')}</th>
          <th className="text-center py-2.5 px-2 font-semibold text-white border border-navy-700">{L('יחידות', 'Units')}<br /><span className="font-normal text-[10px]">(pipe #)</span></th>
          <th className="text-center py-2.5 px-2 font-semibold text-white border border-navy-700">{L('יח׳', 'Unit')}</th>
          <th className={`${en ? 'text-left' : 'text-right'} py-2.5 px-3 font-semibold text-white border border-navy-700`}>{L('מחיר יח׳', 'Unit Price')}</th>
          <th className={`${en ? 'text-left' : 'text-right'} py-2.5 px-3 font-semibold text-white border border-navy-700`}>{L('סה״כ', 'Total')}</th>
        </tr>
      </thead>
      <tbody>
        {slice.map((it, li) => {
          const idx = startIdx + li;
          const lineTotal = (Number(it.unit_price) || 0) * (Number(it.ordered_qty) || 0);
          return (
            <tr key={it.id || idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-neutral-50'}>
              <td className="py-2 px-2 border border-line-subtle text-neutral-400 text-center">{idx + 1}</td>
              <td className={`py-2 px-3 border border-line-subtle text-content-strong font-medium ${en ? 'text-left' : 'text-right'}`}><span dir="ltr">{it.description || '—'}</span></td>
              <td className="py-2 px-2 border border-line-subtle text-content-body text-center" dir="ltr">{it.dn || '—'}</td>
              <td className="py-2 px-2 border border-line-subtle text-content-body text-center" dir="ltr">{it.pn || '—'}</td>
              <td className="py-2 px-2 border border-line-subtle text-content-body text-center" dir="ltr">{fmtSn(it.sn)}</td>
              <td className="py-2 px-2 border border-line-subtle text-content-body text-center" dir="ltr">
                {(() => {
                  const len = Number(it.length_m) || 0;
                  if (len <= 0) return '—';
                  return Number.isInteger(len) ? len.toFixed(1) : len;
                })()}
              </td>
              <td className="py-2 px-2 border border-line-subtle text-content-body text-center" dir="ltr">{Number(it.ordered_qty) || 0}</td>
              <td className="py-2 px-2 border border-line-subtle text-content-body text-center" dir="ltr">
                {(() => {
                  const len = Number(it.length_m) || 0;
                  const qty = Number(it.ordered_qty) || 0;
                  return len > 0 && qty > 0 ? Math.round((qty / len) * 100) / 100 : '—';
                })()}
              </td>
              <td className="py-2 px-2 border border-line-subtle text-content-body text-center">{unitLabel(it.unit)}</td>
              <td className="py-2 px-3 border border-line-subtle text-content-body" dir="ltr">{money(Number(it.unit_price) || 0, currency)}</td>
              <td className="py-2 px-3 border border-line-subtle font-semibold text-content-strong" dir="ltr">{money(lineTotal, currency)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );

  const Totals = () => (
    <div className="flex justify-end mb-6">
      <div className="border border-line-subtle w-72 text-sm">
        <div className="flex justify-between px-4 py-2 border-b border-line-subtle">
          <span className="text-content-body">{L('מס׳ שורות', 'Line Items')}</span>
          <span className="text-content-body">{items.length}</span>
        </div>
        <div className="flex justify-between px-4 py-2.5 bg-navy-700">
          <span className="font-bold text-white">{L('סה״כ להזמנה', 'Order Total')}</span>
          <span className="font-bold text-white" dir="ltr">{money(total, currency)}</span>
        </div>
      </div>
    </div>
  );

  const Signatures = () => (
    <div className="mt-2">
      {order.notes && (
        <div className="mb-4">
          <h3 className={`text-sm font-bold text-content-strong mb-2 ${en ? 'border-l-4 pl-3' : 'border-r-4 pr-3'} border-navy-700`}>{L('הערות', 'Notes')}</h3>
          <p className="text-xs text-content-body whitespace-pre-line leading-relaxed">{order.notes}</p>
        </div>
      )}
      <div className="grid grid-cols-2 gap-12 mt-8">
        <div>
          <p className="text-sm font-bold text-content-body mb-10">{L('אישור פיברטק', 'Fibertech Approval')}</p>
          <div className="border-b border-neutral-400" />
          <p className="text-[11px] text-neutral-400 mt-2">{L('שם + חתימה + תאריך', 'Name + Signature + Date')}</p>
        </div>
      </div>
    </div>
  );

  return (
    <div ref={outerRef} className="w-full relative overflow-x-hidden">
      <div style={{ position: 'relative', width: scale < 1 && fitH ? A4_W * scale : undefined, height: scale < 1 && fitH ? fitH : undefined, margin: '0 auto' }}>
        <div
          id="po-page-content"
          ref={contentRef}
          style={scale < 1 && fitH
            ? { width: A4_W, transform: `scale(${scale})`, transformOrigin: 'top left', position: 'absolute', top: 0, left: 0 }
            : { width: A4_W, margin: '0 auto' }}
        >
          {renderPages.map((pg, pIdx) => (
            <div key={pIdx} className="w-[210mm] mx-auto bg-white shadow-lg my-6 print:my-0 print:shadow-none flex flex-col justify-between" style={{ height: '297mm', overflow: 'hidden' }}>
              <div className="px-10 pt-8 pb-6 overflow-hidden min-h-0" dir={dir}>
                {pIdx === 0
                  ? <Header />
                  : <p className="text-sm text-neutral-400 mb-4">{L('הזמנת רכש —', 'Purchase Order —')} <span dir="ltr">{order.po_number || ''}</span> {L('(המשך)', '(continued)')}</p>}
                {pg.itemIdxs.length > 0 && <ItemsTable slice={pg.itemIdxs.map((i) => items[i])} startIdx={pg.itemIdxs[0]} />}
                {pg.blocks.includes('totals') && <Totals />}
                {pg.blocks.includes('sign') && <Signatures />}
              </div>
              <Footer pageNum={pIdx + 1} />
            </div>
          ))}
          {/* Attached signed-scan / drawing pages — integral part of the PO */}
          {extraPages.map((ap, aIdx) => (
            <div key={`att-${aIdx}`} className="w-[210mm] mx-auto bg-white shadow-lg my-6 print:my-0 print:shadow-none flex flex-col" style={{ height: '297mm', overflow: 'hidden' }}>
              <div className="flex items-center justify-between px-6 pt-4 pb-2" dir={dir}>
                <p className="text-[11px] text-neutral-400 m-0">
                  {L('נספח להזמנת רכש', 'Annex to Purchase Order')} <span dir="ltr">{order.po_number || ''}</span>
                  {ap.label ? <> · {ap.label}</> : null}
                </p>
                <img src="/logo.png" alt="Fibertech" style={{ height: 22, objectFit: 'contain' }} />
              </div>
              <div className="flex-1 min-h-0 px-4 pb-4 flex items-center justify-center">
                <img src={ap.dataUrl} alt={ap.label || ''} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Hidden mirror — real rendered heights for exact pagination. */}
      <div id="po-measure" aria-hidden="true" style={{ position: 'absolute', left: '-99999px', top: 0, width: '210mm', visibility: 'hidden' }}>
        <div data-m="page" style={{ height: '297mm' }} />
        <div data-m="pad" className="pt-8 pb-6" style={{ display: 'flow-root' }}><div style={{ height: '1px' }} /></div>
        <div data-m="footer" style={{ display: 'flow-root' }}><Footer pageNum={1} /></div>
        <div className="px-10" dir={dir}>
          <div data-m="header" style={{ display: 'flow-root' }}><Header /></div>
          <div data-m="contlabel" style={{ display: 'flow-root' }}>
            <p className="text-sm text-neutral-400 mb-4">{L('הזמנת רכש —', 'Purchase Order —')} <span dir="ltr">{order.po_number || ''}</span> {L('(המשך)', '(continued)')}</p>
          </div>
          <div data-m="items">{items.length > 0 && <ItemsTable slice={items} startIdx={0} />}</div>
          <div data-m="totals" style={{ display: 'flow-root' }}><Totals /></div>
          <div data-m="sign" style={{ display: 'flow-root' }}><Signatures /></div>
        </div>
      </div>
    </div>
  );
});

export default PODocument;
