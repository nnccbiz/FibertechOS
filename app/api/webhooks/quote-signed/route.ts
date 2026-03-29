import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const MAKE_WEBHOOK_URL = process.env.MAKE_WEBHOOK_URL;

/**
 * POST /api/webhooks/quote-signed
 *
 * Called by Supabase Database Webhook (or from client) when a quote
 * transitions to status='signed'. Triggers a summary email to Miri (Finance)
 * via Make.com webhook.
 */
export async function POST(req: NextRequest) {
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
