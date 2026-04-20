/**
 * Supabase browser client.
 * Uses the anon/publishable key. RLS policies (migration 003) decide what
 * the authenticated user can actually see.
 */
import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
