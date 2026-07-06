'use client';

import { useState } from 'react';
import Icon from '@/components/ui/Icon';

export interface PipeSpec {
  dn_mm: number | null;
  od_mm: number | null;
  id_mm: number | null;
  pipe_type: string;
  line_length_m: number | null;
  unit_length_m: string;
  stiffness_pascal: number | null;
  pressure_bar: number | null;
  notes: string;
}

export const PIPE_TYPES = [
  { value: 'הטמנה', label: 'הטמנה' },
  { value: 'דחיקה', label: 'דחיקה (Jacking)' },
  { value: 'השחלה', label: 'השחלה (Slip Lining)' },
  { value: 'עילי', label: 'עילי' },
  { value: 'ביאקסיאלי', label: 'ביאקסיאלי' },
];

interface PipeSpecsInputProps {
  specs: PipeSpec[];
  onChange: (specs: PipeSpec[]) => void;
}

const COLUMNS = ['DN', 'OD', 'ID', 'סוג צינור', 'אורך קו (מ׳)', 'אורך יחידה (מ׳)', 'קשיחות (פסקל)', 'לחץ (בר)', 'הערות'];

function parseLine(line: string): PipeSpec | null {
  const parts = line.split(/[,،\t;]+/).map((s) => s.trim());
  if (parts.length === 0 || !parts[0]) return null;

  const num = (s: string | undefined) => {
    if (!s) return null;
    const n = parseFloat(s);
    return isNaN(n) ? null : n;
  };

  const dn = num(parts[0]);
  if (dn === null && num(parts[1]) === null && num(parts[2]) === null) return null;

  return {
    dn_mm: dn,
    od_mm: num(parts[1]),
    id_mm: num(parts[2]),
    pipe_type: parts[3] || 'הטמנה',
    line_length_m: num(parts[4]),
    unit_length_m: parts[5] || '',
    stiffness_pascal: num(parts[6]),
    pressure_bar: num(parts[7]),
    notes: parts[8] || '',
  };
}

export default function PipeSpecsInput({ specs, onChange }: PipeSpecsInputProps) {
  const [rawInput, setRawInput] = useState('');
  const [showRaw, setShowRaw] = useState(specs.length === 0);

  function handleParse() {
    const lines = rawInput.split('\n').filter((l) => l.trim());
    const parsed = lines.map(parseLine).filter((s): s is PipeSpec => s !== null);
    if (parsed.length > 0) {
      onChange([...specs, ...parsed]);
      setRawInput('');
      setShowRaw(false);
    }
  }

  function removeSpec(index: number) {
    onChange(specs.filter((_, i) => i !== index));
  }

  return (
    <div>
      {/* Table of existing specs */}
      {specs.length > 0 && (
        <div className="overflow-x-auto mb-3">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line-subtle">
                {COLUMNS.map((col) => (
                  <th key={col} className="text-right text-[13px] text-content-muted font-medium pb-2 px-2">
                    {col}
                  </th>
                ))}
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {specs.map((spec, i) => (
                <tr key={i} className="border-b border-line-subtle hover:bg-neutral-50">
                  <td className="py-2 px-2 font-semibold text-content-strong">{spec.dn_mm || '—'}</td>
                  <td className="py-2 px-2 text-content-body">{spec.od_mm || '—'}</td>
                  <td className="py-2 px-2 text-content-body">{spec.id_mm || '—'}</td>
                  <td className="py-2 px-2 text-content-body">{spec.pipe_type || 'הטמנה'}</td>
                  <td className="py-2 px-2 text-content-body">{spec.line_length_m ?? '—'}</td>
                  <td className="py-2 px-2 text-content-body" dir="ltr">{spec.unit_length_m ? spec.unit_length_m.split(',').join(', ') : '—'}</td>
                  <td className="py-2 px-2 text-content-body">{spec.stiffness_pascal ?? '—'}</td>
                  <td className="py-2 px-2 text-content-body">{spec.pressure_bar ?? '—'}</td>
                  <td className="py-2 px-2 text-content-body">{spec.notes || '—'}</td>
                  <td className="py-2 px-1">
                    <button
                      type="button"
                      onClick={() => removeSpec(i)}
                      className="text-danger hover:text-danger text-sm"
                    >
                      <Icon name="close" size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Toggle raw input */}
      {!showRaw && (
        <button
          type="button"
          onClick={() => setShowRaw(true)}
          className="text-sm text-primary hover:underline"
        >
          + הוסף שורות צנרת
        </button>
      )}

      {showRaw && (
        <div className="bg-neutral-50 rounded-lg p-3">
          <p className="text-[12px] text-content-muted mb-2">
            הזן שורה לכל צינור — מופרד בפסיקים: קוטר, אורך קו, אורך יחידה, קשיחות, לחץ, הערות
          </p>
          <textarea
            value={rawInput}
            onChange={(e) => setRawInput(e.target.value)}
            placeholder={`700, 1350, 5.7, 10000, 2\n800, 95, 5.7, 10000, 2\n500, 75, 5.7, 10000, 2`}
            className="w-full border border-line-subtle rounded-lg p-2.5 text-sm font-mono text-content-body resize-y min-h-[80px] focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary"
            dir="ltr"
          />
          <div className="flex gap-2 mt-2">
            <button
              type="button"
              onClick={handleParse}
              className="text-sm bg-primary text-white px-3 py-1.5 rounded-lg hover:bg-primary-700 transition-colors"
            >
              הוסף לטבלה
            </button>
            <button
              type="button"
              onClick={() => { setShowRaw(false); setRawInput(''); }}
              className="text-sm text-content-muted hover:text-content-body"
            >
              ביטול
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
