// Seat Row Descriptions on the Job Order Slip. Saved in the job order's slipData
// as rows: [{ description, hr }] — a list of any length, so no database change
// was needed for more than four. HR is free text that is only shown (no
// calculation uses it).

export interface SlipRow {
  /** Only on screen, so a row keeps its own values when another is removed. Never saved. */
  id: string;
  description: string;
  hr: string;
}

export type SavedSlipRow = { description: string; hr: string };

/** The rows a new slip starts with */
export const DEFAULT_SLIP_ROWS = 4;
/** Any row can be removed, but a slip always keeps at least this many */
export const MIN_SLIP_ROWS = 1;
/** Enough for any vehicle, and keeps a mistyped click-fest in check */
export const MAX_SLIP_ROWS = 20;

let counter = 0;
const newId = () => `row-${Date.now().toString(36)}-${++counter}`;

export const blankSlipRow = (): SlipRow => ({ id: newId(), description: '', hr: '' });

/** The rows to show: exactly the saved ones (never cut off or padded back), or
 *  the default four for a slip with none saved yet. */
export function loadSlipRows(saved: unknown): SlipRow[] {
  const list = Array.isArray(saved) ? saved : [];
  const rows = list.map((r): SlipRow => ({
    id: newId(),
    description: typeof r?.description === 'string' ? r.description : String(r?.description ?? ''),
    hr: typeof r?.hr === 'string' ? r.hr : String(r?.hr ?? ''),
  }));
  if (rows.length === 0) {
    while (rows.length < DEFAULT_SLIP_ROWS) rows.push(blankSlipRow());
  }
  return rows;
}

/** What is saved: exactly the rows on screen, in order, so a removed row stays removed. */
export function toSavedSlipRows(rows: SlipRow[]): SavedSlipRow[] {
  return rows.map(({ description, hr }) => ({ description, hr }));
}

/** 1st, 2nd, 3rd, 4th … 11th, 12th, 13th … 21st, 22nd */
export function ordinal(n: number): string {
  const teen = n % 100;
  if (teen >= 11 && teen <= 13) return `${n}th`;
  return `${n}${({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] || 'th'}`;
}
