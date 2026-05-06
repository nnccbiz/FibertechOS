import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

function getSupabase() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return (cookieStore as any).getAll(); },
        setAll() {},
      },
    }
  );
}

export async function POST(req: NextRequest) {
  const supabase = getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { quote_id, expires_days = 3 } = await req.json();
  if (!quote_id) return NextResponse.json({ error: 'quote_id required' }, { status: 400 });

  const expires_at = new Date(Date.now() + expires_days * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase.from('quote_share_tokens').insert({
    quote_id,
    expires_at,
    created_by: user.id,
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data);
}
