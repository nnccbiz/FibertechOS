'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { parsePipeSpec } from '@/lib/pricing';
import { CONTRACT_SECTIONS } from '@/lib/contract-terms';

function fmtSn(sn: string) {
  if (!sn) return '';
  const n = parseInt(sn, 10);
  return isNaN(n) ? sn : n.toLocaleString('en-US');
}

function formatCurrency(v: number) {
  return new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(v);
}

export default function PublicQuotePage() {
  const params = useParams();
  const token = params.token as string;
  const supabase = createClient();

  const [quote, setQuote] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [project, setProject] = useState<any>(null);
  const [attachments, setAttachments] = useState<any[]>([]);
  const [imageDataUrls, setImageDataUrls] = useState<Record<string, string>>({});
  const [expired, setExpired] = useState(false);
  const [loading, setLoading] = useState(true);
  const [generatingPdf, setGeneratingPdf] = useState(false);

  useEffect(() => {
    async function load() {
      // Look up the share token
      const { data: shareToken, error: tokenErr } = await supabase
        .from('quote_share_tokens')
        .select('*')
        .eq('token', token)
        .single();

      if (tokenErr || !shareToken) {
        setExpired(true);
        setLoading(false);
        return;
      }

      if (new Date(shareToken.expires_at) < new Date()) {
        setExpired(true);
        setLoading(false);
        return;
      }

      // Record the view
      await supabase.from('quote_views').insert({
        token_id: shareToken.id,
        quote_id: shareToken.quote_id,
        ip_address: null, // filled by edge function or server if needed
        user_agent: navigator.userAgent,
      });

      // Fetch quote data
      const [{ data: q }, { data: its }, { data: atts }] = await Promise.all([
        supabase.from('quotes').select('*').eq('id', shareToken.quote_id).single(),
        supabase.from('quote_items').select('*').eq('quote_id', shareToken.quote_id).order('sort_order'),
        supabase.from('attachments').select('*').eq('entity_type', 'quote').eq('entity_id', shareToken.quote_id),
      ]);

      if (!q) {
        setExpired(true);
        setLoading(false);
        return;
      }

      // Fetch project
      const { data: proj } = await supabase.from('projects').select('*').eq('id', q.project_id).single();

      setQuote(q);
      setItems(its || []);
      setProject(proj);
      setAttachments(atts || []);

      // Download image attachments
      if (atts && atts.length > 0) {
        const imageAtts = atts.filter((a: any) => /\.(png|jpg|jpeg|gif|bmp|webp)$/i.test(a.file_name));
        const urls: Record<string, string> = {};
        await Promise.all(
          imageAtts.map(async (att: any) => {
            try {
              let storagePath = att.file_url;
              if (storagePath.startsWith('http')) {
                const match = storagePath.match(/project-files\/(.+)$/);
                if (match) storagePath = match[1];
              }
              const { data } = await supabase.storage.from('project-files').download(storagePath);
              if (data) {
                const url = await new Promise<string>((resolve) => {
                  const reader = new FileReader();
                  reader.onloadend = () => resolve(reader.result as string);
                  reader.readAsDataURL(data);
                });
                urls[att.id] = url;
              }
            } catch {}
          })
        );
        setImageDataUrls(urls);
      }

      setLoading(false);
    }
    load();
  }, [token]);

  async function handleDownloadPdf() {
    setGeneratingPdf(true);
    try {
      const html2canvas = (await import('html2canvas')).default;
      const { jsPDF } = await import('jspdf');
      const wrapper = document.getElementById('quote-page-content');
      if (!wrapper) return;
      const pages = wrapper.children;
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      let firstPage = true;
      for (let i = 0; i < pages.length; i++) {
        const el = pages[i] as HTMLElement;
        if (!el || el.offsetHeight === 0) continue;
        const canvas = await html2canvas(el, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
        const imgData = canvas.toDataURL('image/png');
        const imgH = (canvas.height * pageW) / canvas.width;
        let y = 0;
        while (y < imgH) {
          if (!firstPage) pdf.addPage();
          firstPage = false;
          pdf.addImage(imgData, 'PNG', 0, -y, pageW, imgH);
          y += pageH;
        }
      }
      const arrayBuf = pdf.output('arraybuffer');
      const blob = new Blob([new Uint8Array(arrayBuf)], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `הצעת-מחיר-${quote.quote_number}.pdf`;
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

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-neutral-50">
        <div className="text-center">
          <div className="animate-spin h-8 w-8 border-4 border-navy-700 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-content-muted">טוען הצעת מחיר...</p>
        </div>
      </div>
    );
  }

  if (expired || !quote) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-neutral-50" dir="rtl">
        <div className="bg-white rounded-2xl shadow-lg p-12 text-center max-w-md">
          <div className="text-5xl mb-4">⏰</div>
          <h1 className="text-xl font-bold text-content-strong mb-2">קישור להצעת מחיר פג תוקף</h1>
          <p className="text-content-muted">הקישור אינו זמין יותר. לקבלת הצעה מעודכנת, אנא פנו לפיברטק.</p>
          <div className="mt-6 pt-6 border-t border-line-subtle">
            <p className="text-sm text-neutral-400">פיברטק תעשיות צנרת וכימיקלים בע״מ</p>
            <p className="text-sm text-neutral-400">09-7929441 | info@fibertech.co.il</p>
          </div>
        </div>
      </div>
    );
  }

  const globalDisc = parseFloat(quote.global_discount_pct) || 0;
  const totalAfterLineDisc = items.reduce((s, i) => s + (parseFloat(i.total_price) || 0), 0);
  const finalTotal = globalDisc > 0 ? Math.round(totalAfterLineDisc * (1 - globalDisc / 100) * 100) / 100 : totalAfterLineDisc;
  // Same rule as the internal preview: draft = today, sent/signed = frozen sent_at
  // (fall back to updated_at for quotes issued before sent_at existed).
  const quoteDateSource = quote.status === 'draft'
    ? new Date()
    : new Date(quote.sent_at || quote.updated_at || Date.now());
  const quoteDate = quoteDateSource.toLocaleDateString('he-IL');
  const validUntil = quote.valid_until ? new Date(quote.valid_until).toLocaleDateString('he-IL') : '';
  // The per-line discount column appears only when a line actually carries its
  // own discount. A quote-wide (global) discount is shown in the totals rows.
  const hasLineDiscount = items.some((i: any) => (parseFloat(i.discount_pct) || 0) > 0);
  const colCount = hasLineDiscount ? 10 : 9;
  // Resolve the contract terms the same way the internal preview does: the
  // per-quote snapshot (contract_overrides, frozen on issue) wins, otherwise the
  // hard-coded library fallback — so the customer-facing terms match the signed PDF.
  const contractSections: { title: string; clauses: { num: number; text: string }[] }[] =
    (Array.isArray(quote.contract_overrides) && quote.contract_overrides.length > 0)
      ? quote.contract_overrides
      : CONTRACT_SECTIONS;

  return (
    <div className="bg-neutral-100 min-h-screen">
      {/* Top bar */}
      <div className="print:hidden sticky top-0 z-50 bg-white border-b border-line-subtle px-6 py-3 flex items-center gap-3 justify-center">
        <button onClick={() => window.print()} className="bg-primary text-white text-sm px-4 py-2 rounded-lg hover:bg-primary-700 transition-colors">
          🖨️ הדפס
        </button>
        <button
          onClick={handleDownloadPdf}
          disabled={generatingPdf}
          className="bg-azure-100 text-azure-600 text-sm px-4 py-2 rounded-lg hover:bg-azure-100 transition-colors disabled:opacity-50"
        >
          {generatingPdf ? '⏳ מייצר...' : '⬇️ הורד PDF'}
        </button>
      </div>

      {/* All pages wrapper for PDF capture */}
      <div id="quote-page-content">
      {/* A4 page */}
      <div className="max-w-[210mm] mx-auto bg-white shadow-lg my-6 print:my-0 print:shadow-none flex flex-col" style={{ minHeight: '297mm' }}>
        <div className="px-12 py-10 print:px-10 print:py-8" dir="rtl">

          {/* Header */}
          <div className="flex justify-between items-start mb-8 border-b-2 border-navy-700 pb-6">
            <div className="flex items-center gap-4">
              <img src="/logo.png" alt="Fibertech" className="h-14 object-contain" />
              <div>
                <h1 className="text-xl font-bold text-navy-700">פיברטק תעשיות צנרת וכימיקלים בע״מ</h1>
                <p className="text-xs text-neutral-400 mt-1">ח.פ 510931389 | מקבוצת מאיה אופקים</p>
              </div>
            </div>
            <div className="text-left">
              <p className="text-lg font-bold text-success">הצעת מחיר</p>
              <p className="text-sm text-content-muted font-mono">{quote.quote_number}</p>
              <p className="text-xs text-neutral-400 mt-1">תאריך: {quoteDate}</p>
              {validUntil && <p className="text-xs text-neutral-400">תוקף עד: {validUntil}</p>}
            </div>
          </div>

          {/* Client + Project info */}
          <div className="grid grid-cols-2 gap-8 mb-8">
            <div>
              <h3 className="text-sm font-bold text-content-body mb-2">לכבוד</h3>
              <p className="text-base font-bold text-content-strong">{quote.client_name}</p>
              {project?.client_name && project.client_name !== quote.client_name && (
                <p className="text-sm text-content-muted">{project.client_name}</p>
              )}
            </div>
            <div>
              <h3 className="text-sm font-bold text-content-body mb-2">פרויקט</h3>
              <p className="text-base font-bold text-content-strong">{project?.name || '—'}</p>
              {project?.location && <p className="text-sm text-content-muted">📍 {project.location}</p>}
            </div>
          </div>

          {/* Items table */}
          <table className="w-full text-sm border-collapse mb-6">
            <thead>
              <tr className="bg-neutral-50">
                <th className="text-right py-2.5 px-3 font-semibold text-content-body border border-line-subtle">#</th>
                <th className="text-right py-2.5 px-3 font-semibold text-content-body border border-line-subtle">תיאור פריט</th>
                <th className="text-right py-2.5 px-3 font-semibold text-content-body border border-line-subtle">קוטר</th>
                <th className="text-right py-2.5 px-3 font-semibold text-content-body border border-line-subtle">לחץ (PN)</th>
                <th className="text-right py-2.5 px-3 font-semibold text-content-body border border-line-subtle">קשיחות (SN)</th>
                <th className="text-right py-2.5 px-3 font-semibold text-content-body border border-line-subtle">כמות</th>
                <th className="text-right py-2.5 px-3 font-semibold text-content-body border border-line-subtle">יחידה</th>
                <th className="text-right py-2.5 px-3 font-semibold text-content-body border border-line-subtle">מחיר ליחידה</th>
                {hasLineDiscount && <th className="text-right py-2.5 px-3 font-semibold text-warning border border-line-subtle">הנחה</th>}
                <th className="text-right py-2.5 px-3 font-semibold text-content-body border border-line-subtle">סה״כ</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => {
                const disc = parseFloat(item.discount_pct) || 0;
                return (
                  <tr key={item.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-neutral-50'}>
                    <td className="py-2 px-3 border border-line-subtle text-neutral-400 text-center">{idx + 1}</td>
                    <td className="py-2 px-3 border border-line-subtle text-content-strong text-right" dir="rtl">{item.product_name}{item.notes ? ` (${item.notes})` : ''}</td>
                    <td className="py-2 px-3 border border-line-subtle text-content-body">{item.dn_size || '—'}</td>
                    <td className="py-2 px-3 border border-line-subtle text-content-body">{parsePipeSpec(item.product_name, { pn: item.pn, sn: item.sn }).pn || '—'}</td>
                    <td className="py-2 px-3 border border-line-subtle text-content-body">{fmtSn(parsePipeSpec(item.product_name, { pn: item.pn, sn: item.sn }).sn) || '—'}</td>
                    <td className="py-2 px-3 border border-line-subtle text-content-body">{item.quantity}</td>
                    <td className="py-2 px-3 border border-line-subtle text-content-body">{item.unit}</td>
                    <td className="py-2 px-3 border border-line-subtle text-content-body">{formatCurrency(parseFloat(item.unit_price) || 0)}</td>
                    {hasLineDiscount && <td className="py-2 px-3 border border-line-subtle text-warning">{disc > 0 ? `${disc}%` : '—'}</td>}
                    <td className="py-2 px-3 border border-line-subtle font-semibold text-content-strong">{formatCurrency(parseFloat(item.total_price) || 0)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              {globalDisc > 0 && (
                <>
                  <tr className="bg-neutral-50">
                    <td colSpan={colCount - 1} className="py-2 px-3 text-left text-sm text-content-muted border border-line-subtle">סה״כ לפני הנחה</td>
                    <td className="py-2 px-3 text-sm text-content-muted border border-line-subtle">{formatCurrency(totalAfterLineDisc)}</td>
                  </tr>
                  <tr>
                    <td colSpan={colCount - 1} className="py-2 px-3 text-left text-sm text-warning border border-line-subtle">הנחה {globalDisc}%</td>
                    <td className="py-2 px-3 text-sm text-warning border border-line-subtle">-{formatCurrency(totalAfterLineDisc - finalTotal)}</td>
                  </tr>
                </>
              )}
              <tr className="bg-success-soft">
                <td colSpan={colCount - 1} className="py-3 px-3 text-left font-bold text-lg text-content-strong border border-line-subtle">סה״כ</td>
                <td className="py-3 px-3 font-bold text-lg text-success border border-line-subtle">{formatCurrency(finalTotal)}</td>
              </tr>
            </tfoot>
          </table>

          {/* Payment terms */}
          {quote.payment_terms && (
            <div className="mb-6">
              <h3 className="text-sm font-bold text-content-body mb-1">תנאי תשלום</h3>
              <p className="text-sm text-content-body whitespace-pre-line">{quote.payment_terms}</p>
            </div>
          )}

          {/* Delivery time */}
          {quote.delivery_time && (
            <div className="mb-6">
              <h3 className="text-sm font-bold text-content-body mb-1">זמן אספקה</h3>
              <p className="text-sm text-content-body">{quote.delivery_time}</p>
            </div>
          )}

          {/* Terms */}
          {quote.disclaimer_text && (
            <div className="mb-6 p-4 bg-neutral-50 rounded-lg border border-line-subtle">
              <h3 className="text-sm font-bold text-content-body mb-2">תנאי התקשרות</h3>
              <p className="text-xs text-content-body whitespace-pre-line leading-relaxed">{quote.disclaimer_text}</p>
            </div>
          )}

          {/* Full contract terms — resolved from the quote snapshot / fallback */}
          {contractSections.length > 0 && (
            <div className="mb-6">
              <h3 className="text-sm font-bold text-content-body mb-3">תנאי הסכם</h3>
              <div className="space-y-3">
                {contractSections.map((section, si) => (
                  <div key={si}>
                    <h4 className="text-xs font-bold text-content-body mb-1">{section.title}</h4>
                    <ol className="space-y-1">
                      {section.clauses.map((cl) => (
                        <li key={cl.num} className="text-[11px] text-content-body leading-relaxed flex gap-1.5">
                          <span className="font-semibold text-content-muted shrink-0">{cl.num}.</span>
                          <span className="whitespace-pre-line">{cl.text}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Notes */}
          {quote.notes && (
            <div className="mb-6">
              <h3 className="text-sm font-bold text-content-body mb-1">הערות</h3>
              <p className="text-sm text-content-body whitespace-pre-line">{quote.notes}</p>
            </div>
          )}

          {/* Non-image attachments listed */}
          {attachments.filter((a) => !/\.(png|jpg|jpeg|gif|bmp|webp)$/i.test(a.file_name)).length > 0 && (
            <div className="mb-6">
              <h3 className="text-sm font-bold text-content-body mb-2">מפרטים טכניים ושרטוטים</h3>
              <div className="space-y-1">
                {attachments.filter((a) => !/\.(png|jpg|jpeg|gif|bmp|webp)$/i.test(a.file_name)).map((att) => (
                  <div key={att.id} className="flex items-center gap-2 text-sm">
                    <span className="text-neutral-400">📄</span>
                    <span className="text-content-body">{att.file_name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Signature */}
          <div className="mt-12 pt-6 border-t border-line-subtle">
            <div className="grid grid-cols-2 gap-8">
              <div>
                <p className="text-sm font-bold text-content-body mb-8">חתימת פיברטק</p>
                <div className="border-b border-line-strong w-48"></div>
              </div>
              <div>
                <p className="text-sm font-bold text-content-body mb-8">חתימת הלקוח</p>
                <div className="border-b border-line-strong w-48"></div>
              </div>
            </div>
          </div>

        </div>

        {/* Company footer */}
        <div className="mt-auto border-t border-navy-700 px-12 py-3 text-center text-[9px] text-neutral-400 leading-relaxed">
          <p className="font-semibold text-navy-700 text-[10px]">פיברטק תעשיות צנרת וכימיקלים מקבוצת מאיה אופקים</p>
          <p>מפעל פיברטק: אזור תעשיה קרני שומרון, ת.ד 206 44855 | טל׳: 09-7929441 | info@fibertech.co.il</p>
          <p>קבוצת מאיה אופקים: אלי הורוביץ 27, רחובות 7608803 | טל׳: 073-2290900 | shula@maya-group.co.il</p>
          <p className="font-semibold text-navy-700">www.fibertech.co.il</p>
        </div>
      </div>

      {/* Separate A4 pages for each image attachment */}
      {attachments
        .filter((a) => /\.(png|jpg|jpeg|gif|bmp|webp)$/i.test(a.file_name) && imageDataUrls[a.id])
        .map((att) => (
          <div key={att.id} className="max-w-[210mm] mx-auto bg-white shadow-lg my-6 print:my-0 print:shadow-none flex flex-col items-center justify-center p-8" style={{ minHeight: '297mm', pageBreakBefore: 'always' }}>
            <p className="text-sm text-content-muted mb-4 self-end" dir="rtl">{att.file_name}</p>
            <img src={imageDataUrls[att.id]} alt={att.file_name} className="max-w-full max-h-[260mm] object-contain" />
          </div>
        ))}
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
