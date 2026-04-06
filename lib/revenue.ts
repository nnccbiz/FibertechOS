/**
 * Calculate monthly revenue breakdown for a project.
 *
 * Logic:
 * - Takes total project value, delivery duration (months), and order execution date
 * - Divides total value equally across the months starting from the execution date
 * - Returns array of { year, month, amount }
 */
export interface MonthlyRevenue {
  year: number;
  month: number;
  amount: number;
  is_actual: boolean;
  source: string;
}

export function calculateMonthlyRevenue(
  totalValue: number,
  deliveryMonths: number,
  orderExecutionDate: string // ISO date string
): MonthlyRevenue[] {
  if (!totalValue || !deliveryMonths || !orderExecutionDate) return [];

  const monthlyAmount = Math.round((totalValue / deliveryMonths) * 100) / 100;
  const startDate = new Date(orderExecutionDate);
  const result: MonthlyRevenue[] = [];

  for (let i = 0; i < deliveryMonths; i++) {
    const d = new Date(startDate);
    d.setMonth(d.getMonth() + i);

    result.push({
      year: d.getFullYear(),
      month: d.getMonth() + 1, // 1-12
      amount: i === deliveryMonths - 1
        ? totalValue - monthlyAmount * (deliveryMonths - 1) // last month gets remainder
        : monthlyAmount,
      is_actual: false,
      source: 'forecast',
    });
  }

  return result;
}

/** Hebrew month names */
export const MONTH_NAMES = [
  '', 'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
  'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר',
];

/** Format number as ₪ */
export function formatILS(value: number): string {
  if (!value) return '—';
  return new Intl.NumberFormat('he-IL', {
    style: 'currency',
    currency: 'ILS',
    maximumFractionDigits: 0,
  }).format(value);
}
