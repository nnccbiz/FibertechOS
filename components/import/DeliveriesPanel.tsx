'use client';

/**
 * Customer delivery certificates for an import order — the "money loop":
 * create a certificate (auto-filled from a container's packing lines), get it
 * signed (scan upload / on-site SignaturePad / remote customer link), send an
 * invoice instruction to bookkeeping, and track until the invoice is issued.
 */
import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import SignaturePad from '@/components/ui/SignaturePad';
import Icon from '@/components/ui/Icon';

function fmtDate(d: string | null) {
  return d ? new Date(d).toLocaleDateString('he-IL') : '—';
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [meta, b64] = dataUrl.split(',');
  const mime = meta.match(/data:(.*?);/)?.[1] || 'image/png';
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

export default function DeliveriesPanel({ order, data, canEdit, onUpdate }: any) {
  const supabase = createClient();
  const deliveries = (data.custDeliv || []).filter((d: any) => d.import_order_id === order.id);
  const packing = (data.packing || []).filter((p: any) => p.import_order_id === order.id);
  const containersById: Record<string, any> = useMemo(() => {
    const m: Record<string, any> = {};
    (data.containers || []).forEach((c: any) => { m[c.id] = c; });
    return m;
  }, [data.containers]);
  const orderContainers = useMemo(() => {
    const ids = Array.from(new Set(packing.map((p: any) => p.container_id).filter(Boolean)));
    return ids.map((id: any) => containersById[id]).filter(Boolean);
  }, [packing, containersById]);

  const [showCreate, setShowCreate] = useState(false);
  const [signFor, setSignFor] = useState<any>(null);
  const [sendFor, setSendFor] = useState<any>(null);
  const [shareFor, setShareFor] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  async function openFile(path: string) {
    // Safari: open the tab synchronously, set location after the async call.
    const w = window.open('about:blank', '_blank');
    const { data: s } = await supabase.storage.from('project-files').createSignedUrl(path, 300);
    if (s?.signedUrl) { if (w) w.location.href = s.signedUrl; else window.location.href = s.signedUrl; }
    else w?.close();
  }

  async function uploadSignedScan(delivery: any, file: File) {
    setBusy(true);
    try {
      const path = `deliveries/${delivery.id}/signed_${Date.now()}_${file.name}`;
      const { error: upErr } = await supabase.storage.from('project-files').upload(path, file);
      if (upErr) { alert(`שגיאה בהעלאה: ${upErr.message}`); return; }
      await supabase.from('import_customer_deliveries')
        .update({ signed: true, signed_file_path: path, signed_at: new Date().toISOString() })
        .eq('id', delivery.id);
      onUpdate();
    } finally { setBusy(false); }
  }

  async function shareLink(delivery: any) {
    let token = delivery.share_token;
    const expires = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();
    if (!token || (delivery.share_expires_at && new Date(delivery.share_expires_at) < new Date())) {
      token = (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, '');
      const { error } = await supabase.from('import_customer_deliveries')
        .update({ share_token: token, share_expires_at: expires }).eq('id', delivery.id);
      if (error) { alert(`שגיאה: ${error.message}`); return; }
      onUpdate();
    } else {
      await supabase.from('import_customer_deliveries').update({ share_expires_at: expires }).eq('id', delivery.id);
    }
    setShareFor({ ...delivery, share_token: token });
  }

  async function markInvoice(delivery: any) {
    const num = prompt('מספר החשבונית שהופקה:');
    if (!num?.trim()) return;
    await supabase.from('import_customer_deliveries')
      .update({ invoice_issued: true, invoice_number: num.trim(), invoice_issued_at: new Date().toISOString() })
      .eq('id', delivery.id);
    onUpdate();
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-[11px] text-neutral-400">תעודת משלוח נחתמת (סריקה / בשטח / קישור ללקוח) ואז נשלחת להנה"ח להפקת חשבונית.</p>
        {canEdit && (
          <button onClick={() => setShowCreate(true)} className="text-[12px] bg-primary text-white px-3 py-1.5 rounded-lg hover:bg-primary-700">
            <Icon name="add" size={14} /> תעודת משלוח
          </button>
        )}
      </div>

      {deliveries.length === 0 && <p className="text-[13px] text-neutral-400 py-2">אין תעודות משלוח</p>}

      <div className="space-y-2">
        {deliveries.map((d: any) => (
          <div key={d.id} className="bg-white border border-line-subtle rounded-lg px-3 py-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-[13px]">
                <span className="font-semibold text-content-body" dir="ltr"><Icon name="invoice" size={14} /> {d.delivery_note_number || '—'}</span>
                <span className="text-content-muted">{fmtDate(d.delivery_date)}</span>
                {d.container_id && containersById[d.container_id] && (
                  <span className="text-neutral-400" dir="ltr"><Icon name="package" size={12} /> {containersById[d.container_id].container_number}</span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                {d.signed
                  ? <span className="px-2 py-0.5 rounded-full bg-success-soft text-success font-semibold"><Icon name="confirm" size={11} /> חתומה{d.signer_name ? ` · ${d.signer_name}` : ''}</span>
                  : <span className="px-2 py-0.5 rounded-full bg-warning-soft text-warning font-semibold">ממתינה לחתימה</span>}
                {d.sent_to_accounting && !d.invoice_issued && <span className="px-2 py-0.5 rounded-full bg-azure-100 text-azure-600 font-semibold">אצל הנה"ח</span>}
                {d.invoice_issued && <span className="px-2 py-0.5 rounded-full bg-success-soft text-success font-semibold" dir="ltr">חשבונית {d.invoice_number}</span>}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 mt-2 text-[12px]">
              {d.signed_file_path && <button onClick={() => openFile(d.signed_file_path)} className="text-primary hover:underline"><Icon name="attach" size={12} /> תעודה חתומה</button>}
              {d.signature_file_path && <button onClick={() => openFile(d.signature_file_path)} className="text-primary hover:underline"><Icon name="edit" size={12} /> חתימה דיגיטלית</button>}
              {canEdit && !d.signed && (
                <>
                  <label className="text-azure-600 hover:underline cursor-pointer">
                    <Icon name="upload" size={12} /> העלה תעודה חתומה
                    <input type="file" className="hidden" accept=".pdf,.png,.jpg,.jpeg" disabled={busy}
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadSignedScan(d, f); e.target.value = ''; }} />
                  </label>
                  <button onClick={() => setSignFor(d)} className="text-azure-600 hover:underline"><Icon name="edit" size={12} /> החתם בשטח</button>
                  <button onClick={() => shareLink(d)} className="text-azure-600 hover:underline"><Icon name="link" size={12} /> שלח ללקוח לחתימה</button>
                </>
              )}
              {canEdit && d.signed && !d.sent_to_accounting && (
                <button onClick={() => setSendFor(d)} className="font-semibold text-primary hover:underline"><Icon name="send" size={12} /> שלח להנה"ח להפקת חשבונית</button>
              )}
              {canEdit && d.sent_to_accounting && !d.invoice_issued && (
                <button onClick={() => markInvoice(d)} className="font-semibold text-success hover:underline"><Icon name="confirm" size={12} /> חשבונית הופקה</button>
              )}
            </div>
          </div>
        ))}
      </div>

      {showCreate && (
        <CreateDeliveryModal
          order={order} packing={packing} containersById={containersById} orderContainers={orderContainers}
          onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); onUpdate(); }}
        />
      )}
      {signFor && <FieldSignModal delivery={signFor} onClose={() => setSignFor(null)} onSigned={() => { setSignFor(null); onUpdate(); }} />}
      {sendFor && <SendToAccountingModal delivery={sendFor} order={order} onClose={() => setSendFor(null)} onSent={() => { setSendFor(null); onUpdate(); }} />}
      {shareFor && <ShareLinkModal delivery={shareFor} onClose={() => setShareFor(null)} />}
    </div>
  );
}

