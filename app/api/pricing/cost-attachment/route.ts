/**
 * Cost-input source files (supplier quotes: PDF / image / Excel).
 *
 * POST   — save an uploaded file as an attachment on a cost input.
 * DELETE — remove a cost-input attachment, unless a quote based on that cost
 *          input has already been sent/signed to a customer (audit trail).
 *
 * Why server-side with the admin (service-role) client: the client-side path
 * did the storage upload (allowed for any authenticated user) and then the
 * attachments-row INSERT under RLS. When the row insert failed, the extracted
 * items were kept but the source file was silently lost — leaving an orphan
 * blob and no record (see the "1 קבצי מקור לא נשמרו" warning). Doing both the
 * storage write and the row insert here, atomically, after one auth+permission
 * check, makes the save reliable and orphan-free.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const maxDuration = 30;

const MAX_BYTES = 15 * 1024 * 1024; // 15MB — supplier quotes are small

// Every write here requires the same permission the pricing editor does.
async function requireEditor() {
  const userClient = await createClient();
  const { data: { user }, error } = await userClient.auth.getUser();
  if (error || !user) {
    return { error: NextResponse.json({ error: 'לא מורשה — התחבר מחדש.' }, { status: 401 }) };
  }
  const { data: allowed, error: pErr } = await userClient.rpc('has_module_permission', {
    p_module: 'projects', p_min_level: 'edit',
  });
  if (pErr) return { error: NextResponse.json({ error: pErr.message }, { status: 500 }) };
  if (!allowed) {
    return { error: NextResponse.json({ error: 'אין לך הרשאת עריכה לפרויקטים — בקש מאדמין הרשאה (הגדרות ← משתמשים).' }, { status: 403 }) };
  }
  return { user };
}

export async function POST(req: NextRequest) {
  const guard = await requireEditor();
  if (guard.error) return guard.error;

  const form = await req.formData();
  const file = form.get('file') as File | null;
  const costInputId = String(form.get('costInputId') || '');
  const projectIdIn = String(form.get('projectId') || '') || null;
  if (!file || !costInputId) {
    return NextResponse.json({ error: 'file and costInputId required' }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'הקובץ גדול מדי (מקסימום 15MB).' }, { status: 413 });
  }

  const admin = createAdminClient();
  const { data: ci } = await admin.from('cost_inputs').select('id, project_id').eq('id', costInputId).maybeSingle();
  if (!ci) return NextResponse.json({ error: 'התמחור לא נמצא.' }, { status: 404 });
  const pid = projectIdIn || ci.project_id || null;

  const ext = (file.name.split('.').pop() || 'file').toLowerCase().replace(/[^a-z0-9]/g, '') || 'file';
  const path = `${pid || 'nopid'}/cost_inputs/${costInputId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const { error: upErr } = await admin.storage.from('project-files').upload(path, bytes, {
    contentType: file.type || undefined, upsert: false,
  });
  if (upErr) return NextResponse.json({ error: `שמירת הקובץ נכשלה: ${upErr.message}` }, { status: 500 });

  const { data: att, error: insErr } = await admin.from('attachments').insert({
    entity_type: 'cost_input', entity_id: costInputId, project_id: pid,
    file_name: file.name, file_url: path, file_type: 'supplier_quote', file_size_bytes: file.size,
    uploaded_by: guard.user.id,
  }).select().single();
  if (insErr || !att) {
    // Roll the blob back so a failed insert doesn't leave an orphan.
    await admin.storage.from('project-files').remove([path]);
    return NextResponse.json({ error: `רישום הקובץ נכשל: ${insErr?.message || ''}` }, { status: 500 });
  }
  return NextResponse.json({ attachment: att });
}

export async function DELETE(req: NextRequest) {
  const guard = await requireEditor();
  if (guard.error) return guard.error;

  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const admin = createAdminClient();
  const { data: att } = await admin.from('attachments')
    .select('id, entity_type, entity_id, file_url').eq('id', id).maybeSingle();
  if (!att) return NextResponse.json({ error: 'הקובץ לא נמצא.' }, { status: 404 });
  if (att.entity_type !== 'cost_input') {
    return NextResponse.json({ error: 'לא צרופת תמחור.' }, { status: 400 });
  }

  // Guard: a source file may not be deleted once a quote based on this cost
  // input has been sent or signed — it's part of that offer's paper trail.
  const { data: blocking } = await admin.from('quotes')
    .select('quote_number, status').eq('cost_input_id', att.entity_id).in('status', ['sent', 'signed']);
  if (blocking && blocking.length > 0) {
    const nums = Array.from(new Set(blocking.map((q: any) => q.quote_number))).join(', ');
    return NextResponse.json({
      error: `לא ניתן למחוק — נשלחה/נחתמה הצעת מחיר שמבוססת על תמחור זה (${nums}). המחיקה חסומה כדי לשמור תיעוד.`,
      blocked: true,
    }, { status: 409 });
  }

  const { error: delErr } = await admin.from('attachments').delete().eq('id', id);
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

  // Remove the blob only if no other attachment row still references it
  // (a duplicated cost input reuses the same storage object).
  if (att.file_url) {
    const { data: others } = await admin.from('attachments').select('id').eq('file_url', att.file_url).limit(1);
    if (!others || others.length === 0) await admin.storage.from('project-files').remove([att.file_url]);
  }
  return NextResponse.json({ ok: true });
}
