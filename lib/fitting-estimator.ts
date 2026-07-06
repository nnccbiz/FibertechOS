/**
 * Deterministic fitting-cost estimator — the arithmetic layer of Hillel's
 * Pipe__Fitting_design workbook. The AI only READS the drawing (geometry);
 * every shekel here is computed by code, from live factory settings.
 *
 * Core model (distilled from the workbook):
 *   laminate weight [kg] × laminate_cost_per_kg  → material cost
 *   laminate weight [kg] × labor_cost_per_kg     → labor cost
 *   + overhead_pct → total cost → × (1 + markup) → suggested price
 *
 * Weight is estimated from surface area × wall thickness × FRP density.
 * The per-type area factors are STARTING VALUES flagged for calibration —
 * every estimate Hillel approves becomes a calibration example, and the
 * median(final/estimate) ratio of similar approved estimates is applied
 * automatically (the "learning" loop).
 */

export interface FittingAnalysis {
  fitting_type: string;          // elbow | tee | reducer | flange | manhole_coupling | nozzle | liner | other
  dn_mm: number | null;
  secondary_dn_mm: number | null;
  angle_deg: number | null;
  pn_bar: number | null;
  length_mm: number | null;
  wall_thickness_mm: number | null;
  flange_count: number | null;
  flange_standard: string | null;
  description: string;
  notes: string;
  confidence: 'high' | 'medium' | 'low' | string;
}

export interface CostLine {
  kind: 'material' | 'labor' | 'purchased' | 'other';
  desc: string;
  qty: number;
  unit: string;
  unit_price: number;
  total: number;
}

export interface FactorySettings {
  labor_rate_hourly: number;
  labor_cost_per_kg: number;
  laminate_cost_per_kg: number;
  overhead_pct: number;
  default_markup_pct: number;
}

export interface SimilarEstimate {
  fitting_type: string;
  dn: number | null;
  ai_unit_cost: number | null;
  final_unit_cost: number | null;
}

const FRP_DENSITY_KG_M3 = 1850;

// Surface-area factor per fitting type: area ≈ K × π × D². לכיול ע"י הלל.
const AREA_K: Record<string, number> = {
  elbow: 1.5,
  tee: 1.8,
  reducer: 1.0,
  flange: 0.45,
  manhole_coupling: 0.8,
  nozzle: 0.9,
  liner: 0, // liner uses length-based area below
  other: 1.0,
};

/** Baseline wall thickness when the drawing doesn't state one. לכיול. */
export function defaultThicknessMm(dn: number | null, pn: number | null): number {
  if (!dn) return 8;
  const base = Math.max(6, dn / 100);
  const pressureFactor = pn && pn > 10 ? 1.25 : 1;
  return Math.round(base * pressureFactor * 10) / 10;
}

/** Estimated laminate weight for ONE unit, in kg. */
export function estimateWeightKg(a: FittingAnalysis): { weightKg: number; areaM2: number; thicknessMm: number } {
  const dn = a.dn_mm || 0;
  const D = dn / 1000;
  const t = a.wall_thickness_mm || defaultThicknessMm(a.dn_mm, a.pn_bar);
  let area: number;
  if (a.fitting_type === 'liner') {
    const len = (a.length_mm || 1000) / 1000;
    area = Math.PI * D * len;
  } else {
    const k = AREA_K[a.fitting_type] ?? AREA_K.other;
    area = k * Math.PI * D * D;
    // A tee/reducer's branch adds area proportional to the secondary diameter.
    if (a.secondary_dn_mm) area += 0.5 * Math.PI * (a.secondary_dn_mm / 1000) ** 2;
    if (a.flange_count) area += (AREA_K.flange * Math.PI * D * D) * a.flange_count;
  }
  const weight = area * (t / 1000) * FRP_DENSITY_KG_M3;
  return { weightKg: Math.round(weight * 10) / 10, areaM2: Math.round(area * 100) / 100, thicknessMm: t };
}

/** Median of a list (calibration factor helper). */
function median(nums: number[]): number | null {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export interface EstimateResult {
  lines: CostLine[];
  unitCost: number;
  totalCost: number;
  suggestedPrice: number;
  calibrationFactor: number | null;
  assumptions: string[];
}

export function buildEstimate(
  a: FittingAnalysis,
  quantity: number,
  settings: FactorySettings,
  similar: SimilarEstimate[] = [],
): EstimateResult {
  const { weightKg, areaM2, thicknessMm } = estimateWeightKg(a);
  const assumptions: string[] = [
    `שטח פנים משוער: ${areaM2} מ"ר · עובי דופן: ${thicknessMm} מ"מ · משקל למינט: ${weightKg} ק"ג ליחידה`,
    'מקדמי השטח והעובי הם ערכי התחלה לכיול — כל אומדן שמאושר משפר את הדיוק.',
  ];

  const lines: CostLine[] = [
    {
      kind: 'material',
      desc: `למינט (שרף + סיבים + קטליסט) — ${weightKg} ק"ג`,
      qty: weightKg,
      unit: 'ק"ג',
      unit_price: settings.laminate_cost_per_kg,
      total: Math.round(weightKg * settings.laminate_cost_per_kg),
    },
    {
      kind: 'labor',
      desc: `עבודת מפעל (לפי ק"ג למינט)`,
      qty: weightKg,
      unit: 'ק"ג',
      unit_price: settings.labor_cost_per_kg,
      total: Math.round(weightKg * settings.labor_cost_per_kg),
    },
  ];

  const beforeOverhead = lines.reduce((s, l) => s + l.total, 0);
  if (settings.overhead_pct > 0) {
    lines.push({
      kind: 'other',
      desc: `פחת ותקורה (${settings.overhead_pct}%)`,
      qty: 1,
      unit: '',
      unit_price: Math.round(beforeOverhead * settings.overhead_pct / 100),
      total: Math.round(beforeOverhead * settings.overhead_pct / 100),
    });
  }

  let unitCost = lines.reduce((s, l) => s + l.total, 0);

  // Learning loop: similar approved estimates calibrate the raw estimate.
  const ratios = similar
    .filter((s) => s.ai_unit_cost && s.final_unit_cost && s.ai_unit_cost > 0)
    .map((s) => s.final_unit_cost! / s.ai_unit_cost!);
  const calibrationFactor = median(ratios);
  if (calibrationFactor && Math.abs(calibrationFactor - 1) > 0.03) {
    const adj = Math.round(unitCost * (calibrationFactor - 1));
    lines.push({
      kind: 'other',
      desc: `כיול לפי ${ratios.length} תמחורים מאושרים דומים (×${calibrationFactor.toFixed(2)})`,
      qty: 1,
      unit: '',
      unit_price: adj,
      total: adj,
    });
    unitCost += adj;
    assumptions.push(`הופעל מקדם כיול ${calibrationFactor.toFixed(2)} מ-${ratios.length} אביזרים דומים שהלל אישר.`);
  }

  const totalCost = Math.round(unitCost * (quantity || 1));
  const suggestedPrice = Math.round(totalCost * (1 + settings.default_markup_pct / 100));

  return { lines, unitCost: Math.round(unitCost), totalCost, suggestedPrice, calibrationFactor, assumptions };
}
