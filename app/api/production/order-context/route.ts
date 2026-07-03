/**
 * GET /api/production/order-context?orderId=<uuid>
 *
 * Full production hand-off bundle for one order: the linked project's drawings,
 * specs, project_details, pipe_specs, contacts, and delivery dates — so the
 * factory (Hillel) sees everything from /production without opening the project.
 *
 * LIVE-LINK, not a snapshot: a drawing may be revised after signing and before
 * production actually starts, and the factory must build from the CURRENT
 * approved drawing (unlike contract terms, which are frozen on the quote for
 * legal reasons). So this always reflects the project's latest state.
 *
 * Why server-side with the admin client: RLS on attachments / project_details
 * requires the 'projects' module permission, which a production-only user
 * (Hillel) may not have — a live browser query would be RLS-blocked. This route
 * verifies the caller has 'production' view access (least-privilege) and then
 * reads with the service-role client. Signed URLs are minted here so the client
 * can open a file synchronously in an onClick (needed for the Safari popup
 * blocker — see CLAUDE.md §8).
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const orderId = req.nextUrl.searchParams.get('orderId');
  if (!orderId) {
    return NextResponse.json({ error: 'orderId required' }, { status: 400 });
  }

  // 1. Require a session and at least production:view (the route bypasses RLS).
  const userClient = await createClient();
  const { data: { user }, error: authErr } = await userClient.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const { data: allowed, error: permErr } = await userClient.rpc('has_module_permission', {
    p_module: 'production',
    p_min_level: 'view',
  });
  if (permErr) return NextResponse.json({ error: permErr.message }, { status: 500 });
  if (!allowed) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const admin = createAdminClient();

  // 2. Resolve the order's project.
  const { data: order, error: oErr } = await admin
    .from('orders')
    .select('id, project_id')
    .eq('id', orderId)
    .maybeSingle();
  if (oErr) return NextResponse.json({ error: oErr.message }, { status: 500 });
  if (!order) return NextResponse.json({ error: 'order not found' }, { status: 404 });
  if (!order.project_id) {
    return NextResponse.json({ projectId: null, project: null, drawings: [], specs: [], details: null, pipeSpecs: [], contacts: [] });
  }

  const pid = order.project_id;

  // 3. Pull the project's production-relevant data (live).
  const [attRes, detRes, pipeRes, contactRes, projRes] = await Promise.all([
    admin
      .from('attachments')
      .select('id, file_name, file_url, file_type, drawing_number, created_at')
      .eq('project_id', pid)
      .in('file_type', ['drawing', 'spec'])
      .order('created_at'),
    admin.from('project_details').select('*').eq('project_id', pid).maybeSingle(),
    admin.from('pipe_specs').select('*').eq('project_id', pid).order('created_at'),
    admin.from('project_contacts').select('*').eq('project_id', pid),
    admin.from('projects').select('name, client_name, location').eq('id', pid).maybeSingle(),
  ]);

  // 4. Sign each drawing/spec path so the client can open it synchronously.
  const atts = attRes.data || [];
  const signed = await Promise.all(
    atts.map(async (a: any) => {
      const path = a.file_url || '';
      if (!path) return { ...a, signedUrl: null };
      if (path.startsWith('http')) return { ...a, signedUrl: path };
      const { data } = await admin.storage.from('project-files').createSignedUrl(path, 3600);
      return { ...a, signedUrl: data?.signedUrl || null };
    }),
  );

  return NextResponse.json({
    projectId: pid,
    project: projRes.data || null,
    drawings: signed.filter((a) => a.file_type === 'drawing'),
    specs: signed.filter((a) => a.file_type === 'spec'),
    details: detRes.data || null,
    pipeSpecs: pipeRes.data || [],
    contacts: contactRes.data || [],
  });
}
