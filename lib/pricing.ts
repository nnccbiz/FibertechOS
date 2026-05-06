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
 * Calculate roker (short pipe section) total cost.
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

/**
 * Calculate roker cost per meter.
 */
export function calcRokerCostPerMeter(
  pipeBarePrice: number,
  dn: number,
  couplingPrice: number
): { costPerMeter: number; rokerLength: number } {
  const rokerLength = (dn / 1000) * 2;
  if (rokerLength <= 0) return { costPerMeter: pipeBarePrice, rokerLength: 0 };
  const costPerMeter = round2((pipeBarePrice * rokerLength + couplingPrice) / rokerLength);
  return { costPerMeter, rokerLength };
}

/**
 * Get roker length in meters from DN.
 */
export function getRokerLength(dn: number): number {
  return round2((dn / 1000) * 2);
}

// =========================================================
// Full cost chain — supplier foreign currency → ILS → sell
// =========================================================

export interface PipeCostChainInput {
  barePriceForeign: number;      // מחיר צינור ללא מחבר מהספק ($/€)
  couplingPriceForeign: number;  // מחיר מחבר מהספק ($/€)
  pipeLength: number;            // אורך צינור סטנדרטי (5.7, 6, 12 מטר)
  exchangeRate: number;          // שער חליפין ל-₪
  overheadsPct: number;          // ברירת מחדל 17%
  profitPct: number;             // משתנה לפי פרויקט
}

export interface PipeCostChainResult {
  costPerMeterForeign: number;   // עלות למ"ר במטבע מקור
  costPerMeterILS: number;       // עלות למ"ר ב-₪
  withOverheads: number;         // עלות + תקורות למ"ר ב-₪
  sellingPrice: number;          // מחיר מכירה למ"ר ב-₪
  overheadsAmount: number;       // סכום תקורות למ"ר
  profitAmount: number;          // סכום רווח למ"ר
}

/**
 * Full pipe cost chain: supplier price → exchange rate → overheads → profit → selling price.
 * Uses multiplicative formula: cost × (1 + overheads%) × (1 + profit%)
 */
export function calcPipeCostChain(input: PipeCostChainInput): PipeCostChainResult {
  const { barePriceForeign, couplingPriceForeign, pipeLength, exchangeRate, overheadsPct, profitPct } = input;

  const costPerMeterForeign = calcCostPerMeter(barePriceForeign, couplingPriceForeign, pipeLength);
  const costPerMeterILS = round2(costPerMeterForeign * exchangeRate);
  const withOverheads = round2(costPerMeterILS * (1 + overheadsPct / 100));
  const sellingPrice = round2(withOverheads * (1 + profitPct / 100));
  const overheadsAmount = round2(withOverheads - costPerMeterILS);
  const profitAmount = round2(sellingPrice - withOverheads);

  return { costPerMeterForeign, costPerMeterILS, withOverheads, sellingPrice, overheadsAmount, profitAmount };
}

export interface RokerCostChainInput {
  barePriceForeign: number;
  couplingPriceForeign: number;
  dn: number;                    // קוטר נומינלי במ"מ
  exchangeRate: number;
  overheadsPct: number;
  profitPct: number;
}

export interface RokerCostChainResult {
  rokerLength: number;           // אורך רוקר במטרים
  costPerMeterForeign: number;
  costPerMeterILS: number;
  withOverheads: number;
  sellingPrice: number;
  totalRokerCostILS: number;     // עלות רוקר שלם ב-₪
  totalRokerSelling: number;     // מחיר מכירה רוקר שלם
}

/**
 * Full roker cost chain.
 */
export function calcRokerCostChain(input: RokerCostChainInput): RokerCostChainResult {
  const { barePriceForeign, couplingPriceForeign, dn, exchangeRate, overheadsPct, profitPct } = input;

  const rokerLength = getRokerLength(dn);
  const costPerMeterForeign = rokerLength > 0
    ? round2((barePriceForeign * rokerLength + couplingPriceForeign) / rokerLength)
    : barePriceForeign;
  const costPerMeterILS = round2(costPerMeterForeign * exchangeRate);
  const withOverheads = round2(costPerMeterILS * (1 + overheadsPct / 100));
  const sellingPrice = round2(withOverheads * (1 + profitPct / 100));
  const totalRokerCostILS = round2(costPerMeterILS * rokerLength);
  const totalRokerSelling = round2(sellingPrice * rokerLength);

  return { rokerLength, costPerMeterForeign, costPerMeterILS, withOverheads, sellingPrice, totalRokerCostILS, totalRokerSelling };
}

export interface AccessoryCostInput {
  costPriceForeign: number;      // מחיר ליחידה מהספק (או מחושב חיצונית)
  exchangeRate: number;
  overheadsPct: number;
  profitPct: number;
}

export interface AccessoryCostResult {
  costILS: number;
  withOverheads: number;
  sellingPrice: number;
  overheadsAmount: number;
  profitAmount: number;
}

/**
 * Accessory cost chain: foreign price → ILS → overheads → profit.
 */
export function calcAccessoryCost(input: AccessoryCostInput): AccessoryCostResult {
  const { costPriceForeign, exchangeRate, overheadsPct, profitPct } = input;

  const costILS = round2(costPriceForeign * exchangeRate);
  const withOverheads = round2(costILS * (1 + overheadsPct / 100));
  const sellingPrice = round2(withOverheads * (1 + profitPct / 100));
  const overheadsAmount = round2(withOverheads - costILS);
  const profitAmount = round2(sellingPrice - withOverheads);

  return { costILS, withOverheads, sellingPrice, overheadsAmount, profitAmount };
}

/**
 * Generic selling price calculation (multiplicative formula).
 * Used by the quote item editor.
 */
