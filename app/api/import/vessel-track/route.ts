/**
 * GET /api/import/vessel-track?vessel=<name>
 *
 * Live vessel position + ETA for an import shipment, by vessel name.
 *
 * Provider: Datalastic (https://datalastic.com) — REST AIS API. Requires
 * DATALASTIC_API_KEY in env (paid, free trial available). Without a key the
 * route still returns external map links (VesselFinder / MarineTraffic search
 * by name) so the UI button stays useful.
 *
 * Beyond the provider's reported destination/ETA, we compute great-circle
 * distance from the vessel's live position to Ashdod and Haifa and a naive
 * ETA at current speed — so "מתי נכנסת לנמל" is answered even when the AIS
 * destination field is stale or points elsewhere.
 *
 * Results are cached in module memory for 10 minutes per vessel name to save
 * API credits (ship positions don't move meaningfully faster than that).
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

const PORTS = [
  { key: 'ashdod', name: 'אשדוד', lat: 31.816, lon: 34.641 },
  { key: 'haifa', name: 'חיפה', lat: 32.833, lon: 35.0 },
];

const EARTH_RADIUS_NM = 3440.065;
function distanceNm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_NM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// pick the first present key — Datalastic field names vary between endpoints
// (eta vs eta_UTC, last_position_UTC vs last_position_epoch), so read defensively.
function pick(obj: any, ...keys: string[]): any {
  for (const k of keys) if (obj && obj[k] !== undefined && obj[k] !== null && obj[k] !== '') return obj[k];
  return null;
}

type CacheEntry = { at: number; payload: any };
const cache = new Map<string, CacheEntry>();
const CACHE_MS = 10 * 60 * 1000;

function externalLinks(vessel: string) {
  const q = encodeURIComponent(vessel);
  return {
    vesselfinder: `https://www.vesselfinder.com/vessels?name=${q}`,
    marinetraffic: `https://www.marinetraffic.com/en/ais/index/search/all?keyword=${q}`,
  };
}

export async function GET(req: NextRequest) {
  const vessel = (req.nextUrl.searchParams.get('vessel') || '').trim();
  if (!vessel) return NextResponse.json({ error: 'vessel required' }, { status: 400 });

  // Session gate — this proxies a paid external API; don't leave it open.
  const userClient = await createClient();
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const links = externalLinks(vessel);
  const apiKey = process.env.DATALASTIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ configured: false, links });
  }

  const cacheKey = vessel.toUpperCase();
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < CACHE_MS) {
    return NextResponse.json(hit.payload);
  }

  try {
    // 1. Resolve name → vessel identity (uuid/mmsi/imo).
    const findRes = await fetch(
      `https://api.datalastic.com/api/v0/vessel_find?api-key=${apiKey}&name=${encodeURIComponent(vessel)}`,
      { signal: AbortSignal.timeout(15000) },
    );
    if (!findRes.ok) throw new Error(`vessel_find HTTP ${findRes.status}`);
    const findJson = await findRes.json();
    const found: any[] = Array.isArray(findJson?.data) ? findJson.data : (findJson?.data?.vessels || []);
    if (!found.length) {
      const payload = { configured: true, found: false, links };
      cache.set(cacheKey, { at: Date.now(), payload });
      return NextResponse.json(payload);
    }
    // Prefer an exact (case-insensitive) name match; cargo ships over tugs etc.
    const exact = found.find((v) => (v.name || '').toUpperCase() === vessel.toUpperCase());
    const match = exact || found[0];

    // 2. Live position + voyage data.
    const idParam = match.uuid ? `uuid=${match.uuid}` : match.imo ? `imo=${match.imo}` : `mmsi=${match.mmsi}`;
    const posRes = await fetch(
      `https://api.datalastic.com/api/v0/vessel_pro?api-key=${apiKey}&${idParam}`,
      { signal: AbortSignal.timeout(15000) },
    );
    if (!posRes.ok) throw new Error(`vessel_pro HTTP ${posRes.status}`);
    const posJson = await posRes.json();
    const d = posJson?.data || {};

    const lat = Number(pick(d, 'lat', 'latitude'));
    const lon = Number(pick(d, 'lon', 'lng', 'longitude'));
    const speed = Number(pick(d, 'speed', 'speed_knots')) || 0;
    const hasPos = Number.isFinite(lat) && Number.isFinite(lon);

    // 3. Distance + naive ETA to each Israeli port at current speed.
    const ports = hasPos
      ? PORTS.map((p) => {
          const nm = distanceNm(lat, lon, p.lat, p.lon);
          const etaHours = speed > 1 ? nm / speed : null;
          return {
            key: p.key,
            name: p.name,
            distance_nm: Math.round(nm),
            eta_hours: etaHours ? Math.round(etaHours) : null,
            eta_date: etaHours ? new Date(Date.now() + etaHours * 3600 * 1000).toISOString() : null,
          };
        })
      : [];

    const payload = {
      configured: true,
      found: true,
      vessel: {
        name: pick(match, 'name') || vessel,
        mmsi: pick(match, 'mmsi'),
        imo: pick(match, 'imo'),
        type: pick(match, 'type', 'type_specific'),
        lat: hasPos ? lat : null,
        lon: hasPos ? lon : null,
        speed_kn: speed,
        course: pick(d, 'course', 'heading'),
        destination: pick(d, 'destination', 'dest', 'dest_port'),
        reported_eta: pick(d, 'eta_UTC', 'eta_utc', 'eta'),
        last_position_at: pick(d, 'last_position_UTC', 'last_position_utc', 'position_UTC', 'timestamp'),
        navigation_status: pick(d, 'navigation_status', 'nav_status'),
      },
      ports,
      links,
    };
    cache.set(cacheKey, { at: Date.now(), payload });
    return NextResponse.json(payload);
  } catch (e: any) {
    // Provider failure shouldn't 500 the UI — degrade to the external links.
    console.error('vessel-track:', e?.message || e);
    return NextResponse.json({ configured: true, found: false, error: 'provider_error', links });
  }
}