// --- Create ---
function CreateDeliveryModal({ order, packing, containersById, orderContainers, onClose, onCreated }: any) {
  const supabase = createClient();
  const [containerId, setContainerId] = useState<string>('');
  const [noteNumber, setNoteNumber] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [customer, setCustomer] = useState(order.projects?.client_name || '');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  // Auto-fill from the container's packing lines (the import data).
  const containerLines = useMemo(
    () => (containerId ? packing.filter((p: any) => p.container_id === containerId) : []),
    [containerId, packing],
  );
  useEffect(() => {
    if (!containerId) return;
    const withNote = containerLines.find((p: any) => p.delivery_note_no);
    if (withNote && !noteNumber) setNoteNumber(String(withNote.delivery_note_no));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerId]);

  async function save() {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const items = containerLines.map((p: any) => ({
        description: p.material_description || p.description || null,
        dn: p.dn || null,
        qty: p.shipped_qty ?? null,
        unit: p.unit || '',
      }));
      const totalQty = containerLines.reduce((s: number, p: any) => s + (Number(p.shipped_qty) || 0), 0);
      const summary = containerId && containersById[containerId]
        ? `מכולה ${containersById[containerId].container_number} · ${containerLines.length} שורות · ${totalQty} יח'/מ'`
        : '';
      const { error } = await supabase.from('import_customer_deliveries').insert({
        import_order_id: order.id,
        project_id: order.project_id || null,
        container_id: containerId || null,
        delivery_note_number: noteNumber.trim() || null,
        delivery_date: date || null,
        customer_name: customer.trim() || null,
        items: items.length ? items : null,
        quantity_summary: summary || null,
        notes: notes.trim() || null,
        signed: false, sent_to_accounting: false, invoice_issued: false,
        created_by: user?.id || null,
      });
      if (error) { alert(`שגיאה: ${error.message}`); return; }
      onCreated();
    } finally { setSaving(false); }
  }

  return (
    <Modal title="תעודת משלוח חדשה" onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className="block text-[12px] font-medium text-content-body mb-1">מכולה (מילוי אוטומטי של הפריטים)</label>
          <select value={containerId} onChange={(e) => setContainerId(e.target.value)} className="w-full text-[13px] border border-line-subtle rounded-lg px-2 py-1.5">
            <option value="">ללא מכולה (ידני)</option>
            {orderContainers.map((c: any) => <option key={c.id} value={c.id}>{c.container_number}{c.seal_number ? ` · חותם ${c.seal_number}` : ''}</option>)}
          </select>
        </div>
        {containerLines.length > 0 && (
          <div className="bg-neutral-50 rounded-lg p-2 text-[12px] text-content-body max-h-32 overflow-y-auto">
            {containerLines.map((p: any, i: number) => (
              <div key={i} dir="ltr" className="text-right">{p.dn ? `DN${p.dn}` : ''} × {p.shipped_qty}{p.unit || ''}{p.delivery_note_no ? ` · ת.משלוח ${p.delivery_note_no}` : ''}</div>
            ))}
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-[12px] font-medium text-content-body mb-1">מס' תעודה</label>
            <input value={noteNumber} onChange={(e) => setNoteNumber(e.target.value)} dir="ltr" className="w-full text-[13px] border border-line-subtle rounded-lg px-2 py-1.5" />
          </div>
          <div>
            <label className="block text-[12px] font-medium text-content-body mb-1">תאריך אספקה</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full text-[13px] border border-line-subtle rounded-lg px-2 py-1.5" />
          </div>
        </div>
        <div>
          <label className="block text-[12px] font-medium text-content-body mb-1">לקוח / אתר</label>
          <input value={customer} onChange={(e) => setCustomer(e.target.value)} className="w-full text-[13px] border border-line-subtle rounded-lg px-2 py-1.5" />
        </div>
        <div>
          <label className="block text-[12px] font-medium text-content-body mb-1">הערות</label>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full text-[13px] border border-line-subtle rounded-lg px-2 py-1.5" />
        </div>
        <button onClick={save} disabled={saving} className="w-full bg-primary text-white text-sm font-semibold py-2 rounded-lg hover:bg-primary-700 disabled:opacity-50">
          {saving ? 'שומר…' : 'צור תעודה'}
        </button>
      </div>
    </Modal>
  );
}

// --- Field signing (on-site, SignaturePad) ---
function FieldSignModal({ delivery, onClose, onSigned }: any) {
  const supabase = createClient();
  const [signerName, setSignerName] = useState('');
  const [signature, setSignature] = useState('');
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!signerName.trim() || !signature) return;
    setSaving(true);
    try {
      const path = `deliveries/${delivery.id}/signature_${Date.now()}.png`;
      const { error: upErr } = await supabase.storage.from('project-files').upload(path, dataUrlToBlob(signature), { contentType: 'image/png' });
      if (upErr) { alert(`שגיאה: ${upErr.message}`); return; }
      const { error } = await supabase.from('import_customer_deliveries').update({
        signed: true, signer_name: signerName.trim(), signed_at: new Date().toISOString(), signature_file_path: path,
      }).eq('id', delivery.id);
      if (error) { alert(`שגיאה: ${error.message}`); return; }
      onSigned();
    } finally { setSaving(false); }
  }

  return (
    <Modal title={`החתמת לקוח — תעודה ${delivery.delivery_note_number || ''}`} onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className="block text-[12px] font-medium text-content-body mb-1">שם החותם *</label>
          <input value={signerName} onChange={(e) => setSignerName(e.target.value)} className="w-full text-[13px] border border-line-subtle rounded-lg px-2 py-1.5" placeholder="שם ותפקיד" />
        </div>
        <SignaturePad label="חתימת הלקוח *" onSave={setSignature} />
        {signature && <p className="text-[12px] text-success"><Icon name="confirm" size={12} /> החתימה נקלטה</p>}
        <button onClick={save} disabled={!signerName.trim() || !signature || saving} className="w-full bg-primary text-white text-sm font-semibold py-2 rounded-lg hover:bg-primary-700 disabled:opacity-40">
          {saving ? 'שומר…' : 'שמור חתימה'}
        </button>
      </div>
    </Modal>
  );
}

