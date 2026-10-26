// Display formatting shared by all screens. Pure functions, no DOM.

const NBSP = ' ';

/** ISO date `YYYY-MM-DD` → `ДД.ММ.ГГГГ`. Returns '' for empty or malformed input. */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return '';
  return `${m[3]}.${m[2]}.${m[1]}`;
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
