// Matching a supplier delivery-note line to one of OUR order items.
//
// Our PO items are born from the cost input (Hebrew descriptions, no supplier
// material no), while the supplier's delivery note carries his material no,
// DN/PN/SN and an English description. One DN often has several variants on
// the same order (Hobas jacking: standard / with grout nozzles / first pipe),
// so DN alone is not an identity.

export type PipeVariant = 'first' | 'nozzle' | 'standard';

export const VARIANT_LABEL: Record<PipeVariant, string> = {
  standard: 'standard',
  nozzle: 'w/nozzles',
  first: 'first pipes',
};

/**
 * Variant from a description. "first" wins over "nozzle": the Hobas first pipe
 * ("special pipe CC … w/o spigot prep") also carries grout ports.
 */
export function pipeVariant(desc?: string | null): PipeVariant {
  const d = (desc || '').toLowerCase();
  if (/first|special\s*pipe|w\/o\s*spigot|ראשון|ראשונ/.test(d)) return 'first';
  if (/nozzle|grout|נחיר|הזרקה/.test(d)) return 'nozzle';
  return 'standard';
}

/** Digits-only numeric key: "DN 1280"→1280, "PN 01"→1, "SN 100.000"→100000. */
export function numKey(v?: string | number | null): number | null {
  if (v == null) return null;
  const d = String(v).replace(/[^\d]/g, '');
  if (!d) return null;
  const n = parseInt(d, 10);
  return isNaN(n) ? null : n;
}

export interface MatchLine {
  material_no?: string | null;
  description?: string | null;
  dn?: string | null;
  pn?: string | null;
  sn?: string | null;
}
export interface MatchItem extends MatchLine { id: string }

export type MatchHow = 'material' | 'spec' | null;

/**
 * 1. same supplier material no (learned onto the item on a previous upload);
 * 2. DN (+PN/SN when both sides state them) and, when several remain, the
 *    pipe variant. An item already tied to a DIFFERENT material is skipped.
 * Ambiguity returns null — the user picks in the review screen.
 */
export function matchOrderItem(line: MatchLine, items: MatchItem[]): { id: string | null; how: MatchHow } {
  const mat = (line.material_no || '').trim();
  if (mat) {
    const m = items.find((i) => (i.material_no || '').trim() === mat);
    if (m) return { id: m.id, how: 'material' };
  }
  const dn = numKey(line.dn);
  if (!dn) return { id: null, how: null };
  let c = items.filter((i) => numKey(i.dn) === dn);
  if (mat) c = c.filter((i) => !(i.material_no || '').trim());
  const pn = numKey(line.pn);
  const sn = numKey(line.sn);
  if (pn) c = c.filter((i) => numKey(i.pn) == null || numKey(i.pn) === pn);
  if (sn) c = c.filter((i) => numKey(i.sn) == null || numKey(i.sn) === sn);
  if (c.length > 1) {
    const v = pipeVariant(line.description);
    const byVariant = c.filter((i) => pipeVariant(i.description) === v);
    if (byVariant.length) c = byVariant;
  }
  return c.length === 1 ? { id: c[0].id, how: 'spec' } : { id: null, how: null };
}
