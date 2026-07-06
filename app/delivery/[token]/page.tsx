'use client';

/**
 * Public delivery-certificate signing page (no login).
 * The customer opens a token link, sees the certificate — auto-filled with the
 * container and its items from the import data — signs on screen and submits.
 */
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import SignaturePad from '@/components/ui/SignaturePad';
import Icon from '@/components/ui/Icon';

interface DeliveryView {
  delivery_note_number: string | null;
  delivery_date: string | null;
  quantity_summary: string | null;
  customer_name: string | null;
  items: { description?: string; dn?: string | number; qty?: number; unit?: string }[];
  notes: string | null;
  signed: boolean;
  signer_name: string | null;
  signed_at: string | null;
  project_name: string | null;
  container_number: string | null;
  seal_number: string | null;
}

export default function DeliverySignPage() {
  const params = useParams();
  const token = params.token as string;
  const [data, setData] = useState<DeliveryView | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [signerName, setSignerName] = useState('');
  const [signature, setSignature] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/delivery-sign/${token}`);
        const j = await res.json();
        if (!res.ok || j.error) setError(j.error || 'שגיאה');
        else setData(j);
      } catch {
        setError('שגיאת תקשורת — נסו לרענן את הדף');
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  async function submit() {
    if (!signerName.trim() || !signature || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/delivery-sign/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signer_name: signerName.trim(), signature }),
      });
      const j = await res.json();
      if (!res.ok || j.error) setError(j.error || 'שגיאה בשליחה');
      else setDone(true);
    } catch {
      setError('שגיאת תקשורת — נסו שוב');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-neutral-50" dir="rtl">
        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-neutral-50" dir="rtl">
        <div className="bg-white rounded-2xl shadow-lg p-10 text-center max-w-md">
          <div className="mb-3 text-warning"><Icon name="warning" size={40} /></div>
          <h1 className="text-lg font-bold text-content-strong mb-2">{error}</h1>
          <p className="text-sm text-content-muted">פיברטק תשתיות · 09-7929441 · info@fibertech.co.il</p>
        </div>
      </div>
    );
  }

  const d = data!;
  const alreadySigned = d.signed || done;

  return (
    <div className="min-h-screen bg-neutral-100 py-6 px-3" dir="rtl">
      <div className="max-w-[640px] mx-auto bg-white rounded-2xl shadow-lg overflow-hidden">
        {/* Header */}
        <div className="bg-primary text-white px-6 py-4">
          <h1 className="text-xl font-bold">פיברטק תשתיות — תעודת משלוח</h1>
          <p className="text-sm opacity-90" dir="ltr">Fibertech Tashtiyot Ltd.</p>
        </div>

        <div className="p-6 space-y-5">
          {/* Certificate details */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <Field label="מס' תעודה" value={d.delivery_note_number} ltr />
            <Field label="תאריך" value={d.delivery_date ? new Date(d.delivery_date).toLocaleDateString('he-IL') : null} />
            <Field label="פרויקט" value={d.project_name} />
            <Field label="לקוח" value={d.customer_name} />
            {d.container_number && <Field label="מס' מכולה" value={d.container_number} ltr />}
            {d.seal_number && <Field label="חותם" value={d.seal_number} ltr />}
          </div>

          {/* Items */}
          {d.items?.length > 0 && (
            <div>
              <h2 className="text-sm font-bold text-content-body mb-2">פריטים</h2>
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-neutral-50 text-content-muted text-[12px]">
                    <th className="text-right py-1.5 px-2 border border-line-subtle">תיאור</th>
                    <th className="text-center py-1.5 px-2 border border-line-subtle">קוטר</th>
                    <th className="text-center py-1.5 px-2 border border-line-subtle">כמות</th>
                  </tr>
                </thead>
                <tbody>
                  {d.items.map((it, i) => (
                    <tr key={i}>
                      <td className="py-1.5 px-2 border border-line-subtle">{it.description || '—'}</td>
                      <td className="py-1.5 px-2 border border-line-subtle text-center" dir="ltr">{it.dn ? `DN${it.dn}` : '—'}</td>
                      <td className="py-1.5 px-2 border border-line-subtle text-center" dir="ltr">{it.qty ?? '—'}{it.unit ? ` ${it.unit}` : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {d.quantity_summary && !d.items?.length && (
            <Field label="תכולה" value={d.quantity_summary} />
          )}
          {d.notes && <Field label="הערות" value={d.notes} />}

          {/* Signing */}
          {alreadySigned ? (
            <div className="bg-success-soft border border-success rounded-xl p-5 text-center">
              <div className="text-success mb-2"><Icon name="success" size={36} /></div>
              <p className="font-bold text-success">
                {done ? 'תודה! התעודה נחתמה ונשלחה לפיברטק.' : `התעודה נחתמה ע"י ${d.signer_name || ''}`}
              </p>
              {!done && d.signed_at && (
                <p className="text-sm text-success mt-1">{new Date(d.signed_at).toLocaleString('he-IL')}</p>
              )}
            </div>
          ) : (
            <div className="border-t border-line-subtle pt-5 space-y-4">
              <h2 className="text-base font-bold text-content-strong">אישור קבלת הסחורה</h2>
              <p className="text-sm text-content-muted">אני מאשר/ת שקיבלתי את הפריטים המפורטים לעיל במצב תקין.</p>
              <div>
                <label className="block text-sm font-medium text-content-body mb-1">שם מלא של החותם *</label>
                <input
                  type="text"
                  value={signerName}
                  onChange={(e) => setSignerName(e.target.value)}
                  className="w-full border border-line-subtle rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-100"
                  placeholder="שם ותפקיד"
                />
              </div>
              <SignaturePad label="חתימה *" onSave={setSignature} />
              {signature && <p className="text-[12px] text-success"><Icon name="confirm" size={12} /> החתימה נקלטה</p>}
              {error && <p className="text-sm text-danger">{error}</p>}
              <button
                onClick={submit}
                disabled={!signerName.trim() || !signature || submitting}
                className="w-full bg-primary text-white font-bold py-3 rounded-lg hover:bg-primary-700 disabled:opacity-40 transition-colors"
              >
                {submitting ? 'שולח…' : 'חתום ושלח לפיברטק'}
              </button>
            </div>
          )}
        </div>

        <div className="bg-neutral-50 px-6 py-3 text-center text-[12px] text-neutral-400 border-t border-line-subtle">
          פיברטק תשתיות בע״מ · 09-7929441 · info@fibertech.co.il
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, ltr }: { label: string; value: string | null | undefined; ltr?: boolean }) {
  return (
    <div className="bg-neutral-50 rounded-lg px-3 py-2">
      <p className="text-[11px] text-content-muted">{label}</p>
      <p className="text-sm font-semibold text-content-strong" dir={ltr ? 'ltr' : undefined}>{value || '—'}</p>
    </div>
  );
}
