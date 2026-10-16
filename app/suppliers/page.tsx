'use client';

/**
 * Suppliers master — the one place to add and maintain the suppliers that POs,
 * shipments and supplier quotes point at. Cells are edited in place
 * (EditableCell); a supplier is never deleted, only marked inactive, which
 * hides it from the procurement/import pickers but keeps every existing link.
 * RLS: read with projects/import view, write with import or settings edit.
 */
import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { usePermissions } from '@/lib/auth/permissions-context';
import Icon from '@/components/ui/Icon';
import SectionTabs from '@/components/ui/SectionTabs';
import EditableCell from '@/components/ui/EditableCell';
import { LOGISTICS_TABS } from '@/lib/nav';

const CURRENCIES = ['USD', 'EUR', 'GBP', 'ILS'].map((c) => ({ value: c, label: c }));
const BLANK = { name: '', contact_name: '', currency: 'USD', email: '', phone: '' };

const norm = (s: string | null | undefined) => (s || '').trim().toLowerCase();

export default function SuppliersPage() {
  const supabase = createClient();
  const { canAccess } = usePermissions();
  const canEdit = canAccess('import', 'edit') || canAccess('settings', 'edit');
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [orderCounts, setOrderCounts] = useState<Record<string, number>>({});
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ ...BLANK });
  const [savingNew, setSavingNew] = useState(false);
  const [showInactive, setShowInactive] = useState(false);
  const [loading, setLoading] = useState(true);

  async function load() {
    const [{ data: sup }, { data: orders }] = await Promise.all([
      supabase.from('suppliers').select('*').order('name'),
      supabase.from('import_orders').select('supplier_id, status'),
    ]);
    setSuppliers(sup || []);
    const counts: Record<string, number> = {};
    (orders || []).forEach((o: any) => {
      if (o.supplier_id && o.status !== 'cancelled') counts[o.supplier_id] = (counts[o.supplier_id] || 0) + 1;
    });
    setOrderCounts(counts);
    setLoading(false);
  }
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const filtered = useMemo(() => {
    const t = norm(q);
    if (!t) return suppliers;
    return suppliers.filter((s) => [s.name, s.contact_name, s.email, s.phone].some((v) => norm(v).includes(t)));
  }, [suppliers, q]);
  const active = filtered.filter((s) => s.active !== false);
  const inactive = filtered.filter((s) => s.active === false);

  async function saveField(s: any, field: string, raw: string): Promise<string | null> {
    const value = raw.trim() || null;
    if (field === 'name') {
      if (!value) return 'שם ספק הוא שדה חובה';
      const dup = suppliers.find((o) => o.id !== s.id && norm(o.name) === norm(value));
      if (dup) return `כבר קיים ספק בשם "${dup.name}"`;
    }
    const { error } = await supabase.from('suppliers').update({ [field]: value }).eq('id', s.id);
    if (error) return error.message;
    setSuppliers((list) => list.map((o) => (o.id === s.id ? { ...o, [field]: value } : o)));
    return null;
  }

  async function toggleActive(s: any) {
    const next = s.active === false;
    if (!next && !confirm(`לסמן את "${s.name}" כלא פעיל?\nהספק לא יופיע יותר בבחירת ספק בהזמנות חדשות. הזמנות קיימות לא ישתנו.`)) return;
    const { error } = await supabase.from('suppliers').update({ active: next }).eq('id', s.id);
    if (error) { alert('שגיאה בשמירה: ' + error.message); return; }
    setSuppliers((list) => list.map((o) => (o.id === s.id ? { ...o, active: next } : o)));
  }

  async function addSupplier() {
    const name = draft.name.trim();
    if (!name) { alert('שם ספק הוא שדה חובה'); return; }
    const dup = suppliers.find((o) => norm(o.name) === norm(name));
    if (dup) {
      alert(`כבר קיים ספק בשם "${dup.name}"${dup.active === false ? ' (לא פעיל — אפשר להחזיר אותו לפעיל)' : ''}.`);
      return;
    }
    setSavingNew(true);
    const row = {
      name,
      contact_name: draft.contact_name.trim() || null,
      currency: draft.currency,
      email: draft.email.trim() || null,
      phone: draft.phone.trim() || null,
      active: true,
    };
    const { data, error } = await supabase.from('suppliers').insert(row).select('*').single();
    setSavingNew(false);
    if (error) { alert('שגיאה בשמירה: ' + error.message); return; }
    setSuppliers((list) => [...list, data].sort((a, b) => (a.name || '').localeCompare(b.name || '')));
    setDraft({ ...BLANK });
    setAdding(false);
  }

  const inp = 'w-full border border-line-strong rounded px-2 py-1 text-sm focus:outline-none focus:border-primary';

  function row(s: any) {
    const off = s.active === false;
    const cell = (field: string, opts: { ltr?: boolean; width?: string; placeholder?: string } = {}) => (
      <EditableCell
        value={s[field] || ''}
        canEdit={canEdit}
        ltr={opts.ltr}
        width={opts.width || 'w-40'}
        placeholder={opts.placeholder}
        onSave={(v) => saveField(s, field, v)}
      />
    );
    return (
      <tr key={s.id} className={`border-b border-line-subtle ${off ? 'text-content-muted bg-neutral-50' : ''}`}>
        <td className="py-2 px-3 font-medium" dir="ltr">{cell('name', { ltr: true, width: 'w-64' })}</td>
        <td className="py-2 px-3">{cell('contact_name', { placeholder: 'איש קשר' })}</td>
        <td className="py-2 px-3">
          <EditableCell value={s.currency || ''} type="select" options={CURRENCIES} canEdit={canEdit}
            onSave={(v) => saveField(s, 'currency', v)} />
        </td>
        <td className="py-2 px-3">
          {canEdit ? cell('email', { ltr: true, width: 'w-56', placeholder: 'מייל' })
            : s.email ? <a href={`mailto:${s.email}`} dir="ltr" className="text-azure hover:underline">{s.email}</a> : null}
        </td>
        <td className="py-2 px-3">
          {canEdit ? cell('phone', { ltr: true, placeholder: 'טלפון' })
            : s.phone ? <a href={`tel:${s.phone.replace(/[^\d+]/g, '')}`} dir="ltr" className="text-azure hover:underline">{s.phone}</a> : null}
        </td>
        <td className="py-2 px-3 text-center font-mono">{orderCounts[s.id] || 0}</td>
        <td className="py-2 px-3">
          {canEdit ? (
            <button onClick={() => toggleActive(s)}
              className={`text-xs px-2 py-0.5 rounded-pill border ${off ? 'border-line-strong text-content-muted hover:bg-success-soft hover:text-success' : 'border-success text-success bg-success-soft hover:bg-neutral-100'}`}
              title={off ? 'החזר לפעיל' : 'סמן כלא פעיל'}>
              {off ? 'לא פעיל' : 'פעיל'}
            </button>
          ) : (
            <span className={`text-xs ${off ? 'text-content-muted' : 'text-success'}`}>{off ? 'לא פעיל' : 'פעיל'}</span>
          )}
        </td>
      </tr>
    );
  }

  const head = (
    <thead>
      <tr className="bg-neutral-50 text-content-muted text-xs border-b border-line-subtle">
        <th className="py-2 px-3 text-right font-medium">שם ספק</th>
        <th className="py-2 px-3 text-right font-medium">איש קשר</th>
        <th className="py-2 px-3 text-right font-medium">מטבע</th>
        <th className="py-2 px-3 text-right font-medium">מייל</th>
        <th className="py-2 px-3 text-right font-medium">טלפון</th>
        <th className="py-2 px-3 text-center font-medium">הזמנות</th>
        <th className="py-2 px-3 text-right font-medium">סטטוס</th>
      </tr>
    </thead>
  );

  return (
    <div className="p-6 max-w-6xl mx-auto" dir="rtl">
      <SectionTabs tabs={LOGISTICS_TABS} />
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-content-strong"><Icon name="company" size={24} /> ספקים</h1>
          <p className="text-sm text-content-muted mt-1">
            {canEdit ? 'לחץ על תא כדי לערוך · ספק לא נמחק — מסמנים "לא פעיל"' : 'רשימת הספקים של הזמנות הרכש והיבוא'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="חיפוש שם / איש קשר / מייל"
              className="border border-line-strong rounded-md px-3 py-1.5 text-sm w-60 focus:outline-none focus:border-primary" />
          </div>
          {canEdit && !adding && (
            <button onClick={() => setAdding(true)}
              className="bg-primary text-white text-sm px-3 py-1.5 rounded-md hover:bg-primary-700 inline-flex items-center gap-1">
              <Icon name="add" size={16} /> ספק חדש
            </button>
          )}
        </div>
      </div>

      <div className="bg-white border border-line-subtle rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          {head}
          <tbody>
            {adding && (
              <tr className="border-b border-line-subtle bg-primary-50">
                <td className="py-2 px-3"><input autoFocus dir="ltr" className={inp} placeholder="שם ספק *" value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  onKeyDown={(e) => { if (e.key === 'Enter') addSupplier(); if (e.key === 'Escape') { setAdding(false); setDraft({ ...BLANK }); } }} /></td>
                <td className="py-2 px-3"><input className={inp} placeholder="איש קשר" value={draft.contact_name}
                  onChange={(e) => setDraft({ ...draft, contact_name: e.target.value })} /></td>
                <td className="py-2 px-3">
                  <select className={inp} value={draft.currency} onChange={(e) => setDraft({ ...draft, currency: e.target.value })}>
                    {CURRENCIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </td>
                <td className="py-2 px-3"><input dir="ltr" className={inp} placeholder="מייל" value={draft.email}
                  onChange={(e) => setDraft({ ...draft, email: e.target.value })} /></td>
                <td className="py-2 px-3"><input dir="ltr" className={inp} placeholder="טלפון" value={draft.phone}
                  onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
                  onKeyDown={(e) => { if (e.key === 'Enter') addSupplier(); }} /></td>
                <td colSpan={2} className="py-2 px-3 whitespace-nowrap">
                  <button disabled={savingNew} onClick={addSupplier}
                    className="bg-primary text-white text-xs px-3 py-1 rounded hover:bg-primary-700 disabled:opacity-50">
                    {savingNew ? 'שומר…' : 'שמור'}
                  </button>
                  <button onClick={() => { setAdding(false); setDraft({ ...BLANK }); }}
                    className="text-xs text-content-muted px-2 py-1 hover:text-content-strong">ביטול</button>
                </td>
              </tr>
            )}
            {loading && <tr><td colSpan={7} className="py-6 text-center text-content-muted">טוען…</td></tr>}
            {!loading && active.length === 0 && !adding && (
              <tr><td colSpan={7} className="py-6 text-center text-content-muted">{q ? 'לא נמצאו ספקים' : 'אין ספקים פעילים'}</td></tr>
            )}
            {active.map(row)}
          </tbody>
        </table>
      </div>

      {inactive.length > 0 && (
        <div className="mt-6">
          <button onClick={() => setShowInactive((v) => !v)}
            className="text-sm text-content-muted hover:text-content-strong inline-flex items-center gap-1">
            <Icon name={showInactive ? 'caretUp' : 'caretDown'} size={14} /> ספקים לא פעילים ({inactive.length})
          </button>
          {showInactive && (
            <div className="mt-2 bg-white border border-line-subtle rounded-lg overflow-x-auto">
              <table className="w-full text-sm">
                {head}
                <tbody>{inactive.map(row)}</tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
