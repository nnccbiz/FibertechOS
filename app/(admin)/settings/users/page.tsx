/**
 * Admin: team members list + permission matrix editor.
 */
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import UserPermissionsEditor from '@/components/admin/UserPermissionsEditor';

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
    <div dir="rtl" className="min-h-screen bg-[#f0f4f8]">
      <header className="bg-white border-b border-[#e2e8f0] px-5 py-4 sticky top-0 z-30">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">👥 ניהול משתמשים</h1>
            <p className="text-[13px] text-gray-400">{members?.length || 0} משתמשים</p>
          </div>
          <Link href="/settings/requests" className="text-sm text-[#1a56db] hover:underline">
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
