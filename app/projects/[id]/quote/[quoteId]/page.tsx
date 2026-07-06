'use client';

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { CONTRACT_SECTIONS } from '@/lib/contract-terms';
import { parsePipeSpec } from '@/lib/pricing';
import Icon from '@/components/ui/Icon';

type CBlock = { type: 'heading' | 'clause'; title?: string; clause?: { num: number; text: string } };

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

type AttachmentPage = { attId: string; fileName: string; fileType: string | null; drawingNumber: string | null; pageNum: number; totalPages: number; dataUrl: string };

async function renderPdfToPages(attId: string, fileName: string, fileType: string | null, drawingNumber: string | null, blob: Blob): Promise<AttachmentPage[]> {
  const pdfjsLib: any = await import('pdfjs-dist');
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
  const arrayBuffer = await blob.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const pages: AttachmentPage[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 1.5 });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) continue;
    await page.render({ canvasContext: ctx, viewport, canvas }).promise;
    pages.push({ attId, fileName, fileType, drawingNumber, pageNum: i, totalPages: pdf.numPages, dataUrl: canvas.toDataURL('image/jpeg', 0.85) });
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
  const [contractSections, setContractSections] = useState<{ title: string; clauses: { num: number; text: string }[] }[]>(CONTRACT_SECTIONS);
  const [clientContact, setClientContact] = useState<{ name: string; phone: string; email: string } | null>(null);
  const [attachmentPages, setAttachmentPages] = useState<AttachmentPage[]>([]);
  const [quoteViews, setQuoteViews] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [sendingLink, setSendingLink] = useState(false);
  const [measuredPages, setMeasuredPages] = useState<any[] | null>(null);
  const [costCurrency, setCostCurrency] = useState<string | null>(null);

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

      // Resolve which contract terms to render: per-quote override (also acts
      // as the snapshot once issued) > linked template > fallback to the
      // hard-coded library default.
      try {
        if (q?.contract_overrides && Array.isArray(q.contract_overrides) && q.contract_overrides.length > 0) {
          setContractSections(q.contract_overrides);
        } else if (q?.contract_template_id) {
          const { data: tpl } = await supabase.from('contract_term_templates').select('content').eq('id', q.contract_template_id).single();
          if (tpl?.content && Array.isArray(tpl.content) && tpl.content.length > 0) setContractSections(tpl.content);
        }
      } catch (e) { console.error('[contract terms] resolve failed', e); }

      // Currency of the linked cost input — drives the auto exchange-rate note in the contract.
      try {
        if (q?.cost_input_id) {
          const { data: ci } = await supabase.from('cost_inputs').select('currency').eq('id', q.cost_input_id).single();
          // Effective currency: trust the header only when it's foreign; if it's
          // ILS (e.g. a mistagged duplicate) look at the items' original_currency,
          // so the currency-peg note matches the column shown in the editor.
          let eff = ci?.currency || null;
          if (!eff || eff === 'ILS') {
            const { data: citems } = await supabase.from('cost_input_items').select('original_currency, original_price').eq('cost_input_id', q.cost_input_id);
            const forex = (citems || []).find((i: any) => i.original_currency && i.original_currency !== 'ILS' && parseFloat(i.original_price) > 0);
            if (forex) eff = forex.original_currency;
          }
          if (eff) setCostCurrency(eff);
        }
      } catch {}

      // Project drawings linked to this quote (rendered alongside quote attachments).
      let linkedDrawings: any[] = [];
      const drawingIds = (qd || []).map((r: any) => r.attachment_id);
      if (drawingIds.length > 0) {
        const { data: dAtts } = await supabase.from('attachments').select('*').in('id', drawingIds);
        linkedDrawings = dAtts || [];
      }
      const allAtts = [...(atts || []), ...linkedDrawings];
      setAttachments(allAtts);
      // A sent/signed quote carries a frozen contact snapshot — use it as-is.
      // Otherwise show the live linked contact (or the project's first contact for old quotes).
      if (q?.contact_snapshot) {
        const s = q.contact_snapshot;
        setClientContact({ name: s.name || '', phone: s.phone || '', email: s.email || '' });
      } else {
        const chosen = (q?.contact_id && conts?.find((c: any) => c.id === q.contact_id)) || conts?.[0];
        if (chosen) setClientContact({ name: chosen.name || '', phone: chosen.phone || '', email: chosen.email || '' });
      }

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
                return await renderPdfToPages(att.id, att.file_name, att.file_type ?? null, att.drawing_number ?? null, data);
              }
              const url = await new Promise<string>((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result as string);
                reader.readAsDataURL(data);
              });
              return [{ attId: att.id, fileName: att.file_name, fileType: att.file_type ?? null, drawingNumber: att.drawing_number ?? null, pageNum: 1, totalPages: 1, dataUrl: url }];
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
      // Block index where the contract section starts — the JS pack force-breaks
      // before it so attachment pages can slot in here; mirror the rule.
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
        if (tbKeep[t]) need += tbHs[t + 1] || 0; // keep a heading/title with the block after it
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
  }, [items, attachments, quote, loading, contractSections, costCurrency]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-white">
        <p className="text-neutral-400">טוען הצעת מחיר...</p>
      </div>
    );
  }

  if (!quote || !project) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-white">
        <p className="text-danger">הצעת מחיר לא נמצאה</p>
      </div>
    );
  }

  const globalDisc = parseFloat(quote.global_discount_pct) || 0;
  const totalAfterLineDisc = items.reduce((s, i) => s + (parseFloat(i.total_price) || 0), 0);
  const finalTotal = globalDisc > 0 ? Math.round(totalAfterLineDisc * (1 - globalDisc / 100) * 100) / 100 : totalAfterLineDisc;
  // Quote date reflects when the prices are valid (they're pegged to today's FX rate).
  // Draft → today (fresh each render). Sent/signed → sent_at (frozen on issue);
  // fall back to updated_at for legacy quotes issued before sent_at existed.
  const quoteDateSource = quote.status === 'draft'
    ? new Date()
    : new Date(quote.sent_at || quote.updated_at || Date.now());
  const quoteDate = quoteDateSource.toLocaleDateString('he-IL');
  const validUntil = quote.valid_until ? new Date(quote.valid_until).toLocaleDateString('he-IL') : '';
  // The per-line "הנחה" column shows only when at least one line has its own
  // discount. A quote-wide (global) discount is shown in the totals box instead,
  // so it must NOT force an all-zeros discount column onto the items table.
  const hasAnyDiscount = items.some(i => (parseFloat(i.discount_pct) || 0) > 0);
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

  // Force a hard page break before the contract title so the drawing / spec
  // attachment pages can sit between the summary section and the contract.
  const ctitleIdx = trailing.findIndex((t) => t.kind === 'ctitle');
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
      const forceBreak = i === ctitleIdx; // attachments slot in here
      if ((forceBreak || need > rem) && (cur.blockIdxs.length > 0 || cur.itemIdxs.length > 0)) {
        cur = { hasHeader: false, itemIdxs: [], blockIdxs: [] };
        pages.push(cur);
        rem = USABLE_H - CONT_LABEL_H; // continuation pages carry the small "(המשך)" line
      }
      cur.blockIdxs.push(i);
      rem -= tb.h;
    }
  }

  const renderPages = measuredPages ?? pages;
  // First portrait page that contains the contract title — attachments inserted right before it.
  const attachmentInsertIdx = (() => {
    const i = renderPages.findIndex((p: RPage) => p.blockIdxs.some((bi: number) => trailing[bi]?.kind === 'ctitle'));
    return i >= 0 ? i : renderPages.length;
  })();
  const totalPages = renderPages.length + attachmentPages.length;
  // Page number helper that accounts for the landscape pages sitting in the middle.
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
      {/* Header: title right, logo left */}
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
                {item.product_name}{item.notes ? <span className="text-neutral-400 font-normal"> ({item.notes})</span> : ''}
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
          {nonImgAtts.map((att) => (
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
    <div className="bg-neutral-100 min-h-screen">
      {/* Print controls */}
      <div className="print:hidden sticky top-0 z-50 bg-white border-b border-line-subtle px-6 py-3 flex items-center gap-3">
        <button onClick={() => window.print()} className="bg-primary text-white text-sm px-4 py-2 rounded-lg hover:bg-primary-700 transition-colors">
          <Icon name="print" size={16} /> הדפס
        </button>
        <button onClick={handleDownloadPdf} disabled={generatingPdf} className="bg-azure-100 text-azure-600 text-sm px-4 py-2 rounded-lg hover:bg-azure-100 transition-colors disabled:opacity-50">
          {generatingPdf ? <><Icon name="loading" size={16} /> מייצר...</> : <><Icon name="download" size={16} /> הורד PDF</>}
        </button>
        <button onClick={handleEmailWithLink} disabled={sendingLink} className="bg-neutral-100 text-content-body text-sm px-4 py-2 rounded-lg hover:bg-neutral-200 transition-colors disabled:opacity-50">
          {sendingLink ? <><Icon name="loading" size={16} /> מכין...</> : <><Icon name="email" size={16} /> שלח לינק להצעה במייל</>}
        </button>
        <a href={`https://wa.me/?text=${whatsappText}`} target="_blank" rel="noopener noreferrer" className="bg-success-soft text-success text-sm px-4 py-2 rounded-lg hover:bg-success-soft transition-colors">
          <Icon name="whatsapp" size={16} /> שלח בוואטסאפ
        </a>
        <button onClick={() => window.history.back()} className="text-sm text-content-muted px-3 py-2 hover:text-content-body mr-auto">
          ← חזרה
        </button>
        {quoteViews.length > 0 && (
          <div className="flex items-center gap-2 text-xs text-content-muted border-r border-line-subtle pr-3">
            <span className="font-semibold text-success"><Icon name="eye" size={14} /> {quoteViews.length} צפיות</span>
            <span>אחרונה: {new Date(quoteViews[0].viewed_at).toLocaleString('he-IL')}</span>
          </div>
        )}
      </div>

      {quoteViews.length > 0 && (
        <div className="print:hidden max-w-[210mm] mx-auto bg-success-soft border border-success rounded-lg mx-6 mt-4 p-4" dir="rtl">
          <h3 className="text-sm font-bold text-success mb-2"><Icon name="eye" size={14} /> היסטוריית צפיות ({quoteViews.length})</h3>
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {quoteViews.map((v: any) => (
              <div key={v.id} className="flex items-center gap-3 text-xs text-success">
                <span>{new Date(v.viewed_at).toLocaleString('he-IL')}</span>
                {v.ip_address && <span className="text-success">IP: {v.ip_address}</span>}
                {v.user_agent && <span className="text-success truncate max-w-[200px]">{v.user_agent.includes('Mobile') ? <><Icon name="mobile" size={12} /> נייד</> : <><Icon name="desktop" size={12} /> מחשב</>}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      <div id="quote-page-content">
        {/* Portrait pages — items + summary first, then the attachment pages,
            then the contract terms + signatures. The pagination above already
            inserted a hard break before the contract block to make room. */}
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

            {/* Drawing / spec pages slip in right before the first contract page. */}
            {pIdx + 1 === attachmentInsertIdx && attachmentPages.map((page, idx) => (
              <AttachmentPageBlock key={`${page.attId}-${page.pageNum}`} page={page} pageNum={attachmentInsertIdx + 1 + idx} quoteNumber={quote.quote_number} PageMeta={PageMeta} />
            ))}
          </React.Fragment>
        ))}

        {/* Tail case: contract section came out empty (no template + nothing in
            the fallback) so attachmentInsertIdx === renderPages.length — drop
            the attachments after the last portrait page instead. */}
        {attachmentInsertIdx === renderPages.length && attachmentPages.map((page, idx) => (
          <AttachmentPageBlock key={`tail-${page.attId}-${page.pageNum}`} page={page} pageNum={renderPages.length + 1 + idx} quoteNumber={quote.quote_number} PageMeta={PageMeta} />
        ))}
      </div>

      {/* Hidden mirror — measures real rendered heights for exact pagination (not printed/exported). */}
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
        }
      `}</style>
    </div>
  );
}

function AttachmentPageBlock({
  page,
  pageNum,
  quoteNumber,
  PageMeta,
}: {
  page: AttachmentPage;
  pageNum: number;
  quoteNumber: string;
  PageMeta: (props: { pageNum: number }) => JSX.Element;
}) {
  // Specs print portrait (210×297); drawings print landscape (297×210).
  // The PDF generator reads data-orient and rotates the page to match.
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
