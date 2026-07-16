const TZ = 'Asia/Manila';

/** Short date: "Jan 15, 2024" */
export function formatDate(dateString: string | null | undefined): string {
  if (!dateString) return 'N/A';
  return new Date(dateString).toLocaleDateString('en-PH', {
    timeZone: TZ,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/** Date + time: "Jan 15, 2024, 6:00 PM" */
export function formatDateTime(dateString: string | null | undefined): string {
  if (!dateString) return 'N/A';
  return new Date(dateString).toLocaleString('en-PH', {
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
  return new Date(dateString).toLocaleTimeString('en-PH', {
    timeZone: TZ,
    hour: 'numeric',
    minute: '2-digit',
  });
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
