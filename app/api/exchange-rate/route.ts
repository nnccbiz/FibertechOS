import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/exchange-rate?currency=USD
 *
 * Fetches exchange rates from Bank of Israel XML feed.
 * Supports USD and EUR (to ILS).
 * Caches in memory for 1 hour.
 */

interface CachedRate {
  rate: number;
  date: string;
  fetchedAt: number;
}

const cache: Record<string, CachedRate> = {};
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

const BOI_URL = 'https://www.boi.org.il/currency.xml';

// Currency codes in BOI XML
const CURRENCY_MAP: Record<string, string> = {
  USD: 'USD',
  EUR: 'EUR',
  GBP: 'GBP',
};

async function fetchFromBOI(currency: string): Promise<{ rate: number; date: string } | null> {
  try {
    const res = await fetch(BOI_URL, { next: { revalidate: 3600 } });
    if (!res.ok) return null;

    const xml = await res.text();

    // Parse rate from BOI XML — format: <CURRENCY>...<CURRENCYCODE>USD</CURRENCYCODE><RATE>3.65</RATE>...</CURRENCY>
    const currencyCode = CURRENCY_MAP[currency] || currency;
    const regex = new RegExp(
      `<CURRENCY>\\s*<NAME>[^<]*</NAME>\\s*<UNIT>\\d+</UNIT>\\s*<CURRENCYCODE>${currencyCode}</CURRENCYCODE>\\s*<COUNTRY>[^<]*</COUNTRY>\\s*<RATE>([\\d.]+)</RATE>`,
      's'
    );
    const match = xml.match(regex);
    if (!match) return null;

    const rate = parseFloat(match[1]);
    if (isNaN(rate) || rate <= 0) return null;

    // Extract date from XML: <LAST_UPDATE>2026-04-15</LAST_UPDATE>
    const dateMatch = xml.match(/<LAST_UPDATE>(\d{4}-\d{2}-\d{2})<\/LAST_UPDATE>/);
    const date = dateMatch ? dateMatch[1] : new Date().toISOString().split('T')[0];

    return { rate, date };
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const currency = (searchParams.get('currency') || 'USD').toUpperCase();

  if (!CURRENCY_MAP[currency]) {
    return NextResponse.json(
      { error: `Unsupported currency: ${currency}. Supported: USD, EUR, GBP` },
      { status: 400 }
    );
  }

  const cacheKey = `${currency}/ILS`;

  // Check cache
  const cached = cache[cacheKey];
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
    return NextResponse.json({
      rate: cached.rate,
      currency,
      target: 'ILS',
      date: cached.date,
      source: 'boi',
      cached: true,
    });
  }

  // Fetch fresh rate
  const result = await fetchFromBOI(currency);

  if (result) {
    cache[cacheKey] = {
      rate: result.rate,
      date: result.date,
      fetchedAt: Date.now(),
    };

    return NextResponse.json({
      rate: result.rate,
      currency,
      target: 'ILS',
      date: result.date,
      source: 'boi',
      cached: false,
    });
  }

  // Fallback to cached (even if stale)
  if (cached) {
    return NextResponse.json({
      rate: cached.rate,
      currency,
      target: 'ILS',
      date: cached.date,
      source: 'boi',
      cached: true,
      stale: true,
    });
  }

  return NextResponse.json(
    { error: 'Unable to fetch exchange rate. Bank of Israel API unavailable.' },
    { status: 503 }
  );
}
