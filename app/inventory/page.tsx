'use client';

/**
 * Live inventory — derived entirely from the movements ledger (inventory_balance
 * view): purchase receipts add stock, customer delivery certificates remove it.
 * No manual catalog; item identity is the technical spec (category|DN|PN|SN|L).
 * Manual corrections (ספירת מלאי) are movements too, so the ledger stays whole.
 */
import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { usePermissions } from '@/lib/auth/permissions-context';
import Icon, { type IconName } from '@/components/ui/Icon';
import SectionTabs from '@/components/ui/SectionTabs';
import { LOGISTICS_TABS } from '@/lib/nav';
import { itemKey, guessCategory } from '@/lib/inventory';

function fmtDate(d: string | null) {
  return d ? new Date(d).toLocaleDateString('he-IL') : '—';
}
function fmtQty(n: any) {
  const v = Number(n) || 0;
  return Number.isInteger(v) ? v.toLocaleString('he-IL') : v.toLocaleString('he-IL', { maximumFractionDigits: 2 });
}

const CATEGORY_ICONS: Record<string, IconName> = { 'צינורות': 'wrench', 'אביזרים': 'gear', 'חומרי סיכה': 'drop' };
const SOURCE_LABELS: Record<string, string> = {
  purchase_receipt: 'קליטת רכש', delivery: 'תעודת משלוח', manual: 'ידני', production: 'ייצור',
};

