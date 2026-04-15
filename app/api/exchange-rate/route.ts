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

// Currency codes supported
const CURRENCY_MAP: Record<string, string> = {
  USD: 'USD',
  EUR: 'EUR',
  GBP: 'GBP',
};

// Try multiple BOI endpoints in order
const BOI_ENDPOINTS = [
  (currency: string) => `https://boi.org.il/PublicApi/GetExchangeRate?key=${currency}&asXml=true`,
  () => `https://boi.org.il/PublicApi/GetExchangeRates?asXml=true`,
  () => `https://www.boi.org.il/currency.xml`,
];

function parseRateFromXml(xml: string, currency: string): { rate: number; date: string } | null {
  const currencyCode = CURRENCY_MAP[currency] || currency;

  // Try multiple XML formats (BOI has different response formats per endpoint)
  const patterns = [
    // Format: <ExchangeRate>...<Key>USD</Key>...<CurrentExchangeRate>3.65</CurrentExchangeRate>...</ExchangeRate>
    new RegExp(`<Key>${currencyCode}</Key>[\\s\\S]*?<CurrentExchangeRate>([\\d.]+)</CurrentExchangeRate>`, 's'),
    // Format: <CURRENCYCODE>USD</CURRENCYCODE>...<RATE>3.65</RATE>
    new RegExp(`<CURRENCYCODE>${currencyCode}</CURRENCYCODE>[\\s\\S]*?<RATE>([\\d.]+)</RATE>`, 's'),
    // Format: <RATE>3.65</RATE> (single currency endpoint)
    /<CurrentExchangeRate>([\d.]+)<\/CurrentExchangeRate>/,
    /<RATE>([\d.]+)<\/RATE>/,
  ];

  let rate = 0;
  for (const pattern of patterns) {
    const match = xml.match(pattern);
    if (match) {
      rate = parseFloat(match[1]);
      if (!isNaN(rate) && rate > 0) break;
    }
  }
  if (!rate) return null;

  // Extract date
  const datePatterns = [
    /<LastUpdate>(\d{4}-\d{2}-\d{2})/,
    /<LAST_UPDATE>(\d{4}-\d{2}-\d{2})/,
    /<CurrentExchangeRateDateTime>(\d{4}-\d{2}-\d{2})/,
  ];
  let date = new Date().toISOString().split('T')[0];
  for (const dp of datePatterns) {
    const m = xml.match(dp);
    if (m) { date = m[1]; break; }
  }

  return { rate, date };
}

async function fetchFromBOI(currency: string): Promise<{ rate: number; date: string } | null> {
  for (const getUrl of BOI_ENDPOINTS) {
    try {
      const url = getUrl(currency);
      const res = await fetch(url, {
        next: { revalidate: 3600 },
        headers: { 'Accept': 'application/xml, text/xml, */*' },
      });
      if (!res.ok) continue;

      const xml = await res.text();
      const result = parseRateFromXml(xml, currency);
      if (result) return result;
    } catch {
      continue;
    }
  }
  return null;
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
