'use client';
import { useState } from 'react';

const UNITS: [number, string][] = [[1e9, 'B'], [1e6, 'M'], [1e3, 'K']];

/** ₱1.25M, ₱25K, ₱1.5K: at most 2 decimals, trailing zeros dropped. Display only. */
export function compactPeso(value: number): string {
  const n = Number(value) || 0;
  const sign = n < 0 ? '−' : '';
  const abs = Math.abs(n);
  for (let i = 0; i < UNITS.length; i++) {
    const [size, suffix] = UNITS[i];
    if (abs < size) continue;
    const scaled = Math.round((abs / size) * 100) / 100;
    // 999,999 rounds to "1000K": show it as 1M instead
    if (scaled >= 1000 && i > 0) {
      const [bigger, biggerSuffix] = UNITS[i - 1];
      return `${sign}₱${trim(Math.round((abs / bigger) * 100) / 100)}${biggerSuffix}`;
    }
    return `${sign}₱${trim(scaled)}${suffix}`;
  }
  return `${sign}₱${abs.toLocaleString('en-PH', { maximumFractionDigits: 2 })}`;
}

const trim = (n: number) => n.toLocaleString('en-PH', { maximumFractionDigits: 2 });

/** Every digit, with centavos: ₱1,250,000.00 */
export const exactPeso = (value: number) =>
  `${(Number(value) || 0) < 0 ? '−' : ''}₱${Math.abs(Number(value) || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

interface Props {
  value: number;
  /** Amounts below this are shown in full, as before (default ₱1,000) */
  compactFrom?: number;
  className?: string;
}

/**
 * A peso amount that stays short so it can't overflow its box (₱1.25M), with an
 * eye button that shows every digit (₱1,250,000.00) and back. Only the display
 * changes; the value itself is never rounded.
 */
export default function Amount({ value, compactFrom = 1000, className = '' }: Props) {
  const [exact, setExact] = useState(false);
  const full = exactPeso(value);
  if (Math.abs(Number(value) || 0) < compactFrom) {
    return <span className={className} title={full}>{full.replace(/\.00$/, '')}</span>;
  }
  return (
    <span className={`inline-flex items-center gap-1 max-w-full align-middle ${className}`}>
      <span className="min-w-0 [overflow-wrap:anywhere]" title={full}>{exact ? full : compactPeso(value)}</span>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setExact((v) => !v); }}
        aria-label={exact ? 'Show short amount' : `Show exact amount (${full})`}
        title={exact ? 'Show short amount' : 'Show exact amount'}
        className="shrink-0 p-0.5 rounded text-current opacity-50 hover:opacity-100 focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-[#011c72]"
      >
        {exact ? (
          <svg className="w-[0.8em] h-[0.8em] min-w-3 min-h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
          </svg>
        ) : (
          <svg className="w-[0.8em] h-[0.8em] min-w-3 min-h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
          </svg>
        )}
      </button>
    </span>
  );
}
