'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { CONTRACT_SECTIONS } from '@/lib/contract-terms';
import Icon from '@/components/ui/Icon';
import QuoteDocument, { type QuoteAttachmentPage, type QuoteDocumentHandle } from '@/components/quote/QuoteDocument';

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

export default function PublicQuotePage() {
  const params = useParams();
  const token = params.token as string;
  const supabase = createClient();
  const docRef = useRef<QuoteDocumentHandle>(null);

  const [quote, setQuote] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [project, setProject] = useState<any>(null);
  const [attachments, setAttachments] = useState<any[]>([]);
  const [attachmentPages, setAttachmentPages] = useState<QuoteAttachmentPage[]>([]);
  const [contractSections, setContractSections] = useState<{ title: string; clauses: { num: number; text: string }[] }[]>(CONTRACT_SECTIONS);
  const [clientContact, setClientContact] = useState<{ name: string; phone: string; email: string } | null>(null);
  const [costCurrency, setCostCurrency] = useState<string | null>(null);
  const [customerTaxId, setCustomerTaxId] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  const [loading, setLoading] = useState(true);
  const [generatingPdf, setGeneratingPdf] = useState(false);

  useEffect(() => {
    async function load() {
      const { data: shareToken, error: tokenErr } = await supabase
        .from('quote_share_tokens').select('*').eq('token', token).single();
      if (tokenErr || !shareToken) { setExpired(true); setLoading(false); return; }
      if (new Date(shareToken.expires_at) < new Date()) { setExpired(true); setLoading(false); return; }

      await supabase.from('quote_views').insert({
        token_id: shareToken.id, quote_id: shareToken.quote_id, ip_address: null, user_agent: navigator.userAgent,
      });

      const [{ data: q }, { data: its }, { data: atts }, { data: qd }] = await Promise.all([
        supabase.from('quotes').select('*').eq('id', shareToken.quote_id).single(),
        supabase.from('quote_items').select('*').eq('quote_id', shareToken.quote_id).order('sort_order'),
        supabase.from('attachments').select('*').eq('entity_type', 'quote').eq('entity_id', shareToken.quote_id),
        supabase.from('quote_drawings').select('attachment_id').eq('quote_id', shareToken.quote_id),
      ]);
      if (!q) { setExpired(true); setLoading(false); return; }

      const { data: proj } = await supabase.from('projects').select('*').eq('id', q.project_id).single();

      // Drawings/specs linked to the quote via checkboxes live as project
      // attachments referenced by quote_drawings (anon RLS scopes these to a
      // valid share token). Merge them with any quote-level attachments.
      let linkedDrawings: any[] = [];
      const drawingIds = (qd || []).map((r: any) => r.attachment_id);
      if (drawingIds.length > 0) {
        const { data: dAtts } = await supabase.from('attachments').select('*').in('id', drawingIds);
        linkedDrawings = dAtts || [];
      }
      const allAtts = [...(atts || []), ...linkedDrawings];

      setQuote(q);
      setItems(its || []);
      setProject(proj);
      setAttachments(allAtts);

      // Contract terms: the issued-quote snapshot (contract_overrides) if present,
      // else the hard-coded library fallback. Anon can't read templates, but
      // issued quotes carry the frozen overrides — so the customer sees exactly
      // the terms that were locked in.
      if (q.contract_overrides && Array.isArray(q.contract_overrides) && q.contract_overrides.length > 0) {
        setContractSections(q.contract_overrides);
      }

      // Addressee: the frozen contact snapshot (set when the quote was issued).
      if (q.contact_snapshot) {
        const s = q.contact_snapshot;
        setClientContact({ name: s.name || '', phone: s.phone || '', email: s.email || '' });
        // ח.פ. was frozen into the snapshot on issue (anon can't read clients).
        if (s.tax_id) setCustomerTaxId(s.tax_id);
      }

      // Price-peg currency via a SECURITY DEFINER RPC (returns only the code,
      // never cost prices).
      try {
        const { data: cur } = await supabase.rpc('shared_quote_peg_currency', { p_token: token });
        if (cur) setCostCurrency(cur as string);
      } catch {}

      // Render quote attachments (images + PDFs) as document pages.
      if (allAtts.length > 0) {
        const renderable = allAtts.filter((a: any) => /\.(png|jpg|jpeg|gif|bmp|webp|pdf)$/i.test(a.file_name));
        const pageEntries = await Promise.all(
          renderable.map(async (att: any) => {
            try {
              let storagePath = att.file_url;
              if (storagePath.startsWith('http')) {
                const match = storagePath.match(/project-files\/(.+)$/);
                if (match) storagePath = match[1];
              }
              const { data, error } = await supabase.storage.from('project-files').download(storagePath);
              if (error || !data) return [];
              if (/\.pdf$/i.test(att.file_name)) {
                return await renderPdfToPages(att.id, att.file_name, att.file_type ?? null, att.drawing_number ?? null, data);
              }
              const url = await new Promise<string>((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result as string);
                reader.readAsDataURL(data);
              });
              return [{ attId: att.id, fileName: att.file_name, fileType: att.file_type ?? null, drawingNumber: att.drawing_number ?? null, pageNum: 1, totalPages: 1, dataUrl: url }];
            } catch { return []; }
          })
        );
        setAttachmentPages(pageEntries.flat());
      }

      setLoading(false);
    }
    load();
  }, [token]);

  async function handleDownloadPdf() {
    setGeneratingPdf(true);
    try {
      await docRef.current?.downloadPdf(`הצעת-מחיר-${quote.quote_number}`);
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

  if (expired || !quote || !project) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-neutral-50" dir="rtl">
        <div className="bg-white rounded-2xl shadow-lg p-12 text-center max-w-md">
          <div className="mb-4 text-warning"><Icon name="expired" size={48} /></div>
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

  return (
    <div className="bg-neutral-100 min-h-screen">
      <div className="print:hidden sticky top-0 z-50 bg-white border-b border-line-subtle px-6 py-3 flex items-center gap-3 justify-center flex-wrap">
        <button onClick={() => window.print()} className="bg-primary text-white text-sm px-4 py-2 rounded-lg hover:bg-primary-700 transition-colors">
          <Icon name="print" size={16} /> הדפס
        </button>
        <button
          onClick={handleDownloadPdf}
          disabled={generatingPdf}
          className="bg-azure-100 text-azure-600 text-sm px-4 py-2 rounded-lg hover:bg-azure-100 transition-colors disabled:opacity-50"
        >
          {generatingPdf ? <><Icon name="loading" size={16} /> מייצר...</> : <><Icon name="download" size={16} /> הורד PDF</>}
        </button>
      </div>

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
