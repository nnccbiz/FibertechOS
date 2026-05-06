import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { quote_id, expires_days = 3 } = await req.json();
  if (!quote_id) return NextResponse.json({ error: 'quote_id required' }, { status: 400 });

  // Reuse existing valid token if one exists
  const { data: existing } = await supabase
    .from('quote_share_tokens')
    .select('*')
    .eq('quote_id', quote_id)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (existing) {
    return NextResponse.json(existing);
  }

  const expires_at = new Date(Date.now() + expires_days * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase.from('quote_share_tokens').insert({
    quote_id,
    expires_at,
    created_by: user.id,
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data);
}
