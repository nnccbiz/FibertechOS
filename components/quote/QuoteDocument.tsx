'use client';

/**
 * Shared quote document — the single source of truth for how a quote is
 * rendered and exported, used by BOTH the internal preview
 * (/projects/[id]/quote/[quoteId]) and the public share page (/quote/[token]).
 * Previously each had its own template, so the customer's shared link showed a
 * different (and worse) layout than the salesperson's PDF.
 *
 * Layout is fixed A4 (210mm) so the PDF is identical on every device. On narrow
 * screens the whole page is scaled down to fit the viewport (fit-to-width) — so
 * mobile shows the full page proportionally instead of squishing the columns
 * (public page's old bug) or overflowing off-screen (internal page's bug).
 *
 * The parent owns the toolbar and triggers the download via a ref:
 *   const docRef = useRef<QuoteDocumentHandle>(null);
 *   <QuoteDocument ref={docRef} ... />
 *   docRef.current?.downloadPdf('filename')
 */
import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { parsePipeSpec } from '@/lib/pricing';

type CBlock = { type: 'heading' | 'clause'; title?: string; clause?: { num: number; text: string } };

export type QuoteAttachmentPage = {
  attId: string; fileName: string; fileType: string | null; drawingNumber: string | null;
  pageNum: number; totalPages: number; dataUrl: string;
};

export interface QuoteContractSection { title: string; clauses: { num: number; text: string }[] }

export interface QuoteDocumentData {
  quote: any;
  items: any[];
  project: any;
  clientContact: { name: string; phone: string; email: string } | null;
  contractSections: QuoteContractSection[];
  costCurrency: string | null;
  attachmentPages: QuoteAttachmentPage[];
  /** Raw attachment rows — used only to list non-image files by name. */
  attachments?: any[];
}

export interface QuoteDocumentHandle {
  downloadPdf: (fileName?: string) => Promise<void>;
  getPdfBase64: () => Promise<string | null>;
}

const A4_W = 794; // 210mm at 96dpi — the fixed on-screen/PDF page width

function currencyPegNote(currency: string | null | undefined): string | null {
  const c = (currency || '').toUpperCase();
  if (c === 'USD') return 'המחירים בהצעה זו צמודים לשער הדולר האמריקאי (USD) של בנק ישראל.';
  if (c === 'EUR') return 'המחירים בהצעה זו צמודים לשער האירו (EUR) של בנק ישראל.';
  if (c === 'GBP') return 'המחירים בהצעה זו צמודים לשער הליש"ט (GBP) של בנק ישראל.';
  return null;
}

function fmtSn(sn: string) {
  if (!sn) return '';
  const n = parseInt(sn, 10);
  return isNaN(n) ? sn : n.toLocaleString('en-US');
}

function formatCurrency(v: number) {
  return new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(v);
}

