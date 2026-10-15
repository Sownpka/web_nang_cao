const rtf = new Intl.RelativeTimeFormat('vi', { numeric: 'auto' });
const dtf = new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'medium' });

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
  ['second', 1],
];

/** "3 phút trước" style label. */
export function formatRelative(iso: string, now = Date.now()): string {
  const diffSec = Math.round((new Date(iso).getTime() - now) / 1000);
  for (const [unit, size] of UNITS) {
    if (Math.abs(diffSec) >= size || unit === 'second') {
      if (unit === 'second' && Math.abs(diffSec) < 10) return 'vừa xong';
      return rtf.format(Math.round(diffSec / size), unit);
    }
  }
  return dtf.format(new Date(iso));
}

export const formatDateTime = (iso: string) => dtf.format(new Date(iso));
