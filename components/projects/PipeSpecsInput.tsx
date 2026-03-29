'use client';

import { useState } from 'react';

export interface PipeSpec {
  diameter_mm: number;
  line_length_m: number | null;
  unit_length_m: number | null;
  stiffness_pascal: number | null;
  pressure_bar: number | null;
  notes: string;
}

interface PipeSpecsInputProps {
  specs: PipeSpec[];
  onChange: (specs: PipeSpec[]) => void;
}

const COLUMNS = ['קוטר (מ"מ)', 'אורך קו (מ׳)', 'אורך יחידה (מ׳)', 'קשיחות (פסקל)', 'לחץ (בר)', 'הערות'];

function parseLine(line: string): PipeSpec | null {
  const parts = line.split(/[,،\t;]+/).map((s) => s.trim());
  if (parts.length === 0 || !parts[0]) return null;

  const num = (s: string | undefined) => {
    if (!s) return null;
    const n = parseFloat(s);
    return isNaN(n) ? null : n;
  };

  const diameter = num(parts[0]);
  if (diameter === null) return null;

  return {
    diameter_mm: diameter,
    line_length_m: num(parts[1]),
    unit_length_m: num(parts[2]),
    stiffness_pascal: num(parts[3]),
    pressure_bar: num(parts[4]),
    notes: parts[5] || '',
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
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[#e2e8f0]">
                {COLUMNS.map((col) => (
                  <th key={col} className="text-right text-[11px] text-gray-500 font-medium pb-2 px-2">
                    {col}
                  </th>
                ))}
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {specs.map((spec, i) => (
                <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="py-2 px-2 font-semibold text-gray-800">{spec.diameter_mm}</td>
                  <td className="py-2 px-2 text-gray-600">{spec.line_length_m ?? '—'}</td>
                  <td className="py-2 px-2 text-gray-600">{spec.unit_length_m ?? '—'}</td>
                  <td className="py-2 px-2 text-gray-600">{spec.stiffness_pascal ?? '—'}</td>
                  <td className="py-2 px-2 text-gray-600">{spec.pressure_bar ?? '—'}</td>
                  <td className="py-2 px-2 text-gray-600">{spec.notes || '—'}</td>
                  <td className="py-2 px-1">
                    <button
                      type="button"
                      onClick={() => removeSpec(i)}
                      className="text-red-400 hover:text-red-600 text-xs"
                    >
                      ✕
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
          className="text-xs text-[#1a56db] hover:underline"
        >
          + הוסף שורות צנרת
        </button>
      )}

      {showRaw && (
        <div className="bg-gray-50 rounded-lg p-3">
          <p className="text-[10px] text-gray-500 mb-2">
            הזן שורה לכל צינור — מופרד בפסיקים: קוטר, אורך קו, אורך יחידה, קשיחות, לחץ, הערות
          </p>
          <textarea
            value={rawInput}
            onChange={(e) => setRawInput(e.target.value)}
            placeholder={`700, 1350, 5.7, 10000, 2\n800, 95, 5.7, 10000, 2\n500, 75, 5.7, 10000, 2`}
            className="w-full border border-[#e2e8f0] rounded-lg p-2.5 text-xs font-mono text-gray-700 resize-y min-h-[80px] focus:outline-none focus:ring-2 focus:ring-[#1a56db]/20 focus:border-[#1a56db]"
            dir="ltr"
          />
          <div className="flex gap-2 mt-2">
            <button
              type="button"
              onClick={handleParse}
              className="text-xs bg-[#1a56db] text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 transition-colors"
            >
              הוסף לטבלה
            </button>
            <button
              type="button"
              onClick={() => { setShowRaw(false); setRawInput(''); }}
              className="text-xs text-gray-500 hover:text-gray-700"
            >
              ביטול
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
