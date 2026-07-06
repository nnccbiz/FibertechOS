import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

/**
 * Public remote-signing endpoint for customer delivery certificates.
 * No session — access is gated by the unguessable share_token (minted by an
 * import-edit user, expiring). All DB access uses the service-role client;
 * only sanitized certificate fields ever leave this route.
 */

const MAX_BODY_BYTES = 2 * 1024 * 1024; // signature PNG

async function loadByToken(token: string) {
  const admin = createAdminClient();
  const { data: d } = await admin
    .from('import_customer_deliveries')
    .select('id, project_id, container_id, delivery_note_number, delivery_date, quantity_summary, customer_name, items, signed, signer_name, signed_at, share_expires_at, notes')
    .eq('share_token', token)
    .maybeSingle();
  if (!d) return { error: 'קישור לא תקין' as const };
  if (d.share_expires_at && new Date(d.share_expires_at) < new Date()) {
    return { error: 'תוקף הקישור פג — בקשו קישור חדש מפיברטק' as const };
  }
  return { delivery: d, admin };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
    const res = await loadByToken(token);
    if ('error' in res) return NextResponse.json({ error: res.error }, { status: 404 });
    const { delivery, admin } = res;

    const [{ data: proj }, { data: container }] = await Promise.all([
      delivery.project_id
        ? admin.from('projects').select('name').eq('id', delivery.project_id).maybeSingle()
        : Promise.resolve({ data: null } as any),
      delivery.container_id
        ? admin.from('import_containers').select('container_number, seal_number').eq('id', delivery.container_id).maybeSingle()
        : Promise.resolve({ data: null } as any),
    ]);

    return NextResponse.json({
      delivery_note_number: delivery.delivery_note_number,
      delivery_date: delivery.delivery_date,
      quantity_summary: delivery.quantity_summary,
      customer_name: delivery.customer_name,
      items: delivery.items || [],
      notes: delivery.notes,
      signed: delivery.signed,
      signer_name: delivery.signer_name,
      signed_at: delivery.signed_at,
      project_name: proj?.name || null,
      container_number: container?.container_number || null,
      seal_number: container?.seal_number || null,
    });
  } catch (e: any) {
    console.error('[delivery-sign GET]', e?.message);
    return NextResponse.json({ error: 'שגיאה' }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const contentLength = Number(req.headers.get('content-length') || 0);
    if (contentLength > MAX_BODY_BYTES) {
      return NextResponse.json({ error: 'החתימה גדולה מדי.' }, { status: 413 });
    }
    const { token } = await params;
    const res = await loadByToken(token);
    if ('error' in res) return NextResponse.json({ error: res.error }, { status: 404 });
    const { delivery, admin } = res;
    if (delivery.signed) {
      return NextResponse.json({ error: 'התעודה כבר נחתמה.' }, { status: 409 });
    }

    const body = await req.json();
    const signerName = String(body.signer_name || '').trim().slice(0, 120);
    const signature = String(body.signature || '');
    if (!signerName) return NextResponse.json({ error: 'חסר שם החותם.' }, { status: 400 });
    const m = signature.match(/^data:image\/png;base64,([A-Za-z0-9+/=]+)$/);
    if (!m) return NextResponse.json({ error: 'חתימה לא תקינה.' }, { status: 400 });

    const path = `deliveries/${delivery.id}/signature_${Date.now()}.png`;
    const { error: upErr } = await admin.storage
      .from('project-files')
      .upload(path, Buffer.from(m[1], 'base64'), { contentType: 'image/png' });
    if (upErr) throw upErr;

    const { error: updErr } = await admin
      .from('import_customer_deliveries')
      .update({
        signed: true,
        signer_name: signerName,
        signed_at: new Date().toISOString(),
        signature_file_path: path,
        // One-shot link: once signed, the token is spent.
        share_expires_at: new Date().toISOString(),
      })
      .eq('id', delivery.id);
    if (updErr) throw updErr;

    // Notify the team on the dashboard.
    await admin.from('alerts').insert({
      project_id: delivery.project_id,
      type: 'delivery_signed',
      message: `תעודת משלוח ${delivery.delivery_note_number || ''} נחתמה מרחוק ע"י ${signerName} — אפשר לשלוח להנה"ח (מסך תעודות משלוח).`,
      is_resolved: false,
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error('[delivery-sign POST]', e?.message);
    return NextResponse.json({ error: 'שגיאה בשמירת החתימה' }, { status: 500 });
  }
}
