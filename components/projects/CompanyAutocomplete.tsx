'use client';

import { useState, useRef, useEffect } from 'react';

function norm(s: string): string {
  return (s || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function lev(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const d: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) d[i][0] = i;
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[m][n];
}

// "Similar" = same except minor differences (substring or small edit distance), but NOT identical.
export function isSimilarName(a: string, b: string): boolean {
  const x = norm(a), y = norm(b);
  if (!x || !y || x === y) return false;
  if (x.length >= 3 && y.length >= 3 && (x.includes(y) || y.includes(x))) return true;
  return lev(x, y) <= 2 && Math.min(x.length, y.length) >= 3;
}
const isSimilar = isSimilarName;

interface Props {
  value: string;
  onChange: (v: string) => void;
  options: string[];               // existing customer names
  className?: string;
  placeholder?: string;
}

export default function CompanyAutocomplete({ value, onChange, options, className, placeholder }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const q = norm(value);
  const exact = options.some((o) => norm(o) === q);
  const matches = q ? options.filter((o) => norm(o).includes(q) && norm(o) !== q).slice(0, 6) : [];
  const similar = !exact && q.length >= 2 ? options.filter((o) => isSimilar(o, value)).slice(0, 1) : [];

  return (
    <div className="relative flex-1 min-w-0" ref={ref}>
      <input
        type="text"
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder || 'שם חברה'}
        className={className || 'w-full border border-[#e2e8f0] rounded-lg px-2 py-2 text-sm'}
        autoComplete="off"
      />
      {open && matches.length > 0 && (
        <div className="absolute z-40 mt-1 right-0 left-0 bg-white border border-[#e2e8f0] rounded-lg shadow-lg max-h-48 overflow-y-auto">
          {matches.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => { onChange(m); setOpen(false); }}
              className="block w-full text-right px-3 py-1.5 text-sm text-gray-700 hover:bg-blue-50"
            >
              {m}
            </button>
          ))}
        </div>
      )}
      {similar.length > 0 && (
        <p className="text-[11px] text-amber-600 mt-1">
          ⚠️ קיים לקוח דומה: <span className="font-semibold">{similar[0]}</span>
          <button type="button" onClick={() => onChange(similar[0])} className="text-[#1a56db] hover:underline mr-1">השתמש בו</button>
        </p>
      )}
    </div>
  );
}
