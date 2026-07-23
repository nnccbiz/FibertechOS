/**
 * Billing-trigger engine helpers — shared by the quote card (display/override)
 * and the cron billing rules (/api/cron/alerts).
 *
 * The WHEN of customer billing is derived from the signed quote's free-text
 * payment terms; quotes.billing_trigger ('auto' default) and
 * quotes.billing_advance_pct (NULL = auto) let the user override per deal.
 */

export type BillingAnchor = 'delivery' | 'port_arrival';

export const BILLING_ANCHOR_LABELS: Record<string, string> = {
  auto: 'אוטומטי (לפי תנאי התשלום)',
  delivery: 'אספקה ללקוח',
  port_arrival: 'הגעה לנמל',
};

/** Detect the billing anchor from free-text payment terms. */
export function detectBillingAnchor(terms: string | null | undefined): BillingAnchor {
  const t = (terms || '').toLowerCase();
  if (/נמל|הגעת הטובין|הגעה לארץ|port|arrival|שחרור מהמכס|עם ההגעה/.test(t)) return 'port_arrival';
  return 'delivery';
}

/** Detect an advance percentage ("מקדמה 20%", "20% במעמד החתימה"). NULL = none found. */
export function detectAdvancePct(terms: string | null | undefined): number | null {
  const t = terms || '';
  const m =
    t.match(/מקדמה\s*(?:של\s*)?(\d{1,2})\s*%/) ||
    t.match(/(\d{1,2})\s*%\s*(?:מקדמה|במעמד\s*(?:ה)?חתימה|בחתימה|עם\s*(?:ה)?חתימה)/) ||
    t.match(/advance\s*(?:of\s*)?(\d{1,2})\s*%/i) ||
    t.match(/(\d{1,2})\s*%\s*advance/i);
  if (!m) return null;
  const pct = parseInt(m[1], 10);
  return pct > 0 && pct < 100 ? pct : null;
}

/** Effective anchor for a quote row — the override wins, 'auto' falls back to detection. */
export function effectiveBillingAnchor(quote: { billing_trigger?: string | null; payment_terms?: string | null }): BillingAnchor {
  const t = quote.billing_trigger;
  if (t === 'delivery' || t === 'port_arrival') return t;
  return detectBillingAnchor(quote.payment_terms);
}

/** Effective advance % for a quote row — override wins, NULL falls back to detection. */
export function effectiveAdvancePct(quote: { billing_advance_pct?: number | null; payment_terms?: string | null }): number | null {
  const v = quote.billing_advance_pct;
  if (v != null && Number(v) > 0) return Number(v);
  return detectAdvancePct(quote.payment_terms);
}

/** Compact goods summary for billing alerts: "DN300 ×707.3 מטר · DN500 ×598.5 מטר". */
export function summarizeGoods(items: { dn?: any; qty?: any; shipped_qty?: any; unit?: any; description?: any }[] | null | undefined, maxParts = 6): string {
  if (!items?.length) return '';
  const agg = new Map<string, { qty: number; unit: string }>();
  items.forEach((it) => {
    const dn = String(it.dn || '').trim();
    const key = dn ? (dn.toUpperCase().startsWith('DN') ? dn.toUpperCase() : `DN${dn}`) : (String(it.description || 'פריט').slice(0, 30));
    const qty = Number(it.qty ?? it.shipped_qty) || 0;
    const e = agg.get(key) || { qty: 0, unit: String(it.unit || '') };
    e.qty += qty;
    agg.set(key, e);
  });
  const parts = Array.from(agg.entries()).map(([k, v]) => `${k} ×${v.qty.toLocaleString()}${v.unit ? ` ${v.unit}` : ''}`);
  const shown = parts.slice(0, maxParts).join(' · ');
  return parts.length > maxParts ? `${shown} ועוד ${parts.length - maxParts} פריטים` : shown;
}
