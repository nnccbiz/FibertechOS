/**
 * Inventory helpers — item identity + payment-terms parsing.
 *
 * An inventory item is identified by its technical spec, derived automatically
 * from procurement data (no manual catalog): category|DN|PN|SN|length.
 */

export interface ItemSpec {
  category?: string | null;
  description?: string | null;
  dn?: number | string | null;
  pn?: number | string | null;
  sn?: number | string | null;
  length_m?: number | string | null;
}

const num = (v: any): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = parseFloat(String(v).replace(/[^\d.]/g, ''));
  return Number.isFinite(n) ? n : null;
};

/** Guess the stock category from a description (pipes vs fittings). */
export function guessCategory(description?: string | null): string {
  const d = (description || '').toLowerCase();
  if (/coupling|מחבר|elbow|ברך|tee|flange|אוגן|reducer|מעבר|fitting|אביזר/.test(d)) return 'אביזרים';
  if (/lubricant|סיכה|איטום/.test(d)) return 'חומרי סיכה';
  return 'צינורות';
}

/** Normalized identity: same spec ⇒ same stock line. */
export function itemKey(spec: ItemSpec): string {
  const cat = spec.category || guessCategory(spec.description);
  const parts = [
    cat,
    num(spec.dn) != null ? `DN${num(spec.dn)}` : '',
    num(spec.pn) != null ? `PN${num(spec.pn)}` : '',
    num(spec.sn) != null ? `SN${num(spec.sn)}` : '',
    num(spec.length_m) != null ? `L${num(spec.length_m)}` : '',
  ].filter(Boolean);
  return parts.join('|');
}

/**
 * Payment due date from Israeli payment-terms text.
 *   "שוטף+60" / "שוטף + 30"  → end of invoice month + N days
 *   "45 יום" / "net 45"      → invoice date + N days
 *   otherwise                → invoice date + 30 days
 */
export function paymentDueDate(termsText: string | null | undefined, fromDate: Date = new Date()): string {
  const t = (termsText || '').trim();
  const shotef = t.match(/שוטף\s*\+?\s*(\d+)/);
  if (shotef) {
    const endOfMonth = new Date(fromDate.getFullYear(), fromDate.getMonth() + 1, 0);
    endOfMonth.setDate(endOfMonth.getDate() + parseInt(shotef[1], 10));
    return endOfMonth.toISOString().slice(0, 10);
  }
  const days = t.match(/(\d+)\s*(יום|ימים|days?)/i) || t.match(/net\s*(\d+)/i);
  const n = days ? parseInt(days[1], 10) : 30;
  const due = new Date(fromDate);
  due.setDate(due.getDate() + n);
  return due.toISOString().slice(0, 10);
}
