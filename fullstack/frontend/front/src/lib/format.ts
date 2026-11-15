// How numbers are shown across the app. Display only: nothing here changes a
// stored or calculated value, and totals are never added up from these strings.

const UNITS: [number, string][] = [[1e12, 'T'], [1e9, 'B'], [1e6, 'M'], [1e3, 'K']];
const MINUS = '−';

/** A real number, or 0 for null, undefined, text, NaN and Infinity */
const num = (value: unknown): number => {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
};

/** Rounded half up to `d` decimals, on the number as written (1.005 → 1.01, which
 *  multiplying by 100 misses in binary). Numbers too large to carry decimals pass through. */
const round = (n: number, d = 2) => {
  if (n >= 1e15 || String(n).includes('e')) return n;
  return Number(`${Math.round(Number(`${n}e${d}`))}e-${d}`);
};

const group = (n: number, min: number, max: number) =>
  n.toLocaleString('en-PH', { minimumFractionDigits: min, maximumFractionDigits: max });

/**
 * 1,500 → "1.5K", 1,250,000 → "1.25M", 1,000,000,000 → "1B".
 * At most 2 decimals, trailing zeros dropped. Below 1,000 the number is written
 * out (up to `smallDecimals` decimals). A value that would round up to 1000 of
 * its unit moves to the next one (999,999 → "1M", never "1000K").
 */
export function compactNumber(value: unknown, smallDecimals = 2): string {
  const n = num(value);
  const sign = n < 0 ? MINUS : '';
  const abs = Math.abs(n);
  for (let i = UNITS.length - 1; i >= 0; i--) {
    const [size, suffix] = UNITS[i];
    const next = UNITS[i - 1];
    if (abs < size || (next && abs >= next[0])) continue;
    const scaled = round(abs / size);
    if (scaled >= 1000 && next) return `${sign}${group(round(abs / next[0]), 0, 2)}${next[1]}`;
    return `${sign}${group(scaled, 0, 2)}${suffix}`;
  }
  // Rounds to 1,000 (e.g. 999.999): say 1K rather than a 4-digit "small" number
  const small = round(abs, smallDecimals);
  if (small >= 1000) return `${sign}1K`;
  return `${small === 0 ? '' : sign}${group(small, 0, smallDecimals)}`;
}

/** Every digit with thousands separators: 12,500 or 12,500.75 (up to `decimals`) */
export function exactNumber(value: unknown, decimals = 2): string {
  const n = num(value);
  const rounded = round(Math.abs(n), decimals);
  return `${n < 0 && rounded !== 0 ? MINUS : ''}${group(rounded, 0, decimals)}`;
}

/** ₱1.25M, ₱25K, ₱1.5K, ₱950 */
export function compactPeso(value: unknown): string {
  const text = compactNumber(value);
  return text.startsWith(MINUS) ? `${MINUS}₱${text.slice(1)}` : `₱${text}`;
}

/** Every digit, with centavos: ₱1,250,000.00 */
export function exactPeso(value: unknown): string {
  const n = num(value);
  const abs = round(Math.abs(n));
  return `${n < 0 && abs !== 0 ? MINUS : ''}₱${group(abs, 2, 2)}`;
}

/** Whether the short form differs from the full one (so a way to see the full one is worth showing) */
export const isAbbreviated = (value: unknown, from = 1000) => Math.abs(num(value)) >= from;
