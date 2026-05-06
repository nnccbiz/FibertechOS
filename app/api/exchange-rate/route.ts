import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

/**
 * GET /api/exchange-rate?currency=USD
 *
 * Fetches exchange rates from Bank of Israel XML feed.
 * Cache hierarchy: in-memory (1h) → Supabase exchange_rate_log (24h) → 503
 */

interface CachedRate {
  rate: number;
  date: string;
  fetchedAt: number;
}

const memCache: Record<string, CachedRate> = {};
const MEM_TTL = 60 * 60 * 1000;        // 1 hour
const DB_MAX_AGE_HOURS = 24;

const CURRENCY_MAP: Record<string, string> = {
  USD: 'USD',
  EUR: 'EUR',
  GBP: 'GBP',
};

const BOI_ENDPOINTS = [
  (currency: string) => `https://boi.org.il/PublicApi/GetExchangeRate?key=${currency}&asXml=true`,
  () => `https://boi.org.il/PublicApi/GetExchangeRates?asXml=true`,
  () => `https://www.boi.org.il/currency.xml`,
];

function parseRateFromXml(xml: string, currency: string): { rate: number; date: string } | null {
  const patterns = [
    new RegExp(`<Key>${currency}</Key>[\\s\\S]*?<CurrentExchangeRate>([\\d.]+)</CurrentExchangeRate>`, 's'),
    new RegExp(`<CURRENCYCODE>${currency}</CURRENCYCODE>[\\s\\S]*?<RATE>([\\d.]+)</RATE>`, 's'),
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

async function logToSupabase(currency: string, rate: number): Promise<void> {
  try {
    const supabase = createAdminClient();
    await supabase.from('exchange_rate_log').insert({
      currency_pair: `${currency}/ILS`,
      rate,
      source: 'boi',
    });
  } catch {
    // Non-fatal — logging failure should not break the response
  }
}

async function fetchFromSupabase(currency: string): Promise<{ rate: number; date: string } | null> {
  try {
    const supabase = createAdminClient();
    const cutoff = new Date(Date.now() - DB_MAX_AGE_HOURS * 60 * 60 * 1000).toISOString();
    const { data } = await supabase
      .from('exchange_rate_log')
      .select('rate, fetched_at')
      .eq('currency_pair', `${currency}/ILS`)
      .gte('fetched_at', cutoff)
      .order('fetched_at', { ascending: false })
      .limit(1)
      .single();
    if (!data) return null;
    return {
      rate: data.rate,
      date: new Date(data.fetched_at).toISOString().split('T')[0],
    };
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

  // 1. In-memory cache
  const cached = memCache[cacheKey];
  if (cached && Date.now() - cached.fetchedAt < MEM_TTL) {
    return NextResponse.json({
      rate: cached.rate, currency, target: 'ILS', date: cached.date, source: 'boi', cached: true,
    });
  }

  // 2. Fetch fresh from BOI
  const fresh = await fetchFromBOI(currency);
  if (fresh) {
    memCache[cacheKey] = { rate: fresh.rate, date: fresh.date, fetchedAt: Date.now() };
    // Fire-and-forget log to Supabase
    logToSupabase(currency, fresh.rate);
    return NextResponse.json({
      rate: fresh.rate, currency, target: 'ILS', date: fresh.date, source: 'boi', cached: false,
    });
  }

  // 3. Supabase fallback (survives server restarts, up to 24h old)
  const dbRate = await fetchFromSupabase(currency);
  if (dbRate) {
    memCache[cacheKey] = { rate: dbRate.rate, date: dbRate.date, fetchedAt: Date.now() - MEM_TTL + 5 * 60 * 1000 };
    return NextResponse.json({
      rate: dbRate.rate, currency, target: 'ILS', date: dbRate.date, source: 'boi', cached: true, stale: true,
    });
  }

  // 4. In-memory stale (any age)
  if (cached) {
    return NextResponse.json({
      rate: cached.rate, currency, target: 'ILS', date: cached.date, source: 'boi', cached: true, stale: true,
    });
  }

  return NextResponse.json(
    { error: 'Unable to fetch exchange rate. Bank of Israel API unavailable.' },
    { status: 503 }
  );
}
