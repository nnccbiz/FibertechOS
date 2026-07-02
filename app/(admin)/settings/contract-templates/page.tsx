/**
 * Admin: contract-terms template library.
 * Manage the master templates that quotes pick from. Sent quotes snapshot
 * their resolved terms — editing a template doesn't change issued quotes.
 */
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import ContractTemplatesEditor from '@/components/admin/ContractTemplatesEditor';

export const dynamic = 'force-dynamic';

export default async function ContractTemplatesPage() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect('/login');

  const { data: templates } = await sb
    .from('contract_term_templates')
    .select('id, name, description, is_default, content, created_at, updated_at')
    .order('is_default', { ascending: false })
    .order('name');

  return (
    <div className="min-h-screen bg-[#f0f4f8]" dir="rtl">
      <header className="bg-white border-b border-[#e2e8f0] px-6 py-4 sticky top-0 z-10">
        <div className="max-w-[1400px] mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-800">📜 תבניות תנאי הסכם</h1>
            <p className="text-[12px] text-gray-500">מאגר תבניות לבחירה בהצעות מחיר</p>
          </div>
          <Link href="/" className="text-sm text-[#1a56db] hover:underline">← חזרה</Link>
        </div>
      </header>
      <div className="max-w-[1400px] mx-auto px-6 py-6">
        <ContractTemplatesEditor templates={templates || []} />
      </div>
    </div>
  );
}
