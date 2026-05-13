'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { CONTRACT_SECTIONS } from '@/lib/contract-terms';

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
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) continue;
    await page.render({ canvasContext: ctx, viewport, canvas }).promise;
    pages.push({ attId, fileName, pageNum: i, totalPages: pdf.numPages, dataUrl: canvas.toDataURL('image/png') });
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

  useEffect(() => {
    async function load() {
      const [{ data: q }, { data: its }, { data: proj }, { data: atts }, { data: conts }] = await Promise.all([
        supabase.from('quotes').select('*').eq('id', quoteId).single(),
        supabase.from('quote_items').select('*').eq('quote_id', quoteId).order('sort_order'),
        supabase.from('projects').select('*').eq('id', projectId).single(),
        supabase.from('attachments').select('*').eq('entity_type', 'quote').eq('entity_id', quoteId),
        supabase.from('project_contacts').select('name, phone, email').eq('project_id', projectId).limit(1),
      ]);
      setQuote(q);
      setItems(its || []);
      setProject(proj);
      setAttachments(atts || []);
      if (conts?.[0]) setClientContact({ name: conts[0].name || '', phone: conts[0].phone || '', email: conts[0].email || '' });

      // Load views (safe — table may not exist yet)
      try {
        const { data: views } = await supabase.from('quote_views').select('*').eq('quote_id', quoteId).order('viewed_at', { ascending: false });
        setQuoteViews(views || []);
      } catch {}

      // Download image + PDF attachments and convert to A4 pages
      if (atts && atts.length > 0) {
        const renderableAtts = atts.filter((a: any) => /\.(png|jpg|jpeg|gif|bmp|webp|pdf)$/i.test(a.file_name));
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

  const totalPages = 2 + attachmentPages.length; // main + drawing pages + contract terms

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
        {/* A4 page */}
        <div className="max-w-[210mm] mx-auto bg-white shadow-lg my-6 print:my-0 print:shadow-none flex flex-col" style={{ minHeight: '297mm' }}>
          <div className="px-10 pt-8 pb-6 flex-1" dir="rtl">

            {/* Header: title right, logo left */}
            <div className="flex justify-between items-start mb-5">
              <div>
                <h1 className="text-4xl font-bold text-gray-900 tracking-wide">סקר חוזה</h1>
                <p className="text-sm text-gray-500 mt-2">
                  <span className="font-semibold">מס׳ הצעה:</span> {quote.quote_number}
                  {quoteDate && <>&nbsp;|&nbsp;<span className="font-semibold">תאריך:</span> {quoteDate}</>}
                </p>
                {validUntil && <p className="text-xs text-gray-400 mt-1">תוקף עד: {validUntil}</p>}
              </div>
              <img src="/logo.png" alt="Fibertech" className="h-16 object-contain" />
            </div>

            {/* Separator — gray matching logo circle */}
            <div className="border-b-2 border-[#5c5c5c] mb-6" />

            {/* Client + Project info */}
            <div className="grid grid-cols-2 gap-10 mb-8">
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
                    ? <p className="text-sm text-gray-600 mt-1 text-right" style={{ unicodeBidi: 'plaintext' }}>{clientContact.phone}</p>
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

            {/* Items table */}
            <table className="w-full text-sm border-collapse mb-4">
              <thead>
                <tr className="bg-[#003d77]">
                  <th className="text-center py-2.5 px-2 font-semibold text-white border border-[#003d77] w-8">#</th>
                  <th className="text-right py-2.5 px-3 font-semibold text-white border border-[#003d77]">תיאור פריט</th>
                  <th className="text-right py-2.5 px-3 font-semibold text-white border border-[#003d77]">קוטר</th>
                  <th className="text-center py-2.5 px-3 font-semibold text-white border border-[#003d77]">כמות</th>
                  <th className="text-right py-2.5 px-3 font-semibold text-white border border-[#003d77]">יחידה</th>
                  <th className="text-right py-2.5 px-3 font-semibold text-white border border-[#003d77]">מחיר ליחידה</th>
                  {hasAnyDiscount && <th className="text-center py-2.5 px-3 font-semibold text-white border border-[#003d77]">הנחה</th>}
                  <th className="text-right py-2.5 px-3 font-semibold text-white border border-[#003d77]">סה״כ</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, idx) => {
                  const disc = parseFloat(item.discount_pct) || 0;
                  return (
                    <tr key={item.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/60'}>
                      <td className="py-2 px-2 border border-gray-200 text-gray-400 text-center">{idx + 1}</td>
                      <td className="py-2 px-3 border border-gray-200 text-gray-800 font-medium">
                        {item.product_name}{item.notes ? <span className="text-gray-400 font-normal"> ({item.notes})</span> : ''}
                      </td>
                      <td className="py-2 px-3 border border-gray-200 text-gray-500">{item.dn_size || '—'}</td>
                      <td className="py-2 px-3 border border-gray-200 text-gray-700 text-center">{item.quantity}</td>
                      <td className="py-2 px-3 border border-gray-200 text-gray-600">{item.unit}</td>
                      <td className="py-2 px-3 border border-gray-200 text-gray-700">{formatCurrency(parseFloat(item.unit_price) || 0)}</td>
                      {hasAnyDiscount && (
                        <td className="py-2 px-3 border border-gray-200 text-center text-gray-600">
                          {disc > 0 ? `${disc}%` : '0%'}
                        </td>
                      )}
                      <td className="py-2 px-3 border border-gray-200 font-semibold text-gray-800">{formatCurrency(parseFloat(item.total_price) || 0)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Totals box — right aligned */}
            <div className="flex justify-end mb-8">
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

            {/* Payment terms + Delivery — side by side */}
            {(quote.payment_terms || quote.delivery_time) && (
              <div className="grid grid-cols-2 gap-8 mb-6">
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
            )}

            {/* Terms */}
            {quote.disclaimer_text && (
              <div className="mb-4">
                <h3 className="text-sm font-bold text-gray-800 mb-2 border-r-4 border-[#003d77] pr-3">תנאי התקשרות</h3>
                <p className="text-xs text-gray-600 whitespace-pre-line leading-relaxed">{quote.disclaimer_text}</p>
              </div>
            )}

            {/* All-documents disclaimer */}
            <div className="mb-8 bg-gray-50 border border-gray-200 rounded px-4 py-3">
              <p className="text-xs text-gray-700 leading-relaxed">
                <span className="font-bold">הצהרת מסמכים: </span>
                הסכם זה כולל את כל המסמכים שצורפו להצעה זו — סקר חוזה, שרטוטים ומפרטים טכניים, ותנאי הסכם — כולם מהווים יחד מסמך מחייב אחד ובלתי נפרד.
              </p>
            </div>

            {/* Non-image attachments */}
            {attachments.filter((a) => !/\.(png|jpg|jpeg|gif|bmp|webp)$/i.test(a.file_name)).length > 0 && (
              <div className="mb-6">
                <h3 className="text-sm font-bold text-gray-800 mb-2 border-r-4 border-[#003d77] pr-3">מפרטים טכניים ושרטוטים</h3>
                <div className="space-y-1">
                  {attachments.filter((a) => !/\.(png|jpg|jpeg|gif|bmp|webp)$/i.test(a.file_name)).map((att) => (
                    <div key={att.id} className="flex items-center gap-2 text-xs text-gray-600">
                      <span>📄</span>
                      <span>{att.file_name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Signatures */}
            <div className="mt-10 pt-4 grid grid-cols-2 gap-8">
              <div>
                <p className="text-sm font-bold text-gray-700 mb-10">חתימת פיברטק</p>
                <div className="border-b border-gray-400 w-44" />
              </div>
              <div>
                <p className="text-sm font-bold text-gray-700 mb-10">חתימת הלקוח</p>
                <div className="border-b border-gray-400 w-44" />
              </div>
            </div>

          </div>

          {/* Footer — gray background matching logo circle */}
          <div className="mt-auto bg-[#f0f0f0] px-10 py-4 text-center" dir="rtl">
            <p className="text-[11px] font-bold text-[#5c5c5c]">פיברטק תשתיות צנרת וכימיקלים בע״מ</p>
            <p className="text-[9px] text-gray-500 mt-0.5">מפעל פיברטק: אזור תעשיה קרני שומרון, ת.ד 44855 | טל׳: 09-7929441 | nitzan@fibertech.co.il</p>
            <p className="text-[9px] text-gray-500">קבוצת מאיה אופקים: אלי הורוביץ 27, רחובות 7608803 | טל׳: 073-2290900 | shula@maya-group.co.il</p>
            <p className="text-[9px] font-semibold text-[#5c5c5c] mt-0.5">www.fibertech.co.il</p>
            <PageMeta pageNum={1} />
          </div>
        </div>

        {/* Separate A4 pages for image / PDF attachments */}
        {attachmentPages.map((page, idx) => (
          <div key={`${page.attId}-${page.pageNum}`} className="max-w-[210mm] mx-auto bg-white shadow-lg my-6 print:my-0 print:shadow-none flex flex-col" style={{ minHeight: '297mm', pageBreakBefore: 'always' }}>
            <div className="flex-1 flex flex-col items-center justify-center p-8">
              <p className="text-sm text-gray-500 mb-4 self-end" dir="rtl">
                {page.fileName}{page.totalPages > 1 ? ` (עמוד ${page.pageNum} מתוך ${page.totalPages})` : ''}
              </p>
              <img src={page.dataUrl} alt={page.fileName} className="max-w-full max-h-[240mm] object-contain" />
            </div>
            <div className="bg-[#f0f0f0] px-10 py-3" dir="rtl">
              <PageMeta pageNum={2 + idx} />
            </div>
          </div>
        ))}

        {/* Contract Terms — A4 pages */}
        <div className="max-w-[210mm] mx-auto bg-white shadow-lg my-6 print:my-0 print:shadow-none flex flex-col" style={{ minHeight: '297mm', pageBreakBefore: 'always' }} dir="rtl">
          <div className="px-10 pt-8 pb-6 flex-1">
            {/* Terms header */}
            <div className="flex justify-between items-start mb-5">
              <div>
                <h1 className="text-3xl font-bold text-gray-900 tracking-wide">תנאי הסכם</h1>
                <p className="text-sm text-gray-500 mt-1">מסמך זה מהווה חלק בלתי נפרד מסקר החוזה</p>
              </div>
              <img src="/logo.png" alt="Fibertech" className="h-14 object-contain" />
            </div>
            <div className="border-b-2 border-[#5c5c5c] mb-6" />

            {/* Sections */}
            {CONTRACT_SECTIONS.map((section) => (
              <div key={section.title} className="mb-6">
                <div className="border-r-4 border-[#003d77] pr-4 mb-3">
                  <h3 className="text-sm font-bold text-[#003d77]">{section.title}</h3>
                </div>
                <div className="space-y-2">
                  {section.clauses.map((clause) => (
                    <div key={clause.num} className="flex gap-3 text-xs text-gray-700 leading-relaxed">
                      <span className="font-bold text-[#003d77] min-w-[24px] text-left">{clause.num}.</span>
                      <span>{clause.text}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div className="mt-auto bg-[#f0f0f0] px-10 py-4 text-center">
            <p className="text-[11px] font-bold text-[#5c5c5c]">פיברטק תשתיות צנרת וכימיקלים בע״מ</p>
            <p className="text-[9px] text-gray-500 mt-0.5">מפעל פיברטק: אזור תעשיה קרני שומרון, ת.ד 44855 | טל׳: 09-7929441 | nitzan@fibertech.co.il</p>
            <p className="text-[9px] font-semibold text-[#5c5c5c] mt-0.5">www.fibertech.co.il</p>
            <PageMeta pageNum={totalPages} />
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
