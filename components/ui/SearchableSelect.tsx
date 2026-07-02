'use client';

import { useEffect, useRef, useState } from 'react';

export type SelectOption = { value: string; label: string; group?: string; disabled?: boolean };

/**
 * Drop-in replacement for a native <select> with a built-in search box.
 * Pass the same value/onChange you'd give a select, plus an `options` array.
 * The popover is fixed-positioned so it escapes table/overflow containers.
 */
export default function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = 'בחר…',
  className = '',
  disabled = false,
  searchPlaceholder = 'חיפוש…',
  autoOpen = false,
}: {
  value: string;
  onChange: (v: string) => void;
  options: SelectOption[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  searchPlaceholder?: string;
  autoOpen?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [coords, setCoords] = useState<{ top: number; left: number; width: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (btnRef.current?.contains(e.target as Node)) return;
      if (popRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false); }
    if (open) {
      document.addEventListener('mousedown', onDoc);
      document.addEventListener('keydown', onKey);
    }
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  useEffect(() => {
    if (open) { const t = setTimeout(() => inputRef.current?.focus(), 0); return () => clearTimeout(t); }
  }, [open]);

  useEffect(() => {
    if (autoOpen && !disabled) openMenu();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reposition while open so scroll / resize / keyboard pop-ins keep the popover anchored.
  useEffect(() => {
    if (!open) return;
    const reposition = () => {
      const r = btnRef.current?.getBoundingClientRect();
      if (r) setCoords(computeCoords(r));
    };
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    return () => {
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
    };
  }, [open]);

  function computeCoords(r: DOMRect) {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const margin = 8;
    const estHeight = 320; // search box + max-h-64 list + paddings
    const w = Math.max(r.width, 200);

    // Vertical: prefer below; flip above when there's not enough space below.
    const spaceBelow = vh - r.bottom - margin;
    const spaceAbove = r.top - margin;
    const top = spaceBelow >= estHeight || spaceBelow >= spaceAbove
      ? r.bottom + 4
      : Math.max(margin, r.top - Math.min(estHeight, spaceAbove) - 4);

    // Horizontal: clamp so the popover stays fully inside the viewport.
    let left = r.left;
    if (left + w > vw - margin) left = Math.max(margin, vw - w - margin);
    if (left < margin) left = margin;

    return { top, left, width: w };
  }

  function openMenu() {
    if (disabled) return;
    const r = btnRef.current?.getBoundingClientRect();
    if (r) setCoords(computeCoords(r));
    setQuery('');
    setOpen(true);
  }

  const q = query.trim().toLowerCase();
  const filtered = q ? options.filter((o) => (o.label || '').toLowerCase().includes(q)) : options;

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openMenu())}
        className={`${className} bg-white flex items-center justify-between gap-1 text-right ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
      >
        <span className={`truncate ${selected ? '' : 'text-gray-400'}`}>{selected ? selected.label : placeholder}</span>
        <svg className="w-3.5 h-3.5 text-gray-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9" /></svg>
      </button>
      {open && coords && (
        <div
          ref={popRef}
          dir="rtl"
          style={{ position: 'fixed', top: coords.top, left: coords.left, width: coords.width, maxHeight: 'calc(100vh - 16px)', zIndex: 60 }}
          className="bg-white border border-[#e2e8f0] rounded-lg shadow-xl overflow-hidden"
        >
          <div className="p-1.5 border-b border-gray-100">
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchPlaceholder}
              className="w-full border border-[#e2e8f0] rounded px-2 py-1 text-[12px] focus:outline-none focus:ring-2 focus:ring-[#1a56db]/20"
            />
          </div>
          <div className="max-h-64 overflow-y-auto py-1">
            {filtered.length === 0 && <div className="px-3 py-2 text-[12px] text-gray-400">אין תוצאות</div>}
            {filtered.map((o, i) => {
              const showGroup = o.group && o.group !== filtered[i - 1]?.group;
              return (
                <div key={`${o.value}-${i}`}>
                  {showGroup && <div className="px-2 pt-1.5 pb-0.5 text-[10px] font-semibold text-gray-400">{o.group}</div>}
                  <button
                    type="button"
                    disabled={o.disabled}
                    onClick={() => { if (o.disabled) return; onChange(o.value); setOpen(false); }}
                    className={`w-full text-right px-3 py-1.5 text-[12px] rounded ${o.value === value ? 'bg-blue-50 text-[#1a56db] font-semibold' : 'text-gray-700 hover:bg-blue-50'} ${o.disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
                  >
                    {o.label}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
