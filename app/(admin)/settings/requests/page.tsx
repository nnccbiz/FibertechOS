/**
 * Admin page: pending access requests.
 * Visible only to admins (enforced by RLS + by the API route).
 */
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import PendingRequestsList from '@/components/admin/PendingRequestsList';
import Icon from '@/components/ui/Icon';

export const dynamic = 'force-dynamic';

export default async function RequestsPage() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect('/login');

  const { data: isAdmin } = await sb.rpc('is_admin');
  if (!isAdmin) redirect('/');

  const { data: requests } = await sb
    .from('v_pending_access_requests')
    .select('*');

  return (
    <div dir="rtl" className="min-h-screen bg-surface-page">
      <header className="bg-white border-b border-line-subtle px-5 py-4 sticky top-0 z-30">
        <div className="max-w-6xl mx-auto">
          <h1 className="text-2xl font-bold text-content-strong"><Icon name="lock" size={24} /> בקשות גישה ממתינות</h1>
          <p className="text-[13px] text-neutral-400">
            {requests?.length || 0} בקשות ממתינות לאישור
          </p>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 md:px-6 py-6">
        <PendingRequestsList initial={requests || []} />
      </main>
    </div>
  );
}
