'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import Icon from '@/components/ui/Icon';

type Clause = { num: number; text: string };
type Section = { title: string; clauses: Clause[] };
type Template = {
  id: string;
  name: string;
  description: string | null;
  is_default: boolean;
  content: Section[];
  created_at: string;
  updated_at: string;
};

export default function ContractTemplatesEditor({ templates: initial }: { templates: Template[] }) {
  const [templates, setTemplates] = useState<Template[]>(initial);
  const [openId, setOpenId] = useState<string | null>(null);
  const sb = createClient();

  async function refresh() {
    const { data } = await sb.from('contract_term_templates').select('id, name, description, is_default, content, created_at, updated_at').order('is_default', { ascending: false }).order('name');
    setTemplates((data as Template[]) || []);
  }

  async function createNew() {
    const name = prompt('שם התבנית החדשה:');
    if (!name?.trim()) return;
    const { error } = await sb.from('contract_term_templates').insert({ name: name.trim(), content: [], is_default: false });
    if (error) { alert(`שגיאה: ${error.message}`); return; }
    await refresh();
  }

  async function deleteTemplate(t: Template) {
    if (t.is_default) { alert('לא ניתן למחוק את תבנית ברירת המחדל. שנה תבנית אחרת לברירת מחדל קודם.'); return; }
    if (!confirm(`למחוק את התבנית "${t.name}"? פעולה זו אינה הפיכה.`)) return;
    if (!confirm('בטוח? למחוק לצמיתות?')) return;
    const { error } = await sb.from('contract_term_templates').delete().eq('id', t.id);
    if (error) { alert(`שגיאה: ${error.message}`); return; }
    setOpenId(null);
    await refresh();
  }

  async function setDefault(t: Template) {
    if (t.is_default) return;
    if (!confirm(`להפוך את "${t.name}" לברירת המחדל? (התבנית הקודמת לא תהיה ברירת מחדל יותר)`)) return;
    await sb.from('contract_term_templates').update({ is_default: false }).eq('is_default', true);
    await sb.from('contract_term_templates').update({ is_default: true }).eq('id', t.id);
    await refresh();
  }

  async function rename(t: Template) {
    const name = prompt('שם חדש:', t.name);
    if (!name?.trim() || name.trim() === t.name) return;
    await sb.from('contract_term_templates').update({ name: name.trim() }).eq('id', t.id);
    await refresh();
  }

  async function duplicate(t: Template) {
    const name = prompt('שם להעתק:', `${t.name} (העתק)`);
    if (!name?.trim()) return;
    await sb.from('contract_term_templates').insert({ name: name.trim(), description: t.description, content: t.content, is_default: false });
    await refresh();
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end">
        <button onClick={createNew} className="bg-primary text-white text-sm px-4 py-2 rounded-lg hover:bg-primary-700">+ תבנית חדשה</button>
      </div>
      {templates.map((t) => (
        <div key={t.id} className="bg-white border border-line-subtle rounded-xl overflow-hidden">
          <div className="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-neutral-50" onClick={() => setOpenId(openId === t.id ? null : t.id)}>
            <div className="flex items-center gap-3">
              <span className="text-base font-bold text-content-strong">{t.name}</span>
              {t.is_default && <span className="text-[11px] px-2 py-0.5 rounded-full bg-success-soft text-success font-semibold">ברירת מחדל</span>}
              <span className="text-[11px] text-neutral-400">{t.content.length} פרקים · {t.content.reduce((s, sec) => s + sec.clauses.length, 0)} סעיפים</span>
            </div>
            <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
              <button onClick={() => rename(t)} className="text-[12px] bg-neutral-50 text-content-body px-3 py-1 rounded-lg hover:bg-neutral-100">שנה שם</button>
              <button onClick={() => duplicate(t)} className="text-[12px] bg-primary-50 text-primary px-3 py-1 rounded-lg hover:bg-primary-50"><Icon name="copy" size={16} /> שכפל</button>
              {!t.is_default && <button onClick={() => setDefault(t)} className="text-[12px] bg-success-soft text-success px-3 py-1 rounded-lg hover:bg-success-soft">קבע כברירת מחדל</button>}
              {!t.is_default && <button onClick={() => deleteTemplate(t)} className="text-[12px] text-danger px-3 py-1 rounded-lg hover:bg-danger-soft"><Icon name="delete" size={16} /> מחק</button>}
            </div>
          </div>
          {openId === t.id && <TemplateEditor template={t} onSaved={refresh} />}
        </div>
      ))}
    </div>
  );
}

