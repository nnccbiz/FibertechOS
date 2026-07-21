'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { CONTRACT_SECTIONS } from '@/lib/contract-terms';
import Icon from '@/components/ui/Icon';
import QuoteDocument, { type QuoteAttachmentPage, type QuoteDocumentHandle } from '@/components/quote/QuoteDocument';

function formatCurrency(v: number) {
  return new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(v);
}

async function renderPdfToPages(attId: string, fileName: string, fileType: string | null, drawingNumber: string | null, blob: Blob): Promise<QuoteAttachmentPage[]> {
  const pdfjsLib: any = await import('pdfjs-dist');
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
  const arrayBuffer = await blob.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const pages: QuoteAttachmentPage[] = [];
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
  const docRef = useRef<QuoteDocumentHandle>(null);

  const [quote, setQuote] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [project, setProject] = useState<any>(null);
  const [attachments, setAttachments] = useState<any[]>([]);
  const [contractSections, setContractSections] = useState<{ title: string; clauses: { num: number; text: string }[] }[]>(CONTRACT_SECTIONS);
  const [clientContact, setClientContact] = useState<{ name: string; phone: string; email: string } | null>(null);
  const [attachmentPages, setAttachmentPages] = useState<QuoteAttachmentPage[]>([]);
  const [quoteViews, setQuoteViews] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [sendingLink, setSendingLink] = useState(false);
  const [sendingWa, setSendingWa] = useState(false);
  const [costCurrency, setCostCurrency] = useState<string | null>(null);
  const [customerTaxId, setCustomerTaxId] = useState<string | null>(null);

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

      // Customer ח.פ. — prefer the frozen snapshot on an issued quote, else read
      // it live from the linked customer (authenticated read).
      try {
        const snapTax = q?.contact_snapshot?.tax_id;
        if (snapTax) {
          setCustomerTaxId(snapTax);
        } else {
          const custId = q?.customer_id || proj?.customer_id;
          if (custId) {
            const { data: cl } = await supabase.from('clients').select('tax_id').eq('id', custId).single();
            if (cl?.tax_id) setCustomerTaxId(cl.tax_id);
          }
        }
      } catch {}

      try {
        if (q?.contract_overrides && Array.isArray(q.contract_overrides) && q.contract_overrides.length > 0) {
          setContractSections(q.contract_overrides);
        } else if (q?.contract_template_id) {
          const { data: tpl } = await supabase.from('contract_term_templates').select('content').eq('id', q.contract_template_id).single();
          if (tpl?.content && Array.isArray(tpl.content) && tpl.content.length > 0) setContractSections(tpl.content);
        }
      } catch (e) { console.error('[contract terms] resolve failed', e); }

      try {
        if (q?.cost_input_id) {
          const { data: ci } = await supabase.from('cost_inputs').select('currency').eq('id', q.cost_input_id).single();
          let eff = ci?.currency || null;
          if (!eff || eff === 'ILS') {
            const { data: citems } = await supabase.from('cost_input_items').select('original_currency, original_price').eq('cost_input_id', q.cost_input_id);
            const forex = (citems || []).find((i: any) => i.original_currency && i.original_currency !== 'ILS' && parseFloat(i.original_price) > 0);
            if (forex) eff = forex.original_currency;
          }
          if (eff) setCostCurrency(eff);
        }
      } catch {}

      let linkedDrawings: any[] = [];
      const drawingIds = (qd || []).map((r: any) => r.attachment_id);
      if (drawingIds.length > 0) {
        const { data: dAtts } = await supabase.from('attachments').select('*').in('id', drawingIds);
        linkedDrawings = dAtts || [];
      }
      const allAtts = [...(atts || []), ...linkedDrawings];
      setAttachments(allAtts);

      if (q?.contact_snapshot) {
        const s = q.contact_snapshot;
        setClientContact({ name: s.name || '', phone: s.phone || '', email: s.email || '' });
      } else {
        const chosen = (q?.contact_id && conts?.find((c: any) => c.id === q.contact_id)) || conts?.[0];
        if (chosen) setClientContact({ name: chosen.name || '', phone: chosen.phone || '', email: chosen.email || '' });
      }

      try {
        const { data: views } = await supabase.from('quote_views').select('*').eq('quote_id', quoteId).order('viewed_at', { ascending: false });
        setQuoteViews(views || []);
      } catch {}

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
              if (error || !data) { console.error('Download error for', att.file_name, error?.message); return []; }
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

  const emailSubjectRaw = `${quote.client_name || ''} | ${project.name || ''} | הצעת מחיר ${quote.quote_number} — פיברטק`;
  const emailBodyRaw = `שלום,\n\nמצורפת הצעת מחיר מספר ${quote.quote_number} עבור פרויקט ${project.name || ''}.\n\nבברכה,\nפיברטק תעשיות צנרת וכימיקלים בע״מ`;

  // Generate a PUBLIC share link (/quote/<token>) so the customer sees the quote
  // directly — the internal /projects/... URL would send them to the login page.
  async function createShareLink(): Promise<string> {
    const res = await fetch('/api/quote-share', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quote_id: quoteId, expires_days: 30 }),
    });
    const shareData = await res.json();
    return shareData.token ? `${window.location.origin}/quote/${shareData.token}` : '';
  }

  async function handleEmailWithLink() {
    setSendingLink(true);
    try {
      const shareLink = await createShareLink();
      const bodyWithLink = emailBodyRaw + (shareLink ? `\n\nלצפייה בהצעת המחיר:\n${shareLink}` : '');
      const mailto = `mailto:?subject=${encodeURIComponent(emailSubjectRaw)}&body=${encodeURIComponent(bodyWithLink)}`;
      window.open(mailto, '_self');
    } catch {
      alert('שגיאה ביצירת הקישור');
    } finally {
      setSendingLink(false);
    }
  }

  async function handleWhatsapp() {
    setSendingWa(true);
    // Open the tab synchronously (before the await) so Safari/mobile don't block
    // it as a non-user-initiated popup after the fetch resolves.
    const w = window.open('', '_blank');
    try {
      const shareLink = await createShareLink();
      const text = `שלום, מצורפת הצעת מחיר מספר ${quote.quote_number} עבור פרויקט ${project.name || ''}.\nסה״כ: ${formatCurrency(finalTotal)}${shareLink ? `\nלצפייה: ${shareLink}` : ''}`;
      const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
      if (w) w.location.href = url; else window.location.href = url;
    } catch {
      if (w) w.close();
      alert('שגיאה ביצירת הקישור');
    } finally {
      setSendingWa(false);
    }
  }

  async function handleDownloadPdf() {
    setGeneratingPdf(true);
    try {
      const safe = (s: string) => (s || '').trim().replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, '-');
      const parts = [safe(quote.client_name), safe(project.name), safe(quote.quote_number)].filter(Boolean);
      await docRef.current?.downloadPdf(parts.join('_'));
    } catch {
      alert('שגיאה ביצירת PDF');
    } finally {
      setGeneratingPdf(false);
    }
  }

  return (
    <div className="bg-neutral-100 min-h-screen">
      {/* Print controls */}
      <div className="print:hidden sticky top-0 z-50 bg-white border-b border-line-subtle px-6 py-3 flex items-center gap-3 flex-wrap">
        <button onClick={() => window.print()} className="bg-primary text-white text-sm px-4 py-2 rounded-lg hover:bg-primary-700 transition-colors">
          <Icon name="print" size={16} /> הדפס
        </button>
        <button onClick={handleDownloadPdf} disabled={generatingPdf} className="bg-azure-100 text-azure-600 text-sm px-4 py-2 rounded-lg hover:bg-azure-100 transition-colors disabled:opacity-50">
          {generatingPdf ? <><Icon name="loading" size={16} /> מייצר...</> : <><Icon name="download" size={16} /> הורד PDF</>}
        </button>
        <button onClick={handleEmailWithLink} disabled={sendingLink} className="bg-neutral-100 text-content-body text-sm px-4 py-2 rounded-lg hover:bg-neutral-200 transition-colors disabled:opacity-50">
          {sendingLink ? <><Icon name="loading" size={16} /> מכין...</> : <><Icon name="email" size={16} /> שלח לינק להצעה במייל</>}
        </button>
        <button onClick={handleWhatsapp} disabled={sendingWa} className="bg-success-soft text-success text-sm px-4 py-2 rounded-lg hover:bg-success-soft transition-colors disabled:opacity-50">
          {sendingWa ? <><Icon name="loading" size={16} /> מכין...</> : <><Icon name="whatsapp" size={16} /> שלח בוואטסאפ</>}
        </button>
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

      <QuoteDocument
        ref={docRef}
        quote={quote}
        items={items}
        project={project}
        clientContact={clientContact}
        contractSections={contractSections}
        costCurrency={costCurrency}
        customerTaxId={customerTaxId}
        attachmentPages={attachmentPages}
        attachments={attachments}
      />
    </div>
  );
}
