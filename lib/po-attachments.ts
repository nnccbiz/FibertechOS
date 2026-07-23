/**
 * Attached pages on a purchase order — client-side rendering helper.
 *
 * import_orders.attached_pages holds [{path, page, label}]: a specific page of
 * a PDF in the project-files bucket (1-based), or a whole image file (page 0).
 * renderAttachedPages() downloads each source once and returns data-URLs ready
 * to be dropped onto A4 pages in the PO document.
 */
import { createClient } from '@/lib/supabase/client';

export interface AttachedPageRef {
  path: string;   // storage path in project-files
  page: number;   // 1-based PDF page; 0 = whole image file
  label?: string;
}

export interface RenderedAttachedPage {
  dataUrl: string;
  label?: string;
}

/** Normalize an attachments.file_url (may be a full public URL) to a storage key. */
export function storageKey(fileUrl: string): string {
  if (!fileUrl) return fileUrl;
  if (fileUrl.startsWith('http')) {
    const m = fileUrl.match(/project-files\/(.+)$/);
    if (m) return m[1];
  }
  return fileUrl;
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.readAsDataURL(blob);
  });
}

/** Render every page of a PDF blob to data-URLs (scale ~A4). */
export async function pdfPagesToDataUrls(blob: Blob, scale = 1.5, only?: Set<number>): Promise<Map<number, string>> {
  const pdfjsLib: any = await import('pdfjs-dist');
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
  const arrayBuffer = await blob.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const out = new Map<number, string>();
  for (let i = 1; i <= pdf.numPages; i++) {
    if (only && !only.has(i)) continue;
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) continue;
    await page.render({ canvasContext: ctx, viewport, canvas }).promise;
    out.set(i, canvas.toDataURL('image/jpeg', 0.85));
  }
  return out;
}

/** Number of pages in a stored PDF (0 for images/unreadable). */
export async function pdfPageCount(blob: Blob): Promise<number> {
  try {
    const pdfjsLib: any = await import('pdfjs-dist');
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
    const pdf = await pdfjsLib.getDocument({ data: await blob.arrayBuffer() }).promise;
    return pdf.numPages;
  } catch {
    return 0;
  }
}

/** Resolve attached-page refs to rendered images (one download per source file). */
export async function renderAttachedPages(refs: AttachedPageRef[] | null | undefined): Promise<RenderedAttachedPage[]> {
  if (!refs?.length) return [];
  const supabase = createClient();
  const byPath = new Map<string, AttachedPageRef[]>();
  refs.forEach((r) => {
    const key = storageKey(r.path);
    (byPath.get(key) || byPath.set(key, []).get(key)!).push({ ...r, path: key });
  });
  const out: { order: number; page: RenderedAttachedPage }[] = [];
  await Promise.all(Array.from(byPath.entries()).map(async ([path, group]) => {
    try {
      const { data: blob, error } = await supabase.storage.from('project-files').download(path);
      if (error || !blob) return;
      const isPdf = /\.pdf$/i.test(path) || group.some((g) => g.page > 0);
      if (isPdf) {
        const wanted = new Set(group.filter((g) => g.page > 0).map((g) => g.page));
        const rendered = await pdfPagesToDataUrls(blob, 1.5, wanted.size ? wanted : undefined);
        group.forEach((g) => {
          const dataUrl = g.page > 0 ? rendered.get(g.page) : rendered.get(1);
          if (dataUrl) out.push({ order: refs.indexOf(refs.find((r) => storageKey(r.path) === path && r.page === g.page)!), page: { dataUrl, label: g.label } });
        });
      } else {
        const dataUrl = await blobToDataUrl(blob);
        group.forEach((g) => {
          out.push({ order: refs.findIndex((r) => storageKey(r.path) === path), page: { dataUrl, label: g.label } });
        });
      }
    } catch { /* skip unreadable file */ }
  }));
  return out.sort((a, b) => a.order - b.order).map((o) => o.page);
}
