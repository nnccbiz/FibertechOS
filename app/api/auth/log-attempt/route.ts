/**
 * POST /api/auth/log-attempt
 * Records a login attempt (success or failure) for audit + rate limiting.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

// Cap how many audit rows a single IP can create per minute. Protects this
// service-role-backed endpoint from being abused to flood login_attempts.
const MAX_ATTEMPTS_PER_IP_PER_MIN = 20;

function isValidIp(s: string): boolean {
  // IPv4 with octet range check
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(s)) {
    return s.split('.').every((o) => Number(o) <= 255);
  }
  // IPv6 (loose but bounded — enough to reject garbage / log-poisoning strings)
  return s.includes(':') && s.length <= 45 && /^[0-9a-fA-F:]+$/.test(s);
}

/**
 * Resolve the client IP without trusting attacker-controlled headers blindly.
 * Prefer x-real-ip (set by the Vercel edge), fall back to the first
 * x-forwarded-for hop, and only accept it if it is a syntactically valid IP.
 * Returns null when nothing trustworthy is available (stored as NULL, not a
 * spoofable placeholder).
 */
function parseClientIp(req: NextRequest): string | null {
  const candidates = [
    req.headers.get('x-real-ip'),
    req.headers.get('x-forwarded-for')?.split(',')[0],
  ];
  for (const c of candidates) {
    const ip = c?.trim();
    if (ip && isValidIp(ip)) return ip;
  }
  return null;
}

export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const supabase = createAdminClient();
  const ip = parseClientIp(req);

  // Rate limit by IP. Drop silently (still 200) so the login UX is unaffected.
  if (ip) {
    const since = new Date(Date.now() - 60_000).toISOString();
    const { count } = await supabase
      .from('login_attempts')
      .select('id', { count: 'exact', head: true })
      .eq('ip_address', ip)
      .gte('created_at', since);
    if ((count ?? 0) >= MAX_ATTEMPTS_PER_IP_PER_MIN) {
      return NextResponse.json({ ok: true, throttled: true });
    }
  }

  // Bound stored values to prevent log poisoning with oversized inputs.
  await supabase.from('login_attempts').insert({
    email: (body.email || '').toString().toLowerCase().slice(0, 320) || null,
    success: !!body.success,
    ip_address: ip,
    user_agent: (req.headers.get('user-agent') || '').slice(0, 500) || null,
    failure_reason: (body.reason || '').toString().slice(0, 500) || null,
  });

  return NextResponse.json({ ok: true });
}
