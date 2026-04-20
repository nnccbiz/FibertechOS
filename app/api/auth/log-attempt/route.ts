/**
 * POST /api/auth/log-attempt
 * Records a login attempt (success or failure) for audit + rate limiting.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

function getIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    req.headers.get('x-real-ip') ||
    '0.0.0.0'
  );
}

export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const supabase = createAdminClient();
  await supabase.from('login_attempts').insert({
    email: (body.email || '').toString().toLowerCase() || null,
    success: !!body.success,
    ip_address: getIp(req),
    user_agent: req.headers.get('user-agent') || null,
    failure_reason: body.reason || null,
  });

  return NextResponse.json({ ok: true });
}
