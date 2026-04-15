/**
 * Exchange rate utilities — client-side helpers
 */

export interface ExchangeRateInfo {
  rate: number;
  currency: string;
  target: string;
  date: string;
  source: string;
  cached?: boolean;
  stale?: boolean;
}

/**
 * Fetch exchange rate from our API route.
 * @param currency - 'USD' | 'EUR' | 'GBP'
 */
export async function fetchExchangeRate(
  currency: 'USD' | 'EUR' | 'GBP' = 'USD'
): Promise<ExchangeRateInfo> {
  const res = await fetch(`/api/exchange-rate?currency=${currency}`);
  if (!res.ok) {
    throw new Error(`Failed to fetch ${currency}/ILS rate`);
  }
  return res.json();
}

/**
 * Convert foreign currency amount to ILS.
 */
export function convertToILS(amount: number, rate: number): number {
  return Math.round(amount * rate * 100) / 100;
}

/**
 * Convert ILS amount back to foreign currency.
 */
export function convertFromILS(amountILS: number, rate: number): number {
  if (rate <= 0) return 0;
  return Math.round((amountILS / rate) * 100) / 100;
}

/**
 * Format exchange rate for display.
 */
export function formatRate(rate: number): string {
  return rate.toFixed(4);
}

/**
 * Currency symbol map.
 */
export const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$',
  EUR: '€',
  GBP: '£',
  ILS: '₪',
};

/**
 * Format amount with currency symbol.
 */
export function formatCurrencyAmount(amount: number, currency: string): string {
  const symbol = CURRENCY_SYMBOLS[currency] || currency;
  const formatted = new Intl.NumberFormat('he-IL', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
  return `${symbol}${formatted}`;
}
