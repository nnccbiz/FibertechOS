/**
 * Fibertech OS — Gross Margin Pricing Engine
 *
 * Formula: Selling Price = (Cost + Overheads) / (1 − Profit%)
 * Equivalent to: Cost × (1 + overheads%) / (1 − profit%)
 */

export interface PricingInput {
  cost: number;
  overheadsPct?: number; // default 15%
  profitPct?: number;    // default 25%
}

export interface PricingResult {
  sellingPrice: number;
  overheadsAmount: number;
  grossProfit: number;
  grossMarginPct: number;
}

const DEFAULT_OVERHEADS_PCT = 15;
const DEFAULT_PROFIT_PCT = 25;

/**
 * Calculate the gross-margin selling price.
 *
 * @example
 * calcGrossMarginPrice({ cost: 10000 })
 * // => { sellingPrice: 15333.33, overheadsAmount: 1500, grossProfit: 3833.33, grossMarginPct: 25 }
 *
 * calcGrossMarginPrice({ cost: 10000, overheadsPct: 20, profitPct: 30 })
 * // => { sellingPrice: 17142.86, ... }
 */
export function calcGrossMarginPrice(input: PricingInput): PricingResult {
  const { cost } = input;
  const overheadsPct = input.overheadsPct ?? DEFAULT_OVERHEADS_PCT;
  const profitPct = input.profitPct ?? DEFAULT_PROFIT_PCT;

  if (profitPct >= 100) {
    throw new Error('Profit percentage must be less than 100');
  }
  if (cost < 0) {
    throw new Error('Cost must be non-negative');
  }

  const overheadsAmount = cost * (overheadsPct / 100);
  const costPlusOverheads = cost + overheadsAmount;
  const sellingPrice = costPlusOverheads / (1 - profitPct / 100);
  const grossProfit = sellingPrice - costPlusOverheads;

  return {
    sellingPrice: round2(sellingPrice),
    overheadsAmount: round2(overheadsAmount),
    grossProfit: round2(grossProfit),
    grossMarginPct: profitPct,
  };
}

/**
 * Reverse-calculate: given a selling price, find the implied cost.
 */
export function reverseFromPrice(
  sellingPrice: number,
  overheadsPct = DEFAULT_OVERHEADS_PCT,
  profitPct = DEFAULT_PROFIT_PCT,
): number {
  const costPlusOverheads = sellingPrice * (1 - profitPct / 100);
  return round2(costPlusOverheads / (1 + overheadsPct / 100));
}

/**
 * Compare a quote price against a proforma price from Amiblu.
 * Returns the discrepancy percentage.
 */
export function compareQuoteToProforma(
  quoteTotal: number,
  proformaTotal: number,
): { match: boolean; discrepancyPct: number } {
  if (proformaTotal === 0) return { match: false, discrepancyPct: 100 };
  const discrepancyPct = round2(
    Math.abs((quoteTotal - proformaTotal) / proformaTotal) * 100,
  );
  return {
    match: discrepancyPct < 2, // within 2% tolerance
    discrepancyPct,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Calculate true cost per meter for a pipe + coupling combo.
 * @param pipeBarePrice - מחיר צינור ללא מחבר למטר
 * @param couplingPrice - מחיר מחבר ליחידה
 * @param pipeLength - אורך הצינור במטרים (5.7, 6, 12 וכו')
 */
export function calcCostPerMeter(
  pipeBarePrice: number,
  couplingPrice: number,
  pipeLength: number
): number {
  if (pipeLength <= 0) return pipeBarePrice;
  return round2(pipeBarePrice + (couplingPrice / pipeLength));
}

/**
 * Calculate roker (short pipe section) cost.
 * @param pipeBarePrice - מחיר צינור ללא מחבר למטר
 * @param dn - קוטר נומינלי במ"מ (1400, 1200 וכו')
 * @param couplingPrice - מחיר מחבר ליחידה
 */
export function calcRokerCost(
  pipeBarePrice: number,
  dn: number,
  couplingPrice: number
): number {
  const rokerLength = (dn / 1000) * 2;
  return round2((pipeBarePrice * rokerLength) + couplingPrice);
}