const QuoteDocument = forwardRef<QuoteDocumentHandle, QuoteDocumentData>(function QuoteDocument(
  { quote, items, project, clientContact, contractSections, costCurrency, attachmentPages, attachments = [] },
  ref,
) {
  const [measuredPages, setMeasuredPages] = useState<any[] | null>(null);
  // Fit-to-width: zoom the fixed A4 layout down on narrow screens. CSS zoom
  // reflows (no dead space, no horizontal scroll) and — unlike transform — the
  // PDF/print reset it to 1 so export is always full A4.
  const outerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [fitH, setFitH] = useState<number | null>(null);

  // Measure the real rendered height of every block in the hidden mirror, then pack
  // pages by those exact heights — estimates can't track html2canvas output.
  useEffect(() => {
    let cancelled = false;
    const measure = () => {
      if (cancelled) return;
      const root = document.getElementById('pdf-measure');
      if (!root) return;
      const rh = (el: Element | null) => (el ? (el as HTMLElement).getBoundingClientRect().height : 0);
      const page297 = rh(root.querySelector('[data-m="page"]'));
      const footerH = rh(root.querySelector('[data-m="footer"]'));
      const padH = rh(root.querySelector('[data-m="pad"]'));
      const headerH = rh(root.querySelector('[data-m="header"]'));
      const contLabelH = rh(root.querySelector('[data-m="contlabel"]'));
      if (!page297 || !footerH) return;

      const SAFETY = 14;
      const contentAvail = page297 - footerH - padH;

      const itTable = root.querySelector('[data-m="items"] table');
      const theadH = itTable ? rh(itTable.querySelector('thead')) : 0;
      const trs = itTable ? (Array.from(itTable.querySelectorAll('tbody tr')) as HTMLElement[]) : [];
      const rowHs = trs.map((e) => e.getBoundingClientRect().height);
      const itemCount = rowHs.length;

      const tbWrap = root.querySelector('[data-m="trailing"]') as HTMLElement | null;
      const tbs = tbWrap ? (Array.from(tbWrap.children) as HTMLElement[]) : [];
      const tops = tbs.map((e) => e.getBoundingClientRect().top);
      const wrapBottom = tbWrap ? tbWrap.getBoundingClientRect().bottom : 0;
      const tbHs = tbs.map((e, i) => (i < tbs.length - 1 ? tops[i + 1] - tops[i] : wrapBottom - tops[i]));
      const tbKeep = tbs.map((e) => e.getAttribute('data-keep') === '1');
      const tbCtitleIdx = tbs.findIndex((e) => e.getAttribute('data-kind') === 'ctitle');
      if (!tbs.length) return;

      const result: { hasHeader: boolean; itemIdxs: number[]; blockIdxs: number[] }[] = [];
      let i = 0;
      if (itemCount === 0) result.push({ hasHeader: true, itemIdxs: [], blockIdxs: [] });
      while (i < itemCount) {
        const first = result.length === 0;
        const avail = (first ? contentAvail - headerH : contentAvail - contLabelH) - theadH - SAFETY;
        let used = 0; const idxs: number[] = [];
        while (i < itemCount && (idxs.length === 0 || used + rowHs[i] <= avail)) { used += rowHs[i]; idxs.push(i); i++; }
        result.push({ hasHeader: first, itemIdxs: idxs, blockIdxs: [] });
      }

      let cur = result[result.length - 1];
      const curBase = (cur.hasHeader ? headerH : contLabelH) + (cur.itemIdxs.length ? theadH : 0) + cur.itemIdxs.reduce((s, idx) => s + rowHs[idx], 0);
      let rem = contentAvail - curBase - SAFETY;
      for (let t = 0; t < tbs.length; t++) {
        let need = tbHs[t] || 0;
        if (tbKeep[t]) need += tbHs[t + 1] || 0;
        const forceBreak = t === tbCtitleIdx;
        if ((forceBreak || need > rem) && (cur.blockIdxs.length > 0 || cur.itemIdxs.length > 0)) {
          cur = { hasHeader: false, itemIdxs: [], blockIdxs: [] };
          result.push(cur);
          rem = contentAvail - contLabelH - SAFETY;
        }
        cur.blockIdxs.push(t);
        rem -= (tbHs[t] || 0);
      }
      setMeasuredPages(result);
    };
    const fonts = (document as any).fonts;
    if (fonts?.ready) fonts.ready.then(() => requestAnimationFrame(measure));
    else requestAnimationFrame(measure);
    return () => { cancelled = true; };
  }, [items, attachmentPages, quote, contractSections, costCurrency]);

  // Recompute the fit-to-width scale AND the placeholder height it needs, so the
  // scaled document occupies its real (reduced) space in flow — nothing above it
  // (e.g. the internal page's views panel) or below it overlaps.
  useEffect(() => {
    const recompute = () => {
      const avail = outerRef.current?.clientWidth ?? A4_W;
      const s = Math.min(1, avail / A4_W);
      setScale(s);
      const h = contentRef.current?.offsetHeight ?? 0;
      setFitH(h ? Math.ceil(h * s) : null);
    };
    recompute();
    const t1 = setTimeout(recompute, 250);
    const t2 = setTimeout(recompute, 800);
    window.addEventListener('resize', recompute);
    const fonts = (document as any).fonts;
    if (fonts?.ready) fonts.ready.then(recompute);
    return () => { window.removeEventListener('resize', recompute); clearTimeout(t1); clearTimeout(t2); };
  }, [measuredPages, items, attachmentPages, contractSections, costCurrency, quote]);

  async function generatePdfBase64(): Promise<string | null> {
    const html2canvas = (await import('html2canvas')).default;
    const { jsPDF } = await import('jspdf');
    const wrapper = document.getElementById('quote-page-content');
    if (!wrapper) return null;
    // Capture at the true A4 width regardless of the on-screen fit scale.
    const prevTransform = wrapper.style.transform;
    const prevPosition = wrapper.style.position;
    wrapper.style.transform = 'none';
    wrapper.style.position = 'static';
    try {
      const pages = wrapper.children;
      const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4', compress: true });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      let firstPage = true;
      for (let i = 0; i < pages.length; i++) {
        const el = pages[i] as HTMLElement;
        if (!el || el.offsetHeight === 0) continue;
        const landscape = el.getAttribute('data-orient') === 'landscape';
        const canvas = await html2canvas(el, { scale: 1.5, useCORS: true, backgroundColor: '#ffffff' });
        const imgData = canvas.toDataURL('image/jpeg', 0.85);
        if (!firstPage) pdf.addPage('a4', landscape ? 'landscape' : 'portrait');
        firstPage = false;
        const w = landscape ? pageH : pageW;
        const h = landscape ? pageW : pageH;
        pdf.addImage(imgData, 'JPEG', 0, 0, w, h, undefined, 'FAST');
      }
      const arrayBuf = pdf.output('arraybuffer');
      const bytes = new Uint8Array(arrayBuf);
      let bin = '';
      bytes.forEach((b) => (bin += String.fromCharCode(b)));
      return btoa(bin);
    } finally {
      wrapper.style.transform = prevTransform;
      wrapper.style.position = prevPosition;
    }
  }

  async function handleDownloadPdf(fileName?: string) {
    const pdfBase64 = await generatePdfBase64();
    if (!pdfBase64) return;
    const byteChars = atob(pdfBase64);
    const byteNumbers = new Array(byteChars.length);
    for (let i = 0; i < byteChars.length; i++) byteNumbers[i] = byteChars.charCodeAt(i);
    const blob = new Blob([new Uint8Array(byteNumbers)], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(fileName || `הצעת-מחיר-${quote.quote_number}`).replace(/[\\/:*?"<>|]/g, '')}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  useImperativeHandle(ref, () => ({ downloadPdf: handleDownloadPdf, getPdfBase64: generatePdfBase64 }), [quote, measuredPages]);

  const globalDisc = parseFloat(quote.global_discount_pct) || 0;
  const totalAfterLineDisc = items.reduce((s, i) => s + (parseFloat(i.total_price) || 0), 0);
  const finalTotal = globalDisc > 0 ? Math.round(totalAfterLineDisc * (1 - globalDisc / 100) * 100) / 100 : totalAfterLineDisc;
  const quoteDateSource = quote.status === 'draft'
    ? new Date()
    : new Date(quote.sent_at || quote.updated_at || Date.now());
  const quoteDate = quoteDateSource.toLocaleDateString('he-IL');
  const validUntil = quote.valid_until ? new Date(quote.valid_until).toLocaleDateString('he-IL') : '';
  const hasAnyDiscount = items.some((i) => (parseFloat(i.discount_pct) || 0) > 0);

  const vatAmount = Math.round(finalTotal * 0.18);
  const totalWithVat = finalTotal + vatAmount;

  // ---- Pagination (estimate fallback; measured pass refines it) ----
  const USABLE_H = 248, HEADER_H = 78, THEAD_H = 10, CONT_LABEL_H = 9;
  const rowH = (it: any) => {
    const len = (it?.product_name || '').length + (it?.notes ? String(it.notes).length + 3 : 0);
    const lines = Math.max(1, Math.ceil(len / 50));
    return 6 + lines * 4.5;
  };
  const itemPages: any[][] = [];
  {
    let i = 0, first = true;
    while (i < items.length) {
      const budget = (first ? USABLE_H - HEADER_H : USABLE_H - CONT_LABEL_H) - THEAD_H;
      let used = 0, j = i;
      while (j < items.length) {
        const h = rowH(items[j]);
        if (used + h > budget && j > i) break;
        used += h; j++;
      }
      itemPages.push(items.slice(i, j));
      i = j; first = false;
    }
  }
  if (itemPages.length === 0) itemPages.push([]);

  const nonImgAtts = (attachments || []).filter((a: any) => !/\.(png|jpg|jpeg|gif|bmp|webp)$/i.test(a.file_name || ''));
  const cEstClause = (t: string) => 1.8 + Math.ceil((t || '').length / 115) * 3.2;

  type TBlock =
    | { kind: 'summary'; key: string; h: number }
    | { kind: 'ctitle'; h: number }
    | { kind: 'cblock'; b: CBlock; h: number }
    | { kind: 'sign'; h: number };

  const trailing: TBlock[] = [];
  trailing.push({ kind: 'summary', key: 'totals', h: globalDisc > 0 ? 52 : 42 });
  if (quote.payment_terms || quote.delivery_time) trailing.push({ kind: 'summary', key: 'pay', h: 32 });
  const currencyNote = currencyPegNote(costCurrency);
  if (quote.disclaimer_text || currencyNote) {
    const totalLen = (quote.disclaimer_text || '').length + (currencyNote ? currencyNote.length + 2 : 0);
    trailing.push({ kind: 'summary', key: 'disc', h: 12 + Math.ceil(totalLen / 90) * 4.5 });
  }
  trailing.push({ kind: 'summary', key: 'doc', h: 22 });
  if (nonImgAtts.length) trailing.push({ kind: 'summary', key: 'att', h: 14 + nonImgAtts.length * 5 });
  trailing.push({ kind: 'ctitle', h: 18 });
  contractSections.forEach((s) => {
    trailing.push({ kind: 'cblock', b: { type: 'heading', title: s.title }, h: 10 });
    s.clauses.forEach((cl) => trailing.push({ kind: 'cblock', b: { type: 'clause', clause: cl }, h: cEstClause(cl.text) }));
  });
  trailing.push({ kind: 'sign', h: 92 });

  type RPage = { hasHeader: boolean; itemIdxs: number[]; blockIdxs: number[] };
  const pages: RPage[] = [];
  let runIdx = 0;
  itemPages.forEach((slice, pIdx) => {
    const itemIdxs = slice.map((_: any, k: number) => runIdx + k);
    runIdx += slice.length;
    pages.push({ hasHeader: pIdx === 0, itemIdxs, blockIdxs: [] });
  });

  const ctitleIdx = trailing.findIndex((t) => t.kind === 'ctitle');
  {
    const lastSlice = itemPages[itemPages.length - 1];
    const lastUsed = (itemPages.length === 1 ? HEADER_H : CONT_LABEL_H) + THEAD_H + lastSlice.reduce((s: number, it: any) => s + rowH(it), 0);
    let cur = pages[pages.length - 1];
    let rem = USABLE_H - lastUsed;
    for (let i = 0; i < trailing.length; i++) {
      const tb = trailing[i];
      let need = tb.h;
      if (tb.kind === 'ctitle' || (tb.kind === 'cblock' && tb.b.type === 'heading')) need += trailing[i + 1]?.h || 0;
      const forceBreak = i === ctitleIdx;
      if ((forceBreak || need > rem) && (cur.blockIdxs.length > 0 || cur.itemIdxs.length > 0)) {
        cur = { hasHeader: false, itemIdxs: [], blockIdxs: [] };
        pages.push(cur);
        rem = USABLE_H - CONT_LABEL_H;
      }
      cur.blockIdxs.push(i);
      rem -= tb.h;
    }
  }

  const renderPages = measuredPages ?? pages;
  const attachmentInsertIdx = (() => {
    const i = renderPages.findIndex((p: RPage) => p.blockIdxs.some((bi: number) => trailing[bi]?.kind === 'ctitle'));
    return i >= 0 ? i : renderPages.length;
  })();
  const totalPages = renderPages.length + attachmentPages.length;
  const displayPageNum = (portraitIdx: number) =>
    portraitIdx < attachmentInsertIdx ? portraitIdx + 1 : portraitIdx + 1 + attachmentPages.length;

  function PageMeta({ pageNum }: { pageNum: number }) {
    return (
      <div className="border-t border-line-strong mt-2 pt-2 flex justify-between items-center" dir="rtl">
        <span className="text-[9px] text-content-muted">
          מס׳ הצעה: <span className="font-semibold">{quote.quote_number}</span>
          {quoteDate && <> &nbsp;|&nbsp; תאריך: <span className="font-semibold">{quoteDate}</span></>}
        </span>
        <span className="text-[9px] font-semibold text-navy-700">
          עמוד {pageNum} מתוך {totalPages}
        </span>
      </div>
    );
  }

  const QuoteFooter = ({ pageNum }: { pageNum: number }) => (
    <div className="bg-neutral-100 px-10 py-4 text-center" dir="rtl">
      <p className="text-[11px] font-bold text-content-muted">פיברטק תשתיות צנרת וכימיקלים בע״מ</p>
      <p className="text-[9px] text-content-muted mt-0.5">מפעל פיברטק: אזור תעשיה קרני שומרון, ת.ד 44855 | טל׳: 09-7929441 | info@fibertech.co.il</p>
      <p className="text-[9px] text-content-muted">קבוצת מאיה אופקים: אלי הורוביץ 27, רחובות 7608803 | טל׳: 073-2290900 | shula@maya-group.co.il</p>
      <p className="text-[9px] font-semibold text-content-muted mt-0.5">www.fibertech.co.il</p>
      <PageMeta pageNum={pageNum} />
    </div>
  );

  const QuoteHeader = () => (
    <>
      <div className="flex justify-between items-start mb-3">
        <div>
          <h1 className="text-3xl font-bold text-content-strong tracking-wide">סקר חוזה</h1>
          <p className="text-sm text-content-muted mt-1">
            <span className="font-semibold">מס׳ הצעה:</span> {quote.quote_number}
            {quoteDate && <>&nbsp;|&nbsp;<span className="font-semibold">תאריך:</span> {quoteDate}</>}
          </p>
          {validUntil && <p className="text-xs text-neutral-400 mt-0.5">תוקף עד: {validUntil}</p>}
        </div>
        <img src="/logo.png" alt="Fibertech" className="h-14 object-contain" />
      </div>
      <div className="border-b-2 border-content-muted mb-4" />
      <div className="grid grid-cols-2 gap-10 mb-5">
        <div className="border-r-4 border-navy-700 pr-4 flex flex-col text-right">
          <h3 className="text-sm font-bold text-navy-700 mb-3 text-right">לכבוד</h3>
          <p className="text-base font-bold text-content-strong text-right">{quote.client_name}</p>
          {project.client_name && project.client_name !== quote.client_name && (
            <p className="text-sm text-content-body text-right">{project.client_name}</p>
          )}
          <div className="mt-auto pt-3 text-right">
            {clientContact?.name
              ? <p className="text-sm text-content-body text-right">{clientContact.name}</p>
              : <p className="text-sm text-neutral-400 border-b border-line-strong pb-0.5 w-52 text-right">איש קשר:</p>
            }
            {clientContact?.phone
              ? <p className="text-sm text-content-body mt-1 text-right"><span dir="ltr">{clientContact.phone}</span></p>
              : <p className="text-sm text-neutral-400 mt-2 border-b border-line-strong pb-0.5 w-52 text-right">טלפון:</p>
            }
          </div>
        </div>
        <div className="border-r-4 border-navy-700 pr-4 flex flex-col text-right">
          <h3 className="text-sm font-bold text-navy-700 mb-3 text-right">פרויקט</h3>
          <p className="text-base font-bold text-content-strong text-right">{project.name || '—'}</p>
          {project.location && <p className="text-sm text-content-body text-right">{project.location}</p>}
          {quote.notes && <p className="text-sm text-content-body mt-1 text-right">{quote.notes}</p>}
          <div className="mt-auto pt-3 text-right">
            {clientContact?.email
              ? <p className="text-sm text-content-body text-right" style={{ unicodeBidi: 'plaintext' }}>{clientContact.email}</p>
              : <p className="text-sm text-neutral-400 border-b border-line-strong pb-0.5 w-52 text-right">מייל:</p>
            }
          </div>
        </div>
      </div>
    </>
  );

  const ItemsTable = ({ slice, startIdx }: { slice: any[]; startIdx: number }) => (
    <table className="w-full text-sm border-collapse mb-4">
      <thead>
        <tr className="bg-navy-700">
          <th className="text-center py-2.5 px-2 font-semibold text-white border border-navy-700 w-8">#</th>
          <th className="text-right py-2.5 px-3 font-semibold text-white border border-navy-700">תיאור פריט</th>
          <th className="text-right py-2.5 px-3 font-semibold text-white border border-navy-700">קוטר</th>
          <th className="text-center py-2.5 px-3 font-semibold text-white border border-navy-700">לחץ (PN)</th>
          <th className="text-center py-2.5 px-3 font-semibold text-white border border-navy-700">קשיחות (SN)</th>
          <th className="text-center py-2.5 px-3 font-semibold text-white border border-navy-700">כמות</th>
          <th className="text-right py-2.5 px-3 font-semibold text-white border border-navy-700">יחידה</th>
          <th className="text-right py-2.5 px-3 font-semibold text-white border border-navy-700">מחיר ליחידה</th>
          {hasAnyDiscount && <th className="text-center py-2.5 px-3 font-semibold text-white border border-navy-700">הנחה</th>}
          <th className="text-right py-2.5 px-3 font-semibold text-white border border-navy-700">סה״כ</th>
        </tr>
      </thead>
      <tbody>
        {slice.map((item, localIdx) => {
          const idx = startIdx + localIdx;
          const disc = parseFloat(item.discount_pct) || 0;
          return (
            <tr key={item.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-neutral-50'}>
              <td className="py-2 px-2 border border-line-subtle text-neutral-400 text-center">{idx + 1}</td>
              <td className="py-2 px-3 border border-line-subtle text-content-strong font-medium text-right" dir="rtl">
                <span dir="ltr">{item.product_name}</span>{item.notes ? <span className="text-neutral-400 font-normal"> ({item.notes})</span> : ''}
              </td>
              <td className="py-2 px-3 border border-line-subtle text-content-muted">{item.dn_size || '—'}</td>
              <td className="py-2 px-3 border border-line-subtle text-content-body text-center">{parsePipeSpec(item.product_name, { pn: item.pn, sn: item.sn }).pn || '—'}</td>
              <td className="py-2 px-3 border border-line-subtle text-content-body text-center">{fmtSn(parsePipeSpec(item.product_name, { pn: item.pn, sn: item.sn }).sn) || '—'}</td>
              <td className="py-2 px-3 border border-line-subtle text-content-body text-center">{item.quantity}</td>
              <td className="py-2 px-3 border border-line-subtle text-content-body">{item.unit}</td>
              <td className="py-2 px-3 border border-line-subtle text-content-body">{formatCurrency(parseFloat(item.unit_price) || 0)}</td>
              {hasAnyDiscount && (
                <td className="py-2 px-3 border border-line-subtle text-center text-content-body">{disc > 0 ? `${disc}%` : '0%'}</td>
              )}
              <td className="py-2 px-3 border border-line-subtle font-semibold text-content-strong">{formatCurrency(parseFloat(item.total_price) || 0)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );

  const summaryEls: Record<string, JSX.Element> = {
    totals: (
      <div key="totals" className="flex justify-end mb-6">
        <div className="border border-line-subtle w-64 text-sm">
          {globalDisc > 0 && (
            <>
              <div className="flex justify-between px-4 py-2 border-b border-line-subtle">
                <span className="text-content-body">סכום לפני הנחה</span>
                <span className="text-content-body">{formatCurrency(totalAfterLineDisc)}</span>
              </div>
              <div className="flex justify-between px-4 py-2 border-b border-line-subtle">
                <span className="text-warning">הנחה {globalDisc}%</span>
                <span className="text-warning">-{formatCurrency(totalAfterLineDisc - finalTotal)}</span>
              </div>
            </>
          )}
          <div className="flex justify-between px-4 py-2 border-b border-line-subtle">
            <span className="text-content-body">סכום ביניים</span>
            <span className="text-content-body">{formatCurrency(finalTotal)}</span>
          </div>
          <div className="flex justify-between px-4 py-2 border-b border-line-subtle">
            <span className="text-content-body">מע&quot;מ 18%</span>
            <span className="text-content-body">{formatCurrency(vatAmount)}</span>
          </div>
          <div className="flex justify-between px-4 py-2.5 bg-navy-700">
            <span className="font-bold text-white">סה&quot;כ לתשלום</span>
            <span className="font-bold text-white">{formatCurrency(totalWithVat)}</span>
          </div>
        </div>
      </div>
    ),
    pay: (
      <div key="pay" className="grid grid-cols-2 gap-8 mb-5">
        {quote.payment_terms && (
          <div>
            <h3 className="text-sm font-bold text-content-strong mb-2 border-r-4 border-navy-700 pr-3">תנאי תשלום</h3>
            <p className="text-xs text-content-body whitespace-pre-line leading-relaxed">{quote.payment_terms}</p>
          </div>
        )}
        {quote.delivery_time && (
          <div>
            <h3 className="text-sm font-bold text-content-strong mb-2 border-r-4 border-navy-700 pr-3">זמן אספקה</h3>
            <p className="text-xs text-content-body whitespace-pre-line leading-relaxed">{quote.delivery_time}</p>
          </div>
        )}
      </div>
    ),
    disc: (
      <div key="disc" className="mb-4">
        <h3 className="text-sm font-bold text-content-strong mb-2 border-r-4 border-navy-700 pr-3">הערות</h3>
        <p className="text-xs text-content-body whitespace-pre-line leading-relaxed">
          {quote.disclaimer_text}
          {quote.disclaimer_text && currencyNote ? '\n' : ''}
          {currencyNote ? `• ${currencyNote}` : ''}
        </p>
      </div>
    ),
    doc: (
      <div key="doc" className="mb-5 bg-neutral-50 border border-line-subtle rounded px-4 py-3">
        <p className="text-xs text-content-body leading-relaxed">
          <span className="font-bold">הצהרת מסמכים: </span>
          הסכם זה כולל את כל המסמכים שצורפו להצעה זו — סקר חוזה, שרטוטים ומפרטים טכניים, ותנאי הסכם — כולם מהווים יחד מסמך מחייב אחד ובלתי נפרד.
        </p>
      </div>
    ),
    att: (
      <div key="att" className="mb-5">
        <h3 className="text-sm font-bold text-content-strong mb-2 border-r-4 border-navy-700 pr-3">מפרטים טכניים ושרטוטים</h3>
        <div className="space-y-1">
          {nonImgAtts.map((att: any) => (
            <div key={att.id} className="flex items-center gap-2 text-xs text-content-body">
              <span>📄</span>
              <span>{att.file_name}</span>
            </div>
          ))}
        </div>
      </div>
    ),
  };

  const renderTBlock = (tb: TBlock, key: number) => {
    if (tb.kind === 'summary') return <div key={key}>{summaryEls[tb.key]}</div>;
    if (tb.kind === 'ctitle') return (
      <div key={key} className="mt-1">
        <div className="flex justify-between items-start mb-3">
          <div>
            <h1 className="text-2xl font-bold text-content-strong tracking-wide">תנאי הסכם</h1>
            <p className="text-[10px] text-content-muted mt-0.5">מסמך זה מהווה חלק בלתי נפרד מסקר החוזה</p>
          </div>
          <img src="/logo.png" alt="Fibertech" className="h-10 object-contain" />
        </div>
        <div className="border-b-2 border-content-muted mb-2" />
      </div>
    );
    if (tb.kind === 'cblock') {
      return tb.b.type === 'heading' ? (
        <div key={key} className="border-r-4 border-navy-700 pr-3 mt-2 mb-1">
          <h3 className="text-[12px] font-bold text-navy-700">{tb.b.title}</h3>
        </div>
      ) : (
        <div key={key} className="flex gap-2 text-[10px] text-content-body leading-tight mb-1">
          <span className="font-bold text-navy-700 min-w-[18px] text-left">{tb.b.clause!.num}.</span>
          <span className="whitespace-pre-line">{tb.b.clause!.text}</span>
        </div>
      );
    }
    return (
      <div key={key} className="mt-4">
        <div className="flex justify-between items-start mb-3">
          <div>
            <h1 className="text-2xl font-bold text-content-strong tracking-wide">חתימות</h1>
            <p className="text-[11px] text-content-muted mt-0.5">מס׳ הצעה: <span className="font-semibold">{quote.quote_number}</span></p>
          </div>
          <img src="/logo.png" alt="Fibertech" className="h-11 object-contain" />
        </div>
        <div className="border-b-2 border-content-muted mb-6" />
        <p className="text-sm text-content-body mb-8 leading-relaxed">בחתימתנו מטה אנו מאשרים את ההצעה על כל חלקיה, לרבות סקר החוזה, השרטוטים, המפרטים ותנאי ההסכם המצורפים.</p>
        <div className="grid grid-cols-2 gap-12 mt-4">
          <div>
            <p className="text-sm font-bold text-content-body mb-12">חתימת פיברטק</p>
            <div className="border-b border-neutral-400" />
            <p className="text-[11px] text-neutral-400 mt-2">שם + חתימה + תאריך</p>
          </div>
          <div>
            <p className="text-sm font-bold text-content-body mb-12">חתימת המזמין</p>
            <div className="border-b border-neutral-400" />
            <p className="text-[11px] text-neutral-400 mt-2">שם + חתימה + תאריך</p>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div ref={outerRef} className="w-full relative overflow-x-hidden">
      {/* Holder reserves the scaled height so surrounding content never overlaps. */}
      <div style={{ position: 'relative', width: scale < 1 && fitH ? A4_W * scale : undefined, height: scale < 1 && fitH ? fitH : undefined, margin: '0 auto' }}>
        <div
          id="quote-page-content"
          ref={contentRef}
          style={scale < 1 && fitH
            ? { width: A4_W, transform: `scale(${scale})`, transformOrigin: 'top left', position: 'absolute', top: 0, left: 0 }
            : { width: A4_W, margin: '0 auto' }}
        >
          {renderPages.map((pg: any, pIdx: number) => (
            <React.Fragment key={`page-${pIdx}`}>
              <div className="w-[210mm] mx-auto bg-white shadow-lg my-6 print:my-0 print:shadow-none flex flex-col justify-between" style={{ height: '297mm', overflow: 'hidden' }}>
                <div className="px-10 pt-8 pb-6 overflow-hidden min-h-0" dir="rtl">
                  {pg.hasHeader
                    ? <QuoteHeader />
                    : <p className="text-sm text-neutral-400 mb-4">סקר חוזה — מס׳ {quote.quote_number} (המשך)</p>
                  }
                  {pg.itemIdxs.length > 0 && <ItemsTable slice={pg.itemIdxs.map((i: number) => items[i])} startIdx={pg.itemIdxs[0]} />}
                  {pg.blockIdxs.map((bi: number) => renderTBlock(trailing[bi], bi))}
                </div>
                <QuoteFooter pageNum={displayPageNum(pIdx)} />
              </div>

              {pIdx + 1 === attachmentInsertIdx && attachmentPages.map((page, idx) => (
                <AttachmentPageBlock key={`${page.attId}-${page.pageNum}`} page={page} pageNum={attachmentInsertIdx + 1 + idx} quoteNumber={quote.quote_number} PageMeta={PageMeta} />
              ))}
            </React.Fragment>
          ))}

          {attachmentInsertIdx === renderPages.length && attachmentPages.map((page, idx) => (
            <AttachmentPageBlock key={`tail-${page.attId}-${page.pageNum}`} page={page} pageNum={renderPages.length + 1 + idx} quoteNumber={quote.quote_number} PageMeta={PageMeta} />
          ))}
        </div>
      </div>

      {/* Hidden mirror — measures real rendered heights for exact pagination. */}
      <div id="pdf-measure" aria-hidden="true" style={{ position: 'absolute', left: '-99999px', top: 0, width: '210mm', visibility: 'hidden' }}>
        <div data-m="page" style={{ height: '297mm' }} />
        <div data-m="pad" className="pt-8 pb-6" style={{ display: 'flow-root' }}><div style={{ height: '1px' }} /></div>
        <div data-m="footer" style={{ display: 'flow-root' }}><QuoteFooter pageNum={1} /></div>
        <div className="px-10" dir="rtl">
          <div data-m="header" style={{ display: 'flow-root' }}><QuoteHeader /></div>
          <div data-m="contlabel" style={{ display: 'flow-root' }}><p className="text-sm text-neutral-400 mb-4">סקר חוזה — מס׳ {quote.quote_number} (המשך)</p></div>
          <div data-m="items">{items.length > 0 && <ItemsTable slice={items} startIdx={0} />}</div>
          <div data-m="trailing">
            {trailing.map((tb, i) => (
              <div key={i} data-kind={tb.kind} data-keep={tb.kind === 'ctitle' || (tb.kind === 'cblock' && tb.b.type === 'heading') ? '1' : '0'} style={{ display: 'flow-root' }}>
                {renderTBlock(tb, i)}
              </div>
            ))}
          </div>
        </div>
      </div>

      <style jsx global>{`
        @media print {
          body { background: white !important; }
          @page { size: A4; margin: 8mm; }
          #quote-page-content { transform: none !important; position: static !important; }
        }
      `}</style>
    </div>
  );
});

export default QuoteDocument;

function AttachmentPageBlock({
  page, pageNum, quoteNumber, PageMeta,
}: {
  page: QuoteAttachmentPage; pageNum: number; quoteNumber: string; PageMeta: (props: { pageNum: number }) => JSX.Element;
}) {
  const isSpec = page.fileType === 'spec';
  const headerTitle = isSpec ? 'מפרט טכני' : 'שרטוט הפרויקט';
  const subLabel = isSpec ? page.fileName : (page.drawingNumber || page.fileName);
  const dims = isSpec ? { width: '210mm', height: '297mm' } : { width: '297mm', height: '210mm' };
  const orient = isSpec ? 'portrait' : 'landscape';
  return (
    <div data-orient={orient} className="mx-auto bg-white shadow-lg my-6 print:my-0 print:shadow-none flex flex-col justify-between" style={{ ...dims, overflow: 'hidden' }}>
      <div className="flex items-start justify-between px-8 pt-4" dir="rtl">
        <div>
          <h2 className="text-lg font-bold text-content-strong">{headerTitle}</h2>
          <p className="text-[11px] text-content-muted mt-0.5">
            {subLabel}{page.totalPages > 1 ? ` (עמוד ${page.pageNum} מתוך ${page.totalPages})` : ''}
            &nbsp;|&nbsp; מס׳ הצעה: <span className="font-semibold">{quoteNumber}</span>
          </p>
        </div>
        <img src="/logo.png" alt="Fibertech" className="h-11 object-contain" />
      </div>
      <div className="flex-1 flex items-center justify-center px-6 min-h-0">
        <img src={page.dataUrl} alt={page.fileName} className="max-w-full max-h-full object-contain" />
      </div>
      <div className="bg-neutral-100 px-8 py-3 text-center" dir="rtl">
        <p className="text-[11px] font-bold text-content-muted">פיברטק תשתיות צנרת וכימיקלים בע״מ</p>
        <p className="text-[9px] text-content-muted mt-0.5">מפעל פיברטק: אזור תעשיה קרני שומרון, ת.ד 44855 | טל׳: 09-7929441 | info@fibertech.co.il</p>
        <p className="text-[9px] font-semibold text-content-muted mt-0.5">www.fibertech.co.il</p>
        <PageMeta pageNum={pageNum} />
      </div>
    </div>
  );
}
