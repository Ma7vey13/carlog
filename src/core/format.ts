// Display formatting shared by all screens. Pure functions, no DOM.

const NBSP = ' ';

/** ISO date `YYYY-MM-DD` → `ДД.ММ.ГГГГ`. Returns '' for empty or malformed input. */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return '';
  return `${m[3]}.${m[2]}.${m[1]}`;
}

/**
 * Timestamp (`createdAt`, build time) → local calendar date `ДД.ММ.ГГГГ`.
 * formatDate() on a UTC timestamp would show yesterday at night in Moscow (DECISIONS D-011).
 */
export function formatLocalDate(timestamp: string | null | undefined): string {
  if (!timestamp) return '';
  const d = new Date(timestamp);
  if (Number.isNaN(d.getTime())) return '';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}.${mm}.${d.getFullYear()}`;
}

/** Timestamp → local "ДД.ММ.ГГГГ ЧЧ:ММ". */
export function formatLocalDateTime(timestamp: string | null | undefined): string {
  const date = formatLocalDate(timestamp);
  if (!date) return '';
  const d = new Date(timestamp!);
  return `${date} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Groups thousands with a non-breaking space: 303700 → "303 700". */
export function groupThousands(n: number): string {
  const sign = n < 0 ? '-' : '';
  const digits = String(Math.trunc(Math.abs(n)));
  return sign + digits.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
}

/** Kilometres for display: 303700 → "303 700 км". */
export function formatKm(km: number): string {
  return `${groupThousands(km)}${NBSP}км`;
}

/** Byte size for the storage screen: 1536 → "1,5 КБ". */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  const units = ['Б', 'КБ', 'МБ', 'ГБ', 'ТБ'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  const rounded = unit === 0 ? String(Math.round(value)) : value.toFixed(value < 10 ? 1 : 0);
  return `${rounded.replace('.', ',')}${NBSP}${units[unit]}`;
}

/** Russian plural form: plural(3, 'день', 'дня', 'дней') → 'дня'. */
export function plural(n: number, one: string, few: string, many: string): string {
  const abs = Math.abs(n);
  const m10 = abs % 10;
  const m100 = abs % 100;
  return m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? few : many;
}
