import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createHash, timingSafeEqual } from 'node:crypto';

export const runtime = 'nodejs';

/**
 * Constant-time comparison of the incoming webhook secret against the
 * configured one. Both values are SHA-256 hashed first so timingSafeEqual
 * always receives equal-length buffers (it throws on length mismatch, which
 * would otherwise leak length and crash the handler).
 */
function isAuthorized(req: NextRequest): boolean {
  const expected = process.env.QUOTE_WEBHOOK_SECRET;
  if (!expected) return false; // fail closed if not configured

  const provided = req.headers.get('x-webhook-secret') || '';
  const expectedHash = createHash('sha256').update(expected).digest();
  const providedHash = createHash('sha256').update(provided).digest();
  return timingSafeEqual(expectedHash, providedHash);
}

/**
 * POST /api/webhooks/quote-signed
 *
 * Called by Supabase Database Webhook (or from Make.com) when a quote
 * transitions to status='signed'. Triggers a summary email to Miri (Finance)
 * via Make.com webhook.
 *
 * Auth: requires a matching `x-webhook-secret` header (shared secret).
 */
export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  const MAKE_WEBHOOK_URL = process.env.MAKE_WEBHOOK_URL;

  const body = await req.json();
  const { quote_id } = body;

  if (!quote_id) {
    return NextResponse.json({ error: 'quote_id is required' }, { status: 400 });
  }

  // Fetch the quote with project details
  const { data: quote, error: quoteError } = await supabase
    .from('quotes')
    .select(`
      *,
      projects (
        project_name,
        project_number,
        order_value
      )
    `)
    .eq('id', quote_id)
    .single();

  if (quoteError || !quote) {
    return NextResponse.json({ error: 'Quote not found' }, { status: 404 });
  }

  if (quote.status !== 'signed') {
    return NextResponse.json({ error: 'Quote is not signed' }, { status: 400 });
  }

  // Build the finance summary payload
  const payload = {
    event: 'quote_signed',
    quote_number: quote.quote_number,
    project_name: quote.projects?.project_name,
    project_number: quote.projects?.project_number,
    total_amount: quote.total_amount,
    currency: quote.currency,
    signed_at: quote.signed_at,
    signed_by: quote.signed_by,
    order_value: quote.projects?.order_value,
    // Email recipient
    to_email: process.env.FINANCE_EMAIL, // Miri's email
    subject: `הצעת מחיר נחתמה — ${quote.quote_number} — ${quote.projects?.project_name}`,
    summary: [
      `הצעת מחיר ${quote.quote_number} נחתמה.`,
      `פרויקט: ${quote.projects?.project_name} (${quote.projects?.project_number})`,
      `סכום: ${quote.currency} ${quote.total_amount?.toLocaleString()}`,
      `נחתם ע״י: ${quote.signed_by}`,
      `תאריך: ${new Date(quote.signed_at).toLocaleDateString('he-IL')}`,
    ].join('\n'),
  };

  // Trigger Make.com webhook
  if (MAKE_WEBHOOK_URL) {
    const webhookRes = await fetch(MAKE_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!webhookRes.ok) {
      console.error('Make.com webhook failed:', await webhookRes.text());
      return NextResponse.json(
        { error: 'Webhook delivery failed', quote_number: quote.quote_number },
        { status: 502 },
      );
    }
  }

  // Also create an in-app alert for finance users
  const { data: financeUsers } = await supabase
    .from('profiles')
    .select('id')
    .eq('role', 'finance');

  if (financeUsers) {
    const alerts = financeUsers.map((u) => ({
      user_id: u.id,
      project_id: quote.project_id,
      severity: 'critical',
      title: `הצעת מחיר נחתמה — ${quote.quote_number}`,
      message: payload.summary,
      category: 'payment',
    }));

    await supabase.from('alerts').insert(alerts);
  }

  return NextResponse.json({
    success: true,
    quote_number: quote.quote_number,
    webhook_sent: !!MAKE_WEBHOOK_URL,
  });
}
