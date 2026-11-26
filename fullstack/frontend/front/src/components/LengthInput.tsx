'use client';
import { useState } from 'react';
import { formatLength, splitYards, toYards } from '@/lib/length';

type Field = 'yd' | 'ft' | 'in' | 'cm';
// The unit also shows inside each box, so the labels stay short enough for one line
const FIELDS: { key: Field; label: string }[] = [
  { key: 'yd', label: 'Yards' },
  { key: 'ft', label: 'Feet' },
  { key: 'in', label: 'Inches' },
  { key: 'cm', label: 'Centimeters' },
];

const fieldsFor = (yards: number): Record<Field, string> => {
  if (!yards) return { yd: '', ft: '', in: '', cm: '' };
  const p = splitYards(yards);
  return { yd: p.yd ? String(p.yd) : '', ft: p.ft ? String(p.ft) : '', in: p.in ? String(p.in) : '', cm: '' };
};

/**
 * A length entered as yards + feet + inches + centimeters, all added together
 * (e.g. 39 yd 2 ft 1 in). The value in and out is in yards, the unit stock is
 * kept in. `compact` drops the labels for use inside a table row.
 */
export default function LengthInput({
  value, onChange, compact = false, ariaLabel = 'Length', invalid = false, showTotal = true,
}: {
  value: number | '';
  onChange: (yards: number) => void;
  compact?: boolean;
  ariaLabel?: string;
  invalid?: boolean;
  showTotal?: boolean;
}) {
  const yards = Number(value) || 0;
  const [fields, setFields] = useState<Record<Field, string>>(() => fieldsFor(yards));
  // The yards these fields add up to; a different value from outside resets them
  // (adjusted during render, React's pattern for state that follows a prop)
  const [shown, setShown] = useState(yards);
  if (Math.abs(yards - shown) > 1e-6) {
    setShown(yards);
    setFields(fieldsFor(yards));
  }

  const update = (key: Field, raw: string) => {
    // Digits and one decimal point only; no negatives
    const clean = raw.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1');
    const next = { ...fields, [key]: clean };
    setFields(next);
    const total = toYards({
      yd: parseFloat(next.yd) || 0, ft: parseFloat(next.ft) || 0,
      in: parseFloat(next.in) || 0, cm: parseFloat(next.cm) || 0,
    });
    setShown(total);
    onChange(total);
  };

  const box = `w-full min-w-0 rounded-lg border bg-white text-gray-900 text-sm focus:ring-2 focus:ring-[#011c72] focus:border-transparent ${
    invalid ? 'border-red-400' : 'border-[#c7d2f5]'} ${compact ? 'px-1.5 py-1.5' : 'px-3 py-2'}`;

  return (
    <div>
      {/* Two by two on phones, one row of four from small tablets up */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5" role="group" aria-label={ariaLabel}>
        {FIELDS.map(({ key, label }) => (
          <div key={key} className="min-w-0">
            {!compact && <label className="block text-[11px] font-medium text-gray-500 mb-0.5 truncate">{label}</label>}
            <div className="relative">
              <input type="text" inputMode="decimal" value={fields[key]} placeholder="0"
                aria-label={`${ariaLabel} – ${label}`}
                onChange={(e) => update(key, e.target.value)}
                className={`${box} ${compact ? 'pr-6' : 'pr-8'}`} />
              <span className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] text-gray-400">{key}</span>
            </div>
          </div>
        ))}
      </div>
      {showTotal && (
        <p className="mt-1 text-xs text-gray-500">
          = <span className="font-semibold text-gray-800">{formatLength(yards)}</span>
          {yards > 0 && <span className="text-gray-400"> ({(Math.round(yards * 10000) / 10000).toLocaleString('en-PH')} yd)</span>}
        </p>
      )}
    </div>
  );
}
