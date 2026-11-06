const TZ = 'Asia/Manila';

/**
 * Turn a server timestamp into something `new Date()` understands.
 *
 * Most endpoints send ISO-8601 with a Z suffix, but the audit trail sends
 * "YYYY-MM-DD HH:MM:SS PHT", which browsers reject as Invalid Date. That form
 * is rewritten to ISO with an explicit +08:00 offset; anything else passes through.
 */
function normalizeTimestamp(value: string): string {
  const m = value.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(?::\d{2})?)\s*PHT$/);
  if (!m) return value;
  const time = m[2].length === 5 ? `${m[2]}:00` : m[2];
  return `${m[1]}T${time}+08:00`;
}

/** Parse a server timestamp, or null when it is missing or unreadable. */
export function parseServerTimestamp(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(normalizeTimestamp(value));
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Calendar date in Manila as "YYYY-MM-DD".
 *
 * Use this instead of toISOString().split('T')[0], which gives the UTC date —
 * between midnight and 8 AM in the Philippines that is still *yesterday*.
 */
export function manilaDateString(date: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date);
}

/** The next Saturday in Manila as YYYY-MM-DD (a week ahead, if today is a Saturday). */
export function nextSaturdayManila(date: Date = new Date()): string {
  const [y, m, d] = manilaDateString(date).split('-').map(Number);
  const day = new Date(Date.UTC(y, m - 1, d));
  day.setUTCDate(d + ((6 - day.getUTCDay() + 7) % 7 || 7));
  return day.toISOString().slice(0, 10);
}

/** Current hour (0-23) in Manila, whatever the device's own time zone. */
export function manilaHour(date: Date = new Date()): number {
  return Number(new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', hourCycle: 'h23' }).format(date));
}

/** The Manila calendar date the given number of days after `dateStr` ("YYYY-MM-DD"). */
export function addDaysToDateString(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + days));
  return next.toISOString().slice(0, 10);
}

/** Short date: "Jan 15, 2024" */
export function formatDate(dateString: string | null | undefined): string {
  if (!dateString) return 'N/A';
  return new Date(normalizeTimestamp(dateString)).toLocaleDateString('en-PH', {
    timeZone: TZ,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/** Date + time: "Jan 15, 2024, 6:00 PM" */
export function formatDateTime(dateString: string | null | undefined): string {
  if (!dateString) return 'N/A';
  return new Date(normalizeTimestamp(dateString)).toLocaleString('en-PH', {
    timeZone: TZ,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** Time only: "6:00 PM" */
export function formatTime(dateString: string | null | undefined): string {
  if (!dateString) return 'N/A';
  return new Date(normalizeTimestamp(dateString)).toLocaleTimeString('en-PH', {
    timeZone: TZ,
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * True when `later` is meaningfully after `earlier`.
 *
 * created_at and updated_at are written by separate clock reads on insert, so a
 * brand-new record's timestamps differ by microseconds. The tolerance stops that
 * from being mistaken for a real edit.
 */
export function isMeaningfullyLater(
  later: string | null | undefined,
  earlier: string | null | undefined,
  toleranceMs = 2000,
): boolean {
  if (!later || !earlier) return false;
  const a = new Date(later).getTime();
  const b = new Date(earlier).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return false;
  return a - b > toleranceMs;
}

/** Day label for chart axes: "15" */
export function formatDayLabel(dateString: string): string {
  return new Date(dateString + 'T00:00:00').toLocaleDateString('en-PH', {
    timeZone: TZ,
    day: 'numeric',
  });
}

/** Short month+day for chart tooltips: "Jan 15" */
export function formatShortDate(dateString: string): string {
  return new Date(dateString + 'T00:00:00').toLocaleDateString('en-PH', {
    timeZone: TZ,
    month: 'short',
    day: 'numeric',
  });
}
