/**
 * POST /api/approve-request
 * Admin-only. Approves or declines an access_request.
 * On approval: creates the auth.users row and a matching team_members row,
 *              sends an email invite to set password.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

type Decision = 'approve' | 'decline_suspicious' | 'decline_not_authorized';

export async function POST(req: NextRequest) {
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  // Verify admin
  const { data: isAdmin } = await sb.rpc('is_admin');
  if (!isAdmin) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }

  const requestId: string = body.request_id;
  const decision: Decision = body.decision;
  const notes: string = String(body.notes || '');
  const accessLevel: 'admin' | 'member' | 'viewer' = body.access_level || 'member';
  const permissions: Record<string, string> = body.permissions || {}; // module -> level

  if (!requestId || !decision) {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: reqRow, error: reqErr } = await admin
    .from('access_requests')
    .select('*')
    .eq('id', requestId)
    .eq('status', 'pending')
    .maybeSingle();

  if (reqErr || !reqRow) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  // Identify the admin's team_members.id for audit columns
  const { data: adminTM } = await admin
    .from('team_members')
    .select('id')
    .eq('auth_user_id', user.id)
    .maybeSingle();

  const adminTeamMemberId = adminTM?.id;

  if (decision === 'approve') {
    // 1) Create auth user with a random temporary password; send password setup link
    const { data: createdUser, error: createErr } = await admin.auth.admin.inviteUserByEmail(
      reqRow.email,
      {
        redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/set-password`,
      }
    );

    if (createErr) {
      console.error('invite error:', createErr);
      return NextResponse.json({ error: 'invite_failed', detail: createErr.message }, { status: 500 });
    }

    const authUserId = createdUser?.user?.id;

    // 2) Create a team_members row if none exists for this email
    const { data: existingTM } = await admin
      .from('team_members')
      .select('id')
      .eq('email', reqRow.email)
      .maybeSingle();

    let teamMemberId = existingTM?.id;
    if (!teamMemberId) {
      const { data: newTM, error: tmErr } = await admin
        .from('team_members')
        .insert({
          name: reqRow.full_name,
          role: reqRow.requested_role,
          email: reqRow.email,
          phone: reqRow.phone,
          access_level: accessLevel,
          auth_user_id: authUserId,
          active: true,
        })
        .select('id')
        .single();
      if (tmErr) {
        console.error('team_members insert error:', tmErr);
        return NextResponse.json({ error: 'team_member_insert_failed' }, { status: 500 });
      }
      teamMemberId = newTM.id;
    } else {
      await admin
        .from('team_members')
        .update({ auth_user_id: authUserId, active: true, access_level: accessLevel })
        .eq('id', teamMemberId);
    }

    // 3) Upsert module permissions
    if (teamMemberId) {
      const rows = Object.entries(permissions).map(([module, level]) => ({
        user_id: teamMemberId!,
        module,
        level,
        updated_by: adminTeamMemberId,
      }));
      if (rows.length) {
        await admin
          .from('user_module_permissions')
          .upsert(rows, { onConflict: 'user_id,module' });
      }
    }

    // 4) Mark request as approved
    await admin
      .from('access_requests')
      .update({
        status: 'approved',
        decision_notes: notes,
        decided_by: adminTeamMemberId,
        decided_at: new Date().toISOString(),
        invite_sent_at: new Date().toISOString(),
      })
      .eq('id', requestId);

    return NextResponse.json({ ok: true, team_member_id: teamMemberId });
  }

  // Decline paths
  const status = decision === 'decline_suspicious'
    ? 'declined_suspicious'
    : 'declined_not_authorized';

  await admin
    .from('access_requests')
    .update({
      status,
      decision_notes: notes,
      decided_by: adminTeamMemberId,
      decided_at: new Date().toISOString(),
    })
    .eq('id', requestId);

  return NextResponse.json({ ok: true });
}
