'use client';

import { useRef, useState } from 'react';
import Icon from '@/components/ui/Icon';

/**
 * A table cell edited in place like the projects list (import tracker,
 * suppliers): click the value →
 * input (autofocus) → Enter / leaving the cell saves, Esc cancels. A value
 * taken from a document carries a file icon that opens it; for a user without
 * edit rights the value itself opens the document.
 */
export default function EditableCell({ value, display, type = 'text', options, ltr, width, placeholder, canEdit, docId, onOpen, onSave }: {
  value: string;
  display?: string;
  type?: 'text' | 'number' | 'date' | 'select';
  options?: { value: string; label: string }[];
  ltr?: boolean;
  width?: string;
  placeholder?: string;
  canEdit: boolean;
  docId?: string | null;
  onOpen?: (id: string | null) => void;
  onSave?: (v: string) => Promise<string | null>;
}) {
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState('');
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  // Closed once saved or cancelled: a blur fired while the input unmounts must
  // neither save a cancelled value nor save twice (a second qty save would add a line).
  const closed = useRef(true);
  const shown = display ?? value;
  function open() { setV(value || ''); closed.current = false; setEditing(true); }
  function cancel() { closed.current = true; setEditing(false); }
  const dir = ltr ? 'ltr' : undefined;

  async function commit(next: string) {
    if (busy.current || closed.current) return;
    if (next.trim() === (value || '').trim()) { cancel(); return; }
    busy.current = true; setSaving(true);
    const err = onSave ? await onSave(next) : null;
    busy.current = false; setSaving(false);
    // Close BEFORE the alert: the dialog steals focus, and a still-open input
    // would re-save on that blur and loop through the same error.
    cancel();
    if (err) alert('שגיאה בשמירה: ' + err + '\nהערך לא נשמר.');
  }

  if (editing) {
    if (type === 'select') {
      return (
        <select autoFocus value={v} disabled={saving} onChange={(e) => { setV(e.target.value); commit(e.target.value); }} onBlur={() => !busy.current && cancel()}
          className="border border-primary rounded px-1 py-0.5 text-[12px] focus:outline-none">
          {(options || []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      );
    }
    return (
      <input
        autoFocus type={type === 'date' ? 'date' : 'text'} inputMode={type === 'number' ? 'decimal' : undefined}
        value={v} dir={dir} disabled={saving}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => commit(v)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); commit(v); }
          if (e.key === 'Escape') cancel();
        }}
        className={`${width || (type === 'date' ? 'w-32' : 'w-24')} border border-primary rounded px-1 py-0.5 text-[12px] focus:outline-none`}
      />
    );
  }

  const docBtn = docId && shown && onOpen ? (
    <button onClick={() => onOpen(docId)} className="text-azure hover:text-azure-600 shrink-0" title="פתח את מסמך המקור"><Icon name="file" size={12} /></button>
  ) : null;

  if (!canEdit) {
    if (!shown) return null;
    return docId && onOpen
      ? <button onClick={() => onOpen(docId)} dir={dir} className="text-azure hover:underline decoration-dotted" title="פתח את מסמך המקור">{shown}</button>
      : <span dir={dir}>{shown}</span>;
  }
  return (
    <span className="inline-flex items-center gap-1">
      <span
        onClick={open}
        dir={dir}
        title="לחץ לעריכה"
        className={`cursor-pointer rounded px-0.5 hover:bg-primary-50 hover:text-primary inline-block min-w-[2.5rem] min-h-[1.25em] ${shown ? (docId ? 'text-azure' : '') : 'text-neutral-300'}`}
      >
        {shown || <span className="text-[11px]">{placeholder || '—'}</span>}
      </span>
      {docBtn}
    </span>
  );
}