// --- Send to accounting (Miri) ---
function SendToAccountingModal({ delivery, order, onClose, onSent }: any) {
  const supabase = createClient();
  const [team, setTeam] = useState<any[]>([]);
  const [assignee, setAssignee] = useState('');
  const [hasSignedOrder, setHasSignedOrder] = useState<boolean | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: members } = await supabase.from('team_members').select('id, name, role').eq('active', true).order('name');
      setTeam(members || []);
      const miri = (members || []).find((m: any) => m.name.includes('מירי'));
      if (miri) setAssignee(miri.id);
      // Is there a signed order document on the production side of this deal?
      if (order.quote_id) {
        const { data: prodOrders } = await supabase.from('orders').select('id').eq('quote_id', order.quote_id);
        const ids = (prodOrders || []).map((o: any) => o.id);
        if (ids.length) {
          const { data: docs } = await supabase.from('order_documents').select('id').in('order_id', ids).eq('doc_type', 'signed_order').limit(1);
          setHasSignedOrder((docs || []).length > 0);
          return;
        }
      }
      setHasSignedOrder(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function send() {
    setSending(true);
    try {
      const projName = order.projects?.name || '';
      const { error } = await supabase.from('import_customer_deliveries').update({
        sent_to_accounting: true,
        sent_to_accounting_at: new Date().toISOString(),
        accounting_assignee: assignee || null,
      }).eq('id', delivery.id);
      if (error) { alert(`שגיאה: ${error.message}`); return; }
      await supabase.from('alerts').insert({
        project_id: delivery.project_id || order.project_id || null,
        type: 'task',
        message: `להפיק חשבונית: תעודת משלוח ${delivery.delivery_note_number || ''}${projName ? ` — פרויקט ${projName}` : ''}. התעודה החתומה וההזמנה החתומה זמינות במסך תעודות משלוח (/deliveries).`,
        is_resolved: false,
        assigned_to: assignee || null,
      });
      onSent();
    } finally { setSending(false); }
  }

  return (
    <Modal title="שליחה להנהלת חשבונות" onClose={onClose}>
      <div className="space-y-3">
        <div className="bg-neutral-50 rounded-lg p-3 text-[13px] space-y-1.5">
          <p className={delivery.signed ? 'text-success' : 'text-danger'}>
            <Icon name={delivery.signed ? 'success' : 'warning'} size={14} /> תעודת משלוח חתומה {delivery.signed ? '— מצורפת' : '— חסרה!'}
          </p>
          <p className={hasSignedOrder ? 'text-success' : 'text-warning'}>
            <Icon name={hasSignedOrder ? 'success' : 'warning'} size={14} /> הזמנה חתומה {hasSignedOrder == null ? '— בודק…' : hasSignedOrder ? '— קיימת במערכת (מסך ייצור)' : '— לא נמצאה במערכת'}
          </p>
        </div>
        <div>
          <label className="block text-[12px] font-medium text-content-body mb-1">נמען בהנה"ח</label>
          <select value={assignee} onChange={(e) => setAssignee(e.target.value)} className="w-full text-[13px] border border-line-subtle rounded-lg px-2 py-1.5">
            <option value="">— בחר —</option>
            {team.map((m) => <option key={m.id} value={m.id}>{m.name}{m.role ? ` (${m.role})` : ''}</option>)}
          </select>
        </div>
        <p className="text-[12px] text-content-muted">תיווצר משימה בלוח הבקרה עם הפניה לתעודה החתומה ולהזמנה החתומה.</p>
        <button onClick={send} disabled={!assignee || sending} className="w-full bg-primary text-white text-sm font-semibold py-2 rounded-lg hover:bg-primary-700 disabled:opacity-40">
          {sending ? 'שולח…' : 'שלח הוראת חיוב'}
        </button>
      </div>
    </Modal>
  );
}