export default function InventoryPage() {
  const supabase = createClient();
  const { canAccess } = usePermissions();
  const canEdit = canAccess('inventory', 'edit') || canAccess('import', 'edit');
  const [balance, setBalance] = useState<any[]>([]);
  const [movements, setMovements] = useState<any[]>([]);
  const [projects, setProjects] = useState<Record<string, string>>({});
  const [q, setQ] = useState('');
  const [tab, setTab] = useState<'balance' | 'ledger'>('balance');
  const [showManual, setShowManual] = useState(false);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const [{ data: bal }, { data: mv }, { data: projs }] = await Promise.all([
      supabase.from('inventory_balance').select('*').order('category').order('dn'),
      supabase.from('inventory_movements').select('*').order('created_at', { ascending: false }).limit(100),
      supabase.from('projects').select('id, name'),
    ]);
    setBalance(bal || []);
    setMovements(mv || []);
    const pm: Record<string, string> = {};
    (projs || []).forEach((p: any) => { pm[p.id] = p.name; });
    setProjects(pm);
    setLoading(false);
  }
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const filteredBalance = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return balance;
    return balance.filter((b) =>
      (b.description || '').toLowerCase().includes(t)
      || (b.item_key || '').toLowerCase().includes(t)
      || (b.dn != null && `dn${b.dn}`.includes(t.replace(/\s/g, ''))));
  }, [balance, q]);

  const categoryTotals = useMemo(() => {
    const m: Record<string, number> = {};
    balance.forEach((b) => { m[b.category || 'צינורות'] = (m[b.category || 'צינורות'] || 0) + (Number(b.in_stock) || 0); });
    return m;
  }, [balance]);

  return (
    <div className="p-6 max-w-5xl mx-auto" dir="rtl">
      <SectionTabs tabs={LOGISTICS_TABS} />
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-content-strong"><Icon name="inventory" size={24} /> מלאי</h1>
          <p className="text-sm text-content-muted mt-1">נבנה אוטומטית: קליטת רכש מוסיפה, תעודת משלוח ללקוח מורידה</p>
        </div>
        {canEdit && (
          <button onClick={() => setShowManual(true)} className="text-[13px] bg-primary text-white px-3 py-2 rounded-lg hover:bg-primary-700">
            <Icon name="add" size={14} /> תנועה ידנית (תיקון / ספירה)
          </button>
        )}
      </div>

      {/* Category tiles */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        {['צינורות', 'אביזרים', 'חומרי סיכה'].map((cat) => (
          <div key={cat} className="bg-white rounded-xl border border-line-subtle p-4 text-center">
            <span className="block mb-1 text-primary"><Icon name={CATEGORY_ICONS[cat]} size={24} /></span>
            <p className="text-[12px] text-content-muted font-medium">{cat}</p>
            <p className={`text-xl font-bold mt-0.5 ${(categoryTotals[cat] || 0) < 0 ? 'text-danger' : 'text-content-body'}`}>
              {categoryTotals[cat] ? fmtQty(categoryTotals[cat]) : '—'}
            </p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <button onClick={() => setTab('balance')} className={`text-[12px] px-3 py-1.5 rounded-full border ${tab === 'balance' ? 'bg-primary text-white border-primary' : 'bg-white text-content-body border-line-subtle hover:bg-neutral-50'}`}>
          יתרות ({balance.length})
        </button>
        <button onClick={() => setTab('ledger')} className={`text-[12px] px-3 py-1.5 rounded-full border ${tab === 'ledger' ? 'bg-primary text-white border-primary' : 'bg-white text-content-body border-line-subtle hover:bg-neutral-50'}`}>
          יומן תנועות ({movements.length})
        </button>
        <input
          value={q} onChange={(e) => setQ(e.target.value)} placeholder="חיפוש: תיאור / DN…"
          className="mr-auto text-[13px] border border-line-subtle rounded-lg px-3 py-1.5 w-56 focus:outline-none focus:ring-2 focus:ring-primary-100"
        />
      </div>

      {loading ? (
        <p className="text-neutral-400 text-center py-12">טוען…</p>
      ) : tab === 'balance' ? (
        filteredBalance.length === 0 ? (
          <div className="bg-white rounded-xl border border-line-subtle p-12 text-center">
            <p className="mb-3 text-neutral-300"><Icon name="empty" size={40} /></p>
            <p className="text-content-muted">אין פריטים במלאי עדיין — היתרה נבנית מאישור קליטות רכש במסך היבוא</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-line-subtle overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-line-subtle bg-neutral-50 text-content-muted">
                  <th className="text-right font-medium px-3 py-2">פריט</th>
                  <th className="text-right font-medium px-3 py-2">DN</th>
                  <th className="text-right font-medium px-3 py-2">PN</th>
                  <th className="text-right font-medium px-3 py-2">SN</th>
                  <th className="text-right font-medium px-3 py-2">במלאי</th>
                  <th className="text-right font-medium px-3 py-2">נכנס</th>
                  <th className="text-right font-medium px-3 py-2">יצא</th>
                  <th className="text-right font-medium px-3 py-2">תנועה אחרונה</th>
                </tr>
              </thead>
              <tbody>
                {filteredBalance.map((b) => (
                  <tr key={b.item_key} className="border-b border-line-subtle last:border-0">
                    <td className="px-3 py-2">
                      <span className="text-content-body font-medium" dir="ltr">{b.description || b.item_key}</span>
                      <span className="block text-[11px] text-neutral-400">{b.category}</span>
                    </td>
                    <td className="px-3 py-2 text-content-body" dir="ltr">{b.dn ?? '—'}</td>
                    <td className="px-3 py-2 text-content-body" dir="ltr">{b.pn ?? '—'}</td>
                    <td className="px-3 py-2 text-content-body" dir="ltr">{b.sn ?? '—'}</td>
                    <td className="px-3 py-2">
                      <span className={`font-bold ${Number(b.in_stock) > 0 ? 'text-success' : Number(b.in_stock) < 0 ? 'text-danger' : 'text-content-muted'}`} dir="ltr">
                        {fmtQty(b.in_stock)}{b.unit ? ` ${b.unit}` : ''}
                      </span>
                      {Number(b.in_stock) < 0 && <span className="block text-[10px] text-danger">יצא יותר משנקלט — לבדוק קליטות</span>}
                    </td>
                    <td className="px-3 py-2 text-content-muted" dir="ltr">{fmtQty(b.total_in)}</td>
                    <td className="px-3 py-2 text-content-muted" dir="ltr">{fmtQty(b.total_out)}</td>
                    <td className="px-3 py-2 text-content-muted">{fmtDate(b.last_movement)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : (
        <div className="space-y-1.5">
          {movements.length === 0 && (
            <div className="bg-white rounded-xl border border-line-subtle p-12 text-center">
              <p className="text-content-muted">אין תנועות עדיין</p>
            </div>
          )}
          {movements
            .filter((m) => {
              const t = q.trim().toLowerCase();
              return !t || (m.description || '').toLowerCase().includes(t) || (m.item_key || '').toLowerCase().includes(t);
            })
            .map((m) => (
              <div key={m.id} className="bg-white border border-line-subtle rounded-lg px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-[13px]">
                <div className="flex items-center gap-2">
                  <span className={`font-bold ${m.direction === 'in' ? 'text-success' : 'text-danger'}`} dir="ltr">
                    {m.direction === 'in' ? '+' : '−'}{fmtQty(m.qty)}{m.unit ? ` ${m.unit}` : ''}
                  </span>
                  <span className="text-content-body" dir="ltr">{m.description || m.item_key}</span>
                </div>
                <div className="flex items-center gap-2 text-[12px] text-content-muted">
                  <span className="px-2 py-0.5 rounded-full bg-neutral-50 border border-line-subtle">{SOURCE_LABELS[m.source_type] || m.source_type}</span>
                  {m.project_id && projects[m.project_id] && (
                    <a href={`/projects/${m.project_id}`} className="text-primary hover:underline">{projects[m.project_id]}</a>
                  )}
                  <span>{fmtDate(m.created_at)}</span>
                </div>
              </div>
            ))}
        </div>
      )}

      {showManual && <ManualMovementModal onClose={() => setShowManual(false)} onSaved={() => { setShowManual(false); load(); }} />}
    </div>
  );
}

// --- Manual correction / stock count ---
function ManualMovementModal({ onClose, onSaved }: any) {
  const supabase = createClient();
  const [f, setF] = useState<any>({ direction: 'in', description: '', dn: '', pn: '', sn: '', unit: 'יח\'', qty: '', notes: '' });
  const [saving, setSaving] = useState(false);
  const inp = 'w-full text-[13px] border border-line-subtle rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary-100';

  async function save() {
    const qty = Number(f.qty);
    if (!f.description.trim() || !(qty > 0)) return;
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const spec = { description: f.description, dn: f.dn || null, pn: f.pn || null, sn: f.sn || null, length_m: null };
      const { error } = await supabase.from('inventory_movements').insert({
        direction: f.direction,
        item_key: itemKey(spec),
        description: f.description.trim(),
        category: guessCategory(f.description),
        dn: f.dn ? parseInt(f.dn, 10) : null,
        pn: f.pn ? parseFloat(f.pn) : null,
        sn: f.sn ? parseFloat(f.sn) : null,
        unit: f.unit || null,
        qty,
        source_type: 'manual',
        notes: f.notes.trim() || null,
        created_by: user?.id || null,
      });
      if (error) { alert(`שגיאה: ${error.message}`); return; }
      onSaved();
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-[92vw] max-w-[440px] max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()} dir="rtl">
        <div className="px-4 py-3 border-b border-line-subtle flex items-center justify-between">
          <h3 className="text-base font-bold text-content-strong">תנועה ידנית</h3>
          <button onClick={onClose} className="text-neutral-400 hover:text-content-body"><Icon name="close" size={18} /></button>
        </div>
        <div className="p-4 space-y-3">
          <div className="flex gap-2">
            {[{ v: 'in', l: 'כניסה +' }, { v: 'out', l: 'יציאה −' }].map((o) => (
              <button key={o.v} onClick={() => setF({ ...f, direction: o.v })}
                className={`flex-1 text-[13px] py-1.5 rounded-lg border font-semibold ${f.direction === o.v ? 'bg-primary text-white border-primary' : 'bg-white text-content-body border-line-subtle'}`}>
                {o.l}
              </button>
            ))}
          </div>
          <div>
            <label className="block text-[12px] font-medium text-content-body mb-1">תיאור הפריט *</label>
            <input value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} className={inp} placeholder="למשל: GRP Pipe DN500 PN10" />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div><label className="block text-[12px] font-medium text-content-body mb-1">DN</label><input value={f.dn} onChange={(e) => setF({ ...f, dn: e.target.value })} dir="ltr" className={inp} /></div>
            <div><label className="block text-[12px] font-medium text-content-body mb-1">PN</label><input value={f.pn} onChange={(e) => setF({ ...f, pn: e.target.value })} dir="ltr" className={inp} /></div>
            <div><label className="block text-[12px] font-medium text-content-body mb-1">SN</label><input value={f.sn} onChange={(e) => setF({ ...f, sn: e.target.value })} dir="ltr" className={inp} /></div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><label className="block text-[12px] font-medium text-content-body mb-1">כמות *</label><input value={f.qty} onChange={(e) => setF({ ...f, qty: e.target.value })} dir="ltr" className={inp} /></div>
            <div><label className="block text-[12px] font-medium text-content-body mb-1">יחידה</label><input value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value })} className={inp} /></div>
          </div>
          <div>
            <label className="block text-[12px] font-medium text-content-body mb-1">סיבה / הערות</label>
            <input value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} className={inp} placeholder="ספירת מלאי, שבר, תיקון…" />
          </div>
          <button onClick={save} disabled={!f.description.trim() || !(Number(f.qty) > 0) || saving}
            className="w-full bg-primary text-white text-sm font-semibold py-2 rounded-lg hover:bg-primary-700 disabled:opacity-40">
            {saving ? 'שומר…' : 'שמור תנועה'}
          </button>
        </div>
      </div>
    </div>
  );
}
