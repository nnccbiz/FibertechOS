/**
 * POST /api/access-requests
 * Public endpoint (no auth required). Anyone can submit a request.
 * Server applies rate limits, domain check, duplicate check.
 * Admins are notified by separate flow (email/in-app).
 */
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

function getClientIp(req: NextRequest): string {
  const forwardedFor = req.headers.get('x-forwarded-for');
  if (forwardedFor) return forwardedFor.split(',')[0].trim();
  return req.headers.get('x-real-ip') || '0.0.0.0';
}

export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ code: 'bad_request' }, { status: 400 });
  }

  const email = String(body.email || '').trim().toLowerCase();
  const fullName = String(body.full_name || '').trim();
  const phone = String(body.phone || '').trim() || null;
  const requestedRole = String(body.requested_role || '').trim();

  if (!email || !fullName || !requestedRole) {
    return NextResponse.json({ code: 'bad_request' }, { status: 400 });
  }

  const ip = getClientIp(req);
  const userAgent = req.headers.get('user-agent') || null;

  const supabase = createAdminClient();

  // 1) Run rate-limit / duplicate / domain checks in one SQL function
  const { data: checkData, error: checkError } = await supabase.rpc(
    'can_submit_access_request',
    { p_email: email, p_ip_address: ip }
  );

  if (checkError) {
    console.error('can_submit_access_request error:', checkError);
    return NextResponse.json({ code: 'server_error' }, { status: 500 });
  }

  const code: string = checkData || '';
  if (code !== '') {
    return NextResponse.json(
      { code, ok: false },
      { status: code === 'ip_rate_limit' || code === 'global_rate_limit' ? 429 : 400 }
    );
  }

  // 2) Insert the request
  const { error: insertError } = await supabase
    .from('access_requests')
    .insert({
      email,
      full_name: fullName,
      requested_role: requestedRole,
      phone,
      ip_address: ip,
      user_agent: userAgent,
    });

  if (insertError) {
    console.error('insert access_request error:', insertError);
    return NextResponse.json({ code: 'server_error' }, { status: 500 });
  }

  // 3) TODO: Send notification email to admins
  //    We will wire this up in a follow-up task using the pg_notify hook or
  //    an email service (Resend/SendGrid). For now, admins will see the
  //    request in the /settings/requests page.

  return NextResponse.json({ ok: true });
}
