/**
 * Admin: team members list + permission matrix editor.
 */
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import UserPermissionsEditor from '@/components/admin/UserPermissionsEditor';
import Icon from '@/components/ui/Icon';

export const dynamic = 'force-dynamic';

export default async function UsersPage() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect('/login');
  const { data: isAdmin } = await sb.rpc('is_admin');
  if (!isAdmin) redirect('/');

  const { data: members } = await sb
    .from('team_members')
    .select('id, name, role, email, phone, access_level, active, created_at')
    .order('access_level', { ascending: false })
    .order('name');

  const { data: allPerms } = await sb
    .from('user_module_permissions')
    .select('user_id, module, level');

  return (
    <div dir="rtl" className="min-h-screen bg-surface-page">
      <header className="bg-white border-b border-line-subtle px-5 py-4 sticky top-0 z-30">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-content-strong"><Icon name="team" size={24} /> ניהול משתמשים</h1>
            <p className="text-[13px] text-neutral-400">{members?.length || 0} משתמשים</p>
          </div>
          <Link href="/settings/requests" className="text-sm text-primary hover:underline">
            בקשות ממתינות ←
          </Link>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 md:px-6 py-6">
        <UserPermissionsEditor
          initialMembers={members || []}
          initialPermissions={allPerms || []}
        />
      </main>
    </div>
  );
}