export function calcSellingPrice(costILS: number, overheadsPct: number, profitPct: number): number {
  return round2(costILS * (1 + overheadsPct / 100) * (1 + profitPct / 100));
}

// =========================================================
// Extended pricing engine — unified item pricing + summary
// =========================================================

export type ItemType =
  | 'pipe_with_coupling'
  | 'pipe_bare'
  | 'coupling'
  | 'roker'
  | 'elbow'
  | 'flange'
  | 'reducer'
  | 'other';

export interface QuoteLineItem {
  item_type?: ItemType;
  product_name?: string;
  dn_size?: number | string;   // DN in mm
  sn?: number;
  quantity: number;
  unit: string;                // 'מטר' | 'יחידה' | etc.
  cost_price: number;          // cost in ILS per unit
  overheads_pct: number;
  profit_pct: number;
  unit_price?: number;         // selling price per unit (ILS)
  total_price?: number;        // selling price × quantity
  length_m?: number;           // for pipe: standard length in meters (used for roker calc)
}

export interface QuoteLineItemPriced extends QuoteLineItem {
  unit_price: number;
  total_price: number;
  overheads_amount: number;
  profit_amount: number;
  margin_pct: number;          // actual gross margin % = profit / selling price
}

/**
 * Price a single quote line item.
 * Routes roker items through the roker cost chain when dn_size is provided.
 */
export function calcItemPrice(item: QuoteLineItem): QuoteLineItemPriced {
  const dn = typeof item.dn_size === 'string' ? parseInt(item.dn_size, 10) : (item.dn_size ?? 0);
  let unitPrice: number;

  if (item.item_type === 'roker' && dn > 0 && item.length_m && item.length_m > 0) {
    // For roker: cost_price is treated as cost-per-meter ILS; recalculate via roker formula
    const rokerLength = round2((dn / 1000) * 2);
    const withOverheads = round2(item.cost_price * (1 + item.overheads_pct / 100));
    unitPrice = round2(withOverheads * (1 + item.profit_pct / 100) * rokerLength);
  } else {
    unitPrice = calcSellingPrice(item.cost_price, item.overheads_pct, item.profit_pct);
  }

  const totalPrice = round2(unitPrice * item.quantity);
  const costTotal = round2(item.cost_price * item.quantity);
  const overheadsAmount = round2(costTotal * (item.overheads_pct / 100));
  const profitAmount = round2(totalPrice - costTotal - overheadsAmount);
  const marginPct = totalPrice > 0 ? round2((profitAmount / totalPrice) * 100) : 0;

  return {
    ...item,
    unit_price: unitPrice,
    total_price: totalPrice,
    overheads_amount: overheadsAmount,
    profit_amount: profitAmount,
    margin_pct: marginPct,
  };
}

export interface QuoteSummary {
  totalCost: number;
  totalOverheads: number;
  totalProfit: number;
  totalSelling: number;
  avgMarginPct: number;
  byCategory: Record<string, { cost: number; selling: number; count: number }>;
}

const ITEM_CATEGORY: Record<string, string> = {
  pipe_with_coupling: 'צינורות',
  pipe_bare:          'צינורות',
  coupling:           'מחברים',
  roker:              'רוקרים',
  elbow:              'ברכיים',
  flange:             'אוגנים',
  reducer:            'מעברים',
  other:              'אחר',
};

/**
 * Aggregate priced line items into a quote summary with category breakdown.
 */
export function calcQuoteSummary(items: QuoteLineItemPriced[]): QuoteSummary {
  let totalCost = 0, totalOverheads = 0, totalProfit = 0, totalSelling = 0;
  const byCategory: Record<string, { cost: number; selling: number; count: number }> = {};

  for (const item of items) {
    const cost = round2(item.cost_price * item.quantity);
    totalCost += cost;
    totalOverheads += item.overheads_amount;
    totalProfit += item.profit_amount;
    totalSelling += item.total_price;

    const cat = ITEM_CATEGORY[item.item_type ?? 'other'] ?? 'אחר';
    if (!byCategory[cat]) byCategory[cat] = { cost: 0, selling: 0, count: 0 };
    byCategory[cat].cost = round2(byCategory[cat].cost + cost);
    byCategory[cat].selling = round2(byCategory[cat].selling + item.total_price);
    byCategory[cat].count += item.quantity;
  }

  totalCost = round2(totalCost);
  totalOverheads = round2(totalOverheads);
  totalProfit = round2(totalProfit);
  totalSelling = round2(totalSelling);
  const avgMarginPct = totalSelling > 0 ? round2((totalProfit / totalSelling) * 100) : 0;

  return { totalCost, totalOverheads, totalProfit, totalSelling, avgMarginPct, byCategory };
}

/**
 * Validate that quote margins are within acceptable bounds.
 * Returns warnings for items outside normal ranges.
 */
export interface MarginWarning {
  index: number;
  product_name: string;
  margin_pct: number;
  issue: 'low_margin' | 'high_margin' | 'zero_cost';
}

export function validateQuoteMargins(
  items: QuoteLineItemPriced[],
  minMarginPct = 10,
  maxMarginPct = 60,
): MarginWarning[] {
  const warnings: MarginWarning[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.cost_price === 0) {
      warnings.push({ index: i, product_name: item.product_name ?? '', margin_pct: 0, issue: 'zero_cost' });
    } else if (item.margin_pct < minMarginPct) {
      warnings.push({ index: i, product_name: item.product_name ?? '', margin_pct: item.margin_pct, issue: 'low_margin' });
    } else if (item.margin_pct > maxMarginPct) {
      warnings.push({ index: i, product_name: item.product_name ?? '', margin_pct: item.margin_pct, issue: 'high_margin' });
    }
  }
  return warnings;
}
