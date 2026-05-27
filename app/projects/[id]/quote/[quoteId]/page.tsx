'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { CONTRACT_SECTIONS } from '@/lib/contract-terms';
import { parsePipeSpec } from '@/lib/pricing';

type CBlock = { type: 'heading' | 'clause'; title?: string; clause?: { num: number; text: string } };

function fmtSn(sn: string) {
  if (!sn) return '';
  const n = parseInt(sn, 10);
  return isNaN(n) ? sn : n.toLocaleString('en-US');
}

function formatCurrency(v: number) {
  return new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(v);
}

async function renderPdfToPages(attId: string, fileName: string, blob: Blob): Promise<Array<{ attId: string; fileName: string; pageNum: number; totalPages: number; dataUrl: string }>> {
  const pdfjsLib: any = await import('pdfjs-dist');
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
  const arrayBuffer = await blob.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const pages: Array<{ attId: string; fileName: string; pageNum: number; totalPages: number; dataUrl: string }> = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 1.5 });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) continue;
    await page.render({ canvasContext: ctx, viewport, canvas }).promise;
    pages.push({ attId, fileName, pageNum: i, totalPages: pdf.numPages, dataUrl: canvas.toDataURL('image/jpeg', 0.85) });
  }
  return pages;
}

export default function QuotePreviewPage() {
  const params = useParams();
  const projectId = params.id as string;
  const quoteId = params.quoteId as string;
  const supabase = createClient();

  const [quote, setQuote] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [project, setProject] = useState<any>(null);
  const [attachments, setAttachments] = useState<any[]>([]);
  const [clientContact, setClientContact] = useState<{ name: string; phone: string; email: string } | null>(null);
  const [attachmentPages, setAttachmentPages] = useState<Array<{ attId: string; fileName: string; pageNum: number; totalPages: number; dataUrl: string }>>([]);
  const [quoteViews, setQuoteViews] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [sendingLink, setSendingLink] = useState(false);
  const [measuredPages, setMeasuredPages] = useState<any[] | null>(null);

  useEffect(() => {
    async function load() {
      const [{ data: q }, { data: its }, { data: proj }, { data: atts }, { data: conts }, { data: qd }] = await Promise.all([
        supabase.from('quotes').select('*').eq('id', quoteId).single(),
        supabase.from('quote_items').select('*').eq('quote_id', quoteId).order('sort_order'),
        supabase.from('projects').select('*').eq('id', projectId).single(),
        supabase.from('attachments').select('*').eq('entity_type', 'quote').eq('entity_id', quoteId),
        supabase.from('project_contacts').select('id, name, phone, email').eq('project_id', projectId).order('created_at'),
        supabase.from('quote_drawings').select('attachment_id').eq('quote_id', quoteId),
      ]);
      setQuote(q);
      setItems(its || []);
      setProject(proj);

      // Project drawings linked to this quote (rendered alongside quote attachments).
      let linkedDrawings: any[] = [];
      const drawingIds = (qd || []).map((r: any) => r.attachment_id);
      if (drawingIds.length > 0) {
        const { data: dAtts } = await supabase.from('attachments').select('*').in('id', drawingIds);
        linkedDrawings = dAtts || [];
      }
      const allAtts = [...(atts || []), ...linkedDrawings];
      setAttachments(allAtts);
      // Prefer the contact linked to this quote; fall back to the project's first contact (old quotes).
      const chosen = (q?.contact_id && conts?.find((c: any) => c.id === q.contact_id)) || conts?.[0];
      if (chosen) setClientContact({ name: chosen.name || '', phone: chosen.phone || '', email: chosen.email || '' });

      // Load views (safe — table may not exist yet)
      try {
        const { data: views } = await supabase.from('quote_views').select('*').eq('quote_id', quoteId).order('viewed_at', { ascending: false });
        setQuoteViews(views || []);
      } catch {}

      // Download image + PDF attachments and convert to A4 pages
      if (allAtts.length > 0) {
        const renderableAtts = allAtts.filter((a: any) => /\.(png|jpg|jpeg|gif|bmp|webp|pdf)$/i.test(a.file_name));
        const pageEntries = await Promise.all(
          renderableAtts.map(async (att: any) => {
            try {
              let storagePath = att.file_url;
              if (storagePath.startsWith('http')) {
                const match = storagePath.match(/project-files\/(.+)$/);
                if (match) storagePath = match[1];
              }
              const { data, error } = await supabase.storage.from('project-files').download(storagePath);
              if (error || !data) {
                console.error('Download error for', att.file_name, error?.message);
                return [];
              }
              const isPdf = /\.pdf$/i.test(att.file_name);
              if (isPdf) {
                return await renderPdfToPages(att.id, att.file_name, data);
              }
              const url = await new Promise<string>((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result as string);
                reader.readAsDataURL(data);
              });
              return [{ attId: att.id, fileName: att.file_name, pageNum: 1, totalPages: 1, dataUrl: url }];
            } catch (err: any) {
              console.error('Failed to load attachment', att.file_name, err?.message);
              return [];
            }
          })
        );
        setAttachmentPages(pageEntries.flat());
      }

      setLoading(false);
    }
    load();
  }, [quoteId, projectId]);

  // Measure the real rendered height of every block in the hidden mirror, then pack pages
  // by those exact heights — estimates can't track html2canvas output, which left gaps.
  // Produces pages of numeric indices (items + trailing blocks); falls back to estimates.
  // NOTE: this hook must stay above the early returns to keep hook order stable.
  useEffect(() => {
    if (loading) return;
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
      if (!page297 || !footerH) return; // not laid out yet — keep estimate fallback

      const SAFETY = 14; // px — absorbs minor margin/rounding so a page never over-fills
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
        if (tbKeep[t]) need += tbHs[t + 1] || 0; // keep a heading/title with the block after it
        if (need > rem && (cur.blockIdxs.length > 0 || cur.itemIdxs.length > 0)) {
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
  }, [items, attachments, quote, loading]);

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

  const globalDisc = parseFloat(quote.global_discount_pct) || 0;
  const totalAfterLineDisc = items.reduce((s, i) => s + (parseFloat(i.total_price) || 0), 0);
  const finalTotal = globalDisc > 0 ? Math.round(totalAfterLineDisc * (1 - globalDisc / 100) * 100) / 100 : totalAfterLineDisc;
  const quoteDate = quote.created_at ? new Date(quote.created_at).toLocaleDateString('he-IL') : '';
  const validUntil = quote.valid_until ? new Date(quote.valid_until).toLocaleDateString('he-IL') : '';
  const hasAnyDiscount = globalDisc > 0 || items.some(i => (parseFloat(i.discount_pct) || 0) > 0);
  const colCount = hasAnyDiscount ? 8 : 7;

  const whatsappText = encodeURIComponent(
    `שלום, מצורפת הצעת מחיר מספר ${quote.quote_number} עבור פרויקט ${project.name || ''}.\nסה״כ: ${formatCurrency(finalTotal)}\nלצפייה: ${typeof window !== 'undefined' ? window.location.href : ''}`
  );

  const emailSubjectRaw = `${quote.client_name || ''} | ${project.name || ''} | הצעת מחיר ${quote.quote_number} — פיברטק`;
  const emailBodyRaw = `שלום,\n\nמצורפת הצעת מחיר מספר ${quote.quote_number} עבור פרויקט ${project.name || ''}.\n\nבברכה,\nפיברטק תעשיות צנרת וכימיקלים בע״מ`;

  function utf8ToBase64(str: string): string {
    const bytes = new TextEncoder().encode(str);
    let binary = '';
    bytes.forEach((b) => (binary += String.fromCharCode(b)));
    return btoa(binary);
  }

  async function generatePdfBase64(): Promise<string | null> {
    const html2canvas = (await import('html2canvas')).default;
    const { jsPDF } = await import('jspdf');
    const wrapper = document.getElementById('quote-page-content');
    if (!wrapper) return null;
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
      // Drawing pages are landscape A4; everything else is portrait A4.
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
  }

  async function handleEmailWithLink() {
    setSendingLink(true);
    try {
      const res = await fetch('/api/quote-share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quote_id: quoteId, expires_days: 3 }),
      });
      const shareData = await res.json();
      const shareLink = shareData.token ? `${window.location.origin}/quote/${shareData.token}` : '';
      const bodyWithLink = emailBodyRaw + (shareLink ? `\n\nלצפייה בהצעת המחיר:\n${shareLink}` : '');
      const mailto = `mailto:?subject=${encodeURIComponent(emailSubjectRaw)}&body=${encodeURIComponent(bodyWithLink)}`;
      window.open(mailto, '_self');
    } catch {
      alert('שגיאה ביצירת הקישור');
    } finally {
      setSendingLink(false);
    }
  }

  async function handleDownloadPdf() {
    setGeneratingPdf(true);
    try {
      const pdfBase64 = await generatePdfBase64();
      if (!pdfBase64) return;
      const byteChars = atob(pdfBase64);
      const byteNumbers = new Array(byteChars.length);
      for (let i = 0; i < byteChars.length; i++) byteNumbers[i] = byteChars.charCodeAt(i);
      const blob = new Blob([new Uint8Array(byteNumbers)], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const safeName = (s: string) => (s || '').trim().replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, '-');
      const fileParts = [safeName(quote.client_name), safeName(project.name), safeName(quote.quote_number)].filter(Boolean);
      a.download = `${fileParts.join('_')}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      alert('שגיאה ביצירת PDF');
    } finally {
      setGeneratingPdf(false);
    }
  }

  const vatAmount = Math.round(finalTotal * 0.18);
  const totalWithVat = finalTotal + vatAmount;

  // ---- Pagination: fixed A4 pages (each rendered to one PDF page), packed by estimated height ----
  // Heights are conservative mm estimates so a page never over-fills (overflow:hidden would clip).
  const USABLE_H = 248, HEADER_H = 78, THEAD_H = 10, CONT_LABEL_H = 9;
  // Per-row height grows with the description length (the PN/SN columns narrow it,
  // so long names wrap to more lines). Conservative so a page never over-fills.
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

  // ---- Everything after the items table flows continuously: summary → contract → signatures.
  // One greedy packer fills each A4 page before breaking, so there are no half-empty pages.
  // Estimates stay a touch under the real height (pages use overflow:hidden → must never over-fill).
  const nonImgAtts = attachments.filter((a) => !/\.(png|jpg|jpeg|gif|bmp|webp)$/i.test(a.file_name));
  const cEstClause = (t: string) => 1.8 + Math.ceil((t || '').length / 115) * 3.2;

  type TBlock =
    | { kind: 'summary'; key: string; h: number }
    | { kind: 'ctitle'; h: number }
    | { kind: 'cblock'; b: CBlock; h: number }
    | { kind: 'sign'; h: number };

  const trailing: TBlock[] = [];
  trailing.push({ kind: 'summary', key: 'totals', h: globalDisc > 0 ? 52 : 42 });
  if (quote.payment_terms || quote.delivery_time) trailing.push({ kind: 'summary', key: 'pay', h: 32 });
  if (quote.disclaimer_text) trailing.push({ kind: 'summary', key: 'disc', h: 12 + Math.ceil((quote.disclaimer_text || '').length / 90) * 4.5 });
  trailing.push({ kind: 'summary', key: 'doc', h: 22 });
  if (nonImgAtts.length) trailing.push({ kind: 'summary', key: 'att', h: 14 + nonImgAtts.length * 5 });
  trailing.push({ kind: 'ctitle', h: 18 });
  CONTRACT_SECTIONS.forEach((s) => {
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

  {
    const lastSlice = itemPages[itemPages.length - 1];
    const lastUsed = (itemPages.length === 1 ? HEADER_H : CONT_LABEL_H) + THEAD_H + lastSlice.reduce((s: number, it: any) => s + rowH(it), 0);
    let cur = pages[pages.length - 1];
    let rem = USABLE_H - lastUsed;
    for (let i = 0; i < trailing.length; i++) {
      const tb = trailing[i];
      // Keep a heading/title with the block that follows it (no orphaned heading at a page foot).
      let need = tb.h;
      if (tb.kind === 'ctitle' || (tb.kind === 'cblock' && tb.b.type === 'heading')) need += trailing[i + 1]?.h || 0;
      if (need > rem && (cur.blockIdxs.length > 0 || cur.itemIdxs.length > 0)) {
        cur = { hasHeader: false, itemIdxs: [], blockIdxs: [] };
        pages.push(cur);
        rem = USABLE_H - CONT_LABEL_H; // continuation pages carry the small "(המשך)" line
      }
      cur.blockIdxs.push(i);
      rem -= tb.h;
    }
  }

  const renderPages = measuredPages ?? pages;
  const totalPages = renderPages.length + attachmentPages.length;

  function PageMeta({ pageNum }: { pageNum: number }) {
    return (
      <div className="border-t border-gray-300 mt-2 pt-2 flex justify-between items-center" dir="rtl">
        <span className="text-[9px] text-gray-500">
          מס׳ הצעה: <span className="font-semibold">{quote.quote_number}</span>
          {quoteDate && <> &nbsp;|&nbsp; תאריך: <span className="font-semibold">{quoteDate}</span></>}
        </span>
        <span className="text-[9px] font-semibold text-[#003d77]">
          עמוד {pageNum} מתוך {totalPages}
        </span>
      </div>
    );
  }

  const QuoteFooter = ({ pageNum }: { pageNum: number }) => (
    <div className="bg-[#f0f0f0] px-10 py-4 text-center" dir="rtl">
      <p className="text-[11px] font-bold text-[#5c5c5c]">פיברטק תשתיות צנרת וכימיקלים בע״מ</p>
      <p className="text-[9px] text-gray-500 mt-0.5">מפעל פיברטק: אזור תעשיה קרני שומרון, ת.ד 44855 | טל׳: 09-7929441 | info@fibertech.co.il</p>
      <p className="text-[9px] text-gray-500">קבוצת מאיה אופקים: אלי הורוביץ 27, רחובות 7608803 | טל׳: 073-2290900 | shula@maya-group.co.il</p>
      <p className="text-[9px] font-semibold text-[#5c5c5c] mt-0.5">www.fibertech.co.il</p>
      <PageMeta pageNum={pageNum} />
    </div>
  );

  const QuoteHeader = () => (
    <>
      {/* Header: title right, logo left */}
      <div className="flex justify-between items-start mb-3">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 tracking-wide">סקר חוזה</h1>
          <p className="text-sm text-gray-500 mt-1">
            <span className="font-semibold">מס׳ הצעה:</span> {quote.quote_number}
            {quoteDate && <>&nbsp;|&nbsp;<span className="font-semibold">תאריך:</span> {quoteDate}</>}
          </p>
          {validUntil && <p className="text-xs text-gray-400 mt-0.5">תוקף עד: {validUntil}</p>}
        </div>
        <img src="/logo.png" alt="Fibertech" className="h-14 object-contain" />
      </div>
      <div className="border-b-2 border-[#5c5c5c] mb-4" />
      <div className="grid grid-cols-2 gap-10 mb-5">
        <div className="border-r-4 border-[#003d77] pr-4 flex flex-col text-right">
          <h3 className="text-sm font-bold text-[#003d77] mb-3 text-right">לכבוד</h3>
          <p className="text-base font-bold text-gray-800 text-right">{quote.client_name}</p>
          {project.client_name && project.client_name !== quote.client_name && (
            <p className="text-sm text-gray-600 text-right">{project.client_name}</p>
          )}
          <div className="mt-auto pt-3 text-right">
            {clientContact?.name
              ? <p className="text-sm text-gray-700 text-right">{clientContact.name}</p>
              : <p className="text-sm text-gray-400 border-b border-gray-300 pb-0.5 w-52 text-right">איש קשר:</p>
            }
            {clientContact?.phone
              ? <p className="text-sm text-gray-600 mt-1 text-right"><span dir="ltr">{clientContact.phone}</span></p>
              : <p className="text-sm text-gray-400 mt-2 border-b border-gray-300 pb-0.5 w-52 text-right">טלפון:</p>
            }
          </div>
        </div>
        <div className="border-r-4 border-[#003d77] pr-4 flex flex-col text-right">
          <h3 className="text-sm font-bold text-[#003d77] mb-3 text-right">פרויקט</h3>
          <p className="text-base font-bold text-gray-800 text-right">{project.name || '—'}</p>
          {project.location && <p className="text-sm text-gray-600 text-right">{project.location}</p>}
          {quote.notes && <p className="text-sm text-gray-600 mt-1 text-right">{quote.notes}</p>}
          <div className="mt-auto pt-3 text-right">
            {clientContact?.email
              ? <p className="text-sm text-gray-600 text-right" style={{ unicodeBidi: 'plaintext' }}>{clientContact.email}</p>
              : <p className="text-sm text-gray-400 border-b border-gray-300 pb-0.5 w-52 text-right">מייל:</p>
            }
          </div>
        </div>
      </div>
    </>
  );

  const ItemsTable = ({ slice, startIdx }: { slice: any[]; startIdx: number }) => (
    <table className="w-full text-sm border-collapse mb-4">
      <thead>
        <tr className="bg-[#003d77]">
          <th className="text-center py-2.5 px-2 font-semibold text-white border border-[#003d77] w-8">#</th>
          <th className="text-right py-2.5 px-3 font-semibold text-white border border-[#003d77]">תיאור פריט</th>
          <th className="text-right py-2.5 px-3 font-semibold text-white border border-[#003d77]">קוטר</th>
          <th className="text-center py-2.5 px-3 font-semibold text-white border border-[#003d77]">לחץ (PN)</th>
          <th className="text-center py-2.5 px-3 font-semibold text-white border border-[#003d77]">קשיחות (SN)</th>
          <th className="text-center py-2.5 px-3 font-semibold text-white border border-[#003d77]">כמות</th>
          <th className="text-right py-2.5 px-3 font-semibold text-white border border-[#003d77]">יחידה</th>
          <th className="text-right py-2.5 px-3 font-semibold text-white border border-[#003d77]">מחיר ליחידה</th>
          {hasAnyDiscount && <th className="text-center py-2.5 px-3 font-semibold text-white border border-[#003d77]">הנחה</th>}
          <th className="text-right py-2.5 px-3 font-semibold text-white border border-[#003d77]">סה״כ</th>
        </tr>
      </thead>
      <tbody>
        {slice.map((item, localIdx) => {
          const idx = startIdx + localIdx;
          const disc = parseFloat(item.discount_pct) || 0;
          return (
            <tr key={item.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/60'}>
              <td className="py-2 px-2 border border-gray-200 text-gray-400 text-center">{idx + 1}</td>
              <td className="py-2 px-3 border border-gray-200 text-gray-800 font-medium text-right" dir="ltr">
                {item.product_name}{item.notes ? <span className="text-gray-400 font-normal"> ({item.notes})</span> : ''}
              </td>
              <td className="py-2 px-3 border border-gray-200 text-gray-500">{item.dn_size || '—'}</td>
              <td className="py-2 px-3 border border-gray-200 text-gray-600 text-center">{parsePipeSpec(item.product_name, { pn: item.pn, sn: item.sn }).pn || '—'}</td>
              <td className="py-2 px-3 border border-gray-200 text-gray-600 text-center">{fmtSn(parsePipeSpec(item.product_name, { pn: item.pn, sn: item.sn }).sn) || '—'}</td>
              <td className="py-2 px-3 border border-gray-200 text-gray-700 text-center">{item.quantity}</td>
              <td className="py-2 px-3 border border-gray-200 text-gray-600">{item.unit}</td>
              <td className="py-2 px-3 border border-gray-200 text-gray-700">{formatCurrency(parseFloat(item.unit_price) || 0)}</td>
              {hasAnyDiscount && (
                <td className="py-2 px-3 border border-gray-200 text-center text-gray-600">{disc > 0 ? `${disc}%` : '0%'}</td>
              )}
              <td className="py-2 px-3 border border-gray-200 font-semibold text-gray-800">{formatCurrency(parseFloat(item.total_price) || 0)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );

  const summaryEls: Record<string, JSX.Element> = {
    totals: (
      <div key="totals" className="flex justify-end mb-6">
        <div className="border border-gray-200 w-64 text-sm">
          {globalDisc > 0 && (
            <>
              <div className="flex justify-between px-4 py-2 border-b border-gray-200">
                <span className="text-gray-600">סכום לפני הנחה</span>
                <span className="text-gray-600">{formatCurrency(totalAfterLineDisc)}</span>
              </div>
              <div className="flex justify-between px-4 py-2 border-b border-gray-200">
                <span className="text-orange-600">הנחה {globalDisc}%</span>
                <span className="text-orange-600">-{formatCurrency(totalAfterLineDisc - finalTotal)}</span>
              </div>
            </>
          )}
          <div className="flex justify-between px-4 py-2 border-b border-gray-200">
            <span className="text-gray-600">סכום ביניים</span>
            <span className="text-gray-600">{formatCurrency(finalTotal)}</span>
          </div>
          <div className="flex justify-between px-4 py-2 border-b border-gray-200">
            <span className="text-gray-600">מע&quot;מ 18%</span>
            <span className="text-gray-600">{formatCurrency(vatAmount)}</span>
          </div>
          <div className="flex justify-between px-4 py-2.5 bg-[#003d77]">
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
            <h3 className="text-sm font-bold text-gray-800 mb-2 border-r-4 border-[#003d77] pr-3">תנאי תשלום</h3>
            <p className="text-xs text-gray-600 whitespace-pre-line leading-relaxed">{quote.payment_terms}</p>
          </div>
        )}
        {quote.delivery_time && (
          <div>
            <h3 className="text-sm font-bold text-gray-800 mb-2 border-r-4 border-[#003d77] pr-3">זמן אספקה</h3>
            <p className="text-xs text-gray-600 whitespace-pre-line leading-relaxed">{quote.delivery_time}</p>
          </div>
        )}
      </div>
    ),
    disc: (
      <div key="disc" className="mb-4">
        <h3 className="text-sm font-bold text-gray-800 mb-2 border-r-4 border-[#003d77] pr-3">הערות</h3>
        <p className="text-xs text-gray-600 whitespace-pre-line leading-relaxed">{quote.disclaimer_text}</p>
      </div>
    ),
    doc: (
      <div key="doc" className="mb-5 bg-gray-50 border border-gray-200 rounded px-4 py-3">
        <p className="text-xs text-gray-700 leading-relaxed">
          <span className="font-bold">הצהרת מסמכים: </span>
          הסכם זה כולל את כל המסמכים שצורפו להצעה זו — סקר חוזה, שרטוטים ומפרטים טכניים, ותנאי הסכם — כולם מהווים יחד מסמך מחייב אחד ובלתי נפרד.
        </p>
      </div>
    ),
    att: (
      <div key="att" className="mb-5">
        <h3 className="text-sm font-bold text-gray-800 mb-2 border-r-4 border-[#003d77] pr-3">מפרטים טכניים ושרטוטים</h3>
        <div className="space-y-1">
          {nonImgAtts.map((att) => (
            <div key={att.id} className="flex items-center gap-2 text-xs text-gray-600">
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
            <h1 className="text-2xl font-bold text-gray-900 tracking-wide">תנאי הסכם</h1>
            <p className="text-[10px] text-gray-500 mt-0.5">מסמך זה מהווה חלק בלתי נפרד מסקר החוזה</p>
          </div>
          <img src="/logo.png" alt="Fibertech" className="h-10 object-contain" />
        </div>
        <div className="border-b-2 border-[#5c5c5c] mb-2" />
      </div>
    );
    if (tb.kind === 'cblock') {
      return tb.b.type === 'heading' ? (
        <div key={key} className="border-r-4 border-[#003d77] pr-3 mt-2 mb-1">
          <h3 className="text-[12px] font-bold text-[#003d77]">{tb.b.title}</h3>
        </div>
      ) : (
        <div key={key} className="flex gap-2 text-[10px] text-gray-700 leading-tight mb-1">
          <span className="font-bold text-[#003d77] min-w-[18px] text-left">{tb.b.clause!.num}.</span>
          <span className="whitespace-pre-line">{tb.b.clause!.text}</span>
        </div>
      );
    }
    return (
      <div key={key} className="mt-4">
        <div className="flex justify-between items-start mb-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-wide">חתימות</h1>
            <p className="text-[11px] text-gray-500 mt-0.5">מס׳ הצעה: <span className="font-semibold">{quote.quote_number}</span></p>
          </div>
          <img src="/logo.png" alt="Fibertech" className="h-11 object-contain" />
        </div>
        <div className="border-b-2 border-[#5c5c5c] mb-6" />
        <p className="text-sm text-gray-600 mb-8 leading-relaxed">בחתימתנו מטה אנו מאשרים את ההצעה על כל חלקיה, לרבות סקר החוזה, השרטוטים, המפרטים ותנאי ההסכם המצורפים.</p>
        <div className="grid grid-cols-2 gap-12 mt-4">
          <div>
            <p className="text-sm font-bold text-gray-700 mb-12">חתימת פיברטק</p>
            <div className="border-b border-gray-400" />
            <p className="text-[11px] text-gray-400 mt-2">שם + חתימה + תאריך</p>
          </div>
          <div>
            <p className="text-sm font-bold text-gray-700 mb-12">חתימת המזמין</p>
            <div className="border-b border-gray-400" />
            <p className="text-[11px] text-gray-400 mt-2">שם + חתימה + תאריך</p>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="bg-gray-100 min-h-screen">
      {/* Print controls */}
      <div className="print:hidden sticky top-0 z-50 bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-3">
        <button onClick={() => window.print()} className="bg-[#1a56db] text-white text-sm px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors">
          🖨️ הדפס
        </button>
        <button onClick={handleDownloadPdf} disabled={generatingPdf} className="bg-blue-50 text-blue-700 text-sm px-4 py-2 rounded-lg hover:bg-blue-100 transition-colors disabled:opacity-50">
          {generatingPdf ? '⏳ מייצר...' : '⬇️ הורד PDF'}
        </button>
        <button onClick={handleEmailWithLink} disabled={sendingLink} className="bg-gray-100 text-gray-700 text-sm px-4 py-2 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50">
          {sendingLink ? '⏳ מכין...' : '📧 שלח לינק להצעה במייל'}
        </button>
        <a href={`https://wa.me/?text=${whatsappText}`} target="_blank" rel="noopener noreferrer" className="bg-green-50 text-green-700 text-sm px-4 py-2 rounded-lg hover:bg-green-100 transition-colors">
          💬 שלח בוואטסאפ
        </a>
        <button onClick={() => window.history.back()} className="text-sm text-gray-500 px-3 py-2 hover:text-gray-700 mr-auto">
          ← חזרה
        </button>
        {quoteViews.length > 0 && (
          <div className="flex items-center gap-2 text-xs text-gray-500 border-r border-gray-200 pr-3">
            <span className="font-semibold text-green-600">👁 {quoteViews.length} צפיות</span>
            <span>אחרונה: {new Date(quoteViews[0].viewed_at).toLocaleString('he-IL')}</span>
          </div>
        )}
      </div>

      {quoteViews.length > 0 && (
        <div className="print:hidden max-w-[210mm] mx-auto bg-green-50 border border-green-200 rounded-lg mx-6 mt-4 p-4" dir="rtl">
          <h3 className="text-sm font-bold text-green-800 mb-2">👁 היסטוריית צפיות ({quoteViews.length})</h3>
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {quoteViews.map((v: any) => (
              <div key={v.id} className="flex items-center gap-3 text-xs text-green-700">
                <span>{new Date(v.viewed_at).toLocaleString('he-IL')}</span>
                {v.ip_address && <span className="text-green-500">IP: {v.ip_address}</span>}
                {v.user_agent && <span className="text-green-500 truncate max-w-[200px]">{v.user_agent.includes('Mobile') ? '📱 נייד' : '💻 מחשב'}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      <div id="quote-page-content">
        {/* Portrait pages — items, summary, contract and signatures flow continuously. */}
        {renderPages.map((pg: any, pIdx: number) => (
          <div key={`page-${pIdx}`} className="w-[210mm] mx-auto bg-white shadow-lg my-6 print:my-0 print:shadow-none flex flex-col justify-between" style={{ height: '297mm', overflow: 'hidden' }}>
            <div className="px-10 pt-8 pb-6 overflow-hidden min-h-0" dir="rtl">
              {pg.hasHeader
                ? <QuoteHeader />
                : <p className="text-sm text-gray-400 mb-4">סקר חוזה — מס׳ {quote.quote_number} (המשך)</p>
              }
              {pg.itemIdxs.length > 0 && <ItemsTable slice={pg.itemIdxs.map((i: number) => items[i])} startIdx={pg.itemIdxs[0]} />}
              {pg.blockIdxs.map((bi: number) => renderTBlock(trailing[bi], bi))}
            </div>
            <QuoteFooter pageNum={pIdx + 1} />
          </div>
        ))}

        {/* Drawing / attachment pages — landscape A4 appendix at the end */}
        {attachmentPages.map((page, idx) => (
          <div key={`${page.attId}-${page.pageNum}`} data-orient="landscape" className="mx-auto bg-white shadow-lg my-6 print:my-0 print:shadow-none flex flex-col justify-between" style={{ width: '297mm', height: '210mm', overflow: 'hidden' }}>
            <div className="flex items-start justify-between px-8 pt-4" dir="rtl">
              <div>
                <h2 className="text-lg font-bold text-gray-900">שרטוט הפרויקט</h2>
                <p className="text-[11px] text-gray-500 mt-0.5">
                  {page.fileName}{page.totalPages > 1 ? ` (עמוד ${page.pageNum} מתוך ${page.totalPages})` : ''}
                  &nbsp;|&nbsp; מס׳ הצעה: <span className="font-semibold">{quote.quote_number}</span>
                </p>
              </div>
              <img src="/logo.png" alt="Fibertech" className="h-11 object-contain" />
            </div>
            <div className="flex-1 flex items-center justify-center px-6 min-h-0">
              <img src={page.dataUrl} alt={page.fileName} className="max-w-full max-h-full object-contain" />
            </div>
            <div className="bg-[#f0f0f0] px-8 py-3 text-center" dir="rtl">
              <p className="text-[11px] font-bold text-[#5c5c5c]">פיברטק תשתיות צנרת וכימיקלים בע״מ</p>
              <p className="text-[9px] text-gray-500 mt-0.5">מפעל פיברטק: אזור תעשיה קרני שומרון, ת.ד 44855 | טל׳: 09-7929441 | info@fibertech.co.il</p>
              <p className="text-[9px] font-semibold text-[#5c5c5c] mt-0.5">www.fibertech.co.il</p>
              <PageMeta pageNum={renderPages.length + 1 + idx} />
            </div>
          </div>
        ))}
      </div>

      {/* Hidden mirror — measures real rendered heights for exact pagination (not printed/exported). */}
      <div id="pdf-measure" aria-hidden="true" style={{ position: 'absolute', left: '-99999px', top: 0, width: '210mm', visibility: 'hidden' }}>
        <div data-m="page" style={{ height: '297mm' }} />
        <div data-m="pad" className="pt-8 pb-6" style={{ display: 'flow-root' }}><div style={{ height: '1px' }} /></div>
        <div data-m="footer" style={{ display: 'flow-root' }}><QuoteFooter pageNum={1} /></div>
        <div className="px-10" dir="rtl">
          <div data-m="header" style={{ display: 'flow-root' }}><QuoteHeader /></div>
          <div data-m="contlabel" style={{ display: 'flow-root' }}><p className="text-sm text-gray-400 mb-4">סקר חוזה — מס׳ {quote.quote_number} (המשך)</p></div>
          <div data-m="items">{items.length > 0 && <ItemsTable slice={items} startIdx={0} />}</div>
          <div data-m="trailing">
            {trailing.map((tb, i) => (
              <div key={i} data-keep={tb.kind === 'ctitle' || (tb.kind === 'cblock' && tb.b.type === 'heading') ? '1' : '0'} style={{ display: 'flow-root' }}>
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
        }
      `}</style>
    </div>
  );
}