// --- Share link ---
function ShareLinkModal({ delivery, onClose }: any) {
  const link = `${typeof window !== 'undefined' ? window.location.origin : ''}/delivery/${delivery.share_token}`;
  const [copied, setCopied] = useState(false);
  const wa = `https://wa.me/?text=${encodeURIComponent(`שלום, מצורפת תעודת משלוח ${delivery.delivery_note_number || ''} מפיברטק תשתיות לחתימתכם:\n${link}`)}`;
  return (
    <Modal title="קישור לחתימת הלקוח" onClose={onClose}>
      <div className="space-y-3">
        <p className="text-[13px] text-content-body">הלקוח יפתח את הקישור, יראה את התעודה עם פרטי המכולה והפריטים, יחתום — והחתימה תחזור אליך אוטומטית (כולל התראה בלוח הבקרה).</p>
        <div className="bg-neutral-50 rounded-lg p-2 text-[12px] break-all" dir="ltr">{link}</div>
        <div className="flex gap-2">
          <button
            onClick={() => { navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
            className="flex-1 bg-primary text-white text-sm font-semibold py-2 rounded-lg hover:bg-primary-700"
          >
            {copied ? <><Icon name="confirm" size={14} /> הועתק</> : <><Icon name="copy" size={14} /> העתק קישור</>}
          </button>
          <a href={wa} target="_blank" rel="noopener noreferrer" className="flex-1 text-center bg-success text-white text-sm font-semibold py-2 rounded-lg hover:opacity-90">
            <Icon name="whatsapp" size={14} /> שלח בוואטסאפ
          </a>
        </div>
        <p className="text-[11px] text-neutral-400">הקישור תקף ל-30 יום ונחסם אוטומטית אחרי החתימה.</p>
      </div>
    </Modal>
  );
}

function Modal({ title, children, onClose }: any) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-[92vw] max-w-[440px] max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()} dir="rtl">
        <div className="px-4 py-3 border-b border-line-subtle flex items-center justify-between">
          <h3 className="text-base font-bold text-content-strong">{title}</h3>
          <button onClick={onClose} className="text-neutral-400 hover:text-content-body"><Icon name="close" size={18} /></button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}