function TemplateEditor({ template, onSaved }: { template: Template; onSaved: () => Promise<void> }) {
  const [sections, setSections] = useState<Section[]>(template.content || []);
  const [saving, setSaving] = useState(false);
  const sb = createClient();

  function updateClause(si: number, ci: number, text: string) {
    setSections((prev) => prev.map((s, i) => i === si ? { ...s, clauses: s.clauses.map((c, j) => j === ci ? { ...c, text } : c) } : s));
  }
  function updateTitle(si: number, title: string) {
    setSections((prev) => prev.map((s, i) => i === si ? { ...s, title } : s));
  }
  function deleteClause(si: number, ci: number) {
    setSections((prev) => prev.map((s, i) => i === si ? { ...s, clauses: s.clauses.filter((_, j) => j !== ci) } : s));
  }
  function addClause(si: number) {
    setSections((prev) => prev.map((s, i) => {
      if (i !== si) return s;
      const nextNum = s.clauses.length ? Math.max(...s.clauses.map((c) => c.num)) + 1 : 1;
      return { ...s, clauses: [...s.clauses, { num: nextNum, text: '' }] };
    }));
  }
  function deleteSection(si: number) {
    if (!confirm('למחוק את הפרק וכל סעיפיו?')) return;
    setSections((prev) => prev.filter((_, i) => i !== si));
  }
  function addSection() {
    setSections((prev) => [...prev, { title: 'פרק חדש', clauses: [] }]);
  }
  function moveSection(si: number, dir: -1 | 1) {
    setSections((prev) => {
      const next = [...prev];
      const j = si + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[si], next[j]] = [next[j], next[si]];
      return next;
    });
  }
  async function save() {
    setSaving(true);
    const { error } = await sb.from('contract_term_templates').update({ content: sections, updated_at: new Date().toISOString() }).eq('id', template.id);
    setSaving(false);
    if (error) { alert(`שגיאה: ${error.message}`); return; }
    await onSaved();
  }
  function reset() {
    if (!confirm('להחזיר את התבנית למצב השמור?')) return;
    setSections(template.content || []);
  }

  return (
    <div className="border-t border-line-subtle bg-neutral-50 p-4 space-y-3" dir="rtl">
      <div className="flex items-center justify-between">
        <p className="text-[11px] text-content-muted"><Icon name="warning" size={14} /> שינויים בתבנית זו ייכנסו להצעות עתידיות. הצעות שיצאו (נשלחו/נחתמו) מוקפאות עם תנאיהן.</p>
        <div className="flex gap-2">
          <button onClick={reset} className="text-sm text-content-muted px-3 py-1.5 rounded-lg hover:bg-neutral-100">בטל שינויים</button>
          <button onClick={save} disabled={saving} className="text-sm bg-primary text-white px-4 py-1.5 rounded-lg hover:bg-primary-700 disabled:opacity-50">{saving ? 'שומר…' : <><Icon name="save" size={16} /> שמור תבנית</>}</button>
        </div>
      </div>
      {sections.length === 0 && <p className="text-sm text-neutral-400 text-center py-6">אין פרקים. לחץ "+ הוסף פרק".</p>}
      {sections.map((s, si) => (
        <div key={si} className="border border-line-subtle rounded-lg p-3 bg-white">
          <div className="flex items-center gap-2 mb-2">
            <input value={s.title} onChange={(e) => updateTitle(si, e.target.value)} className="flex-1 border border-line-subtle rounded-lg px-3 py-1.5 text-sm font-semibold" />
            <button onClick={() => moveSection(si, -1)} disabled={si === 0} className="text-[11px] bg-neutral-50 border border-line-subtle px-2 py-1 rounded hover:bg-neutral-100 disabled:opacity-30"><Icon name="arrowUp" size={14} /></button>
            <button onClick={() => moveSection(si, 1)} disabled={si === sections.length - 1} className="text-[11px] bg-neutral-50 border border-line-subtle px-2 py-1 rounded hover:bg-neutral-100 disabled:opacity-30"><Icon name="arrowDown" size={14} /></button>
            <button onClick={() => deleteSection(si)} className="text-[11px] text-danger hover:text-danger px-2"><Icon name="delete" size={16} /></button>
          </div>
          <div className="space-y-2">
            {s.clauses.map((c, ci) => (
              <div key={ci} className="flex gap-2 items-start">
                <span className="text-[12px] font-bold text-navy-700 pt-2 min-w-[24px]">{c.num}.</span>
                <textarea value={c.text} onChange={(e) => updateClause(si, ci, e.target.value)} rows={2} className="flex-1 border border-line-subtle rounded-lg px-3 py-1.5 text-[12px] text-content-body leading-relaxed resize-y" />
                <button onClick={() => deleteClause(si, ci)} className="text-danger hover:text-danger text-lg pt-1">×</button>
              </div>
            ))}
            <button onClick={() => addClause(si)} className="text-[11px] text-primary hover:underline">+ הוסף סעיף</button>
          </div>
        </div>
      ))}
      <button onClick={addSection} className="w-full text-sm border-2 border-dashed border-line-strong rounded-lg py-2 text-content-muted hover:bg-white">+ הוסף פרק</button>
    </div>
  );
}
