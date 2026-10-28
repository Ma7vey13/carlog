// Russian wording for the schedule: "через 1 200 км или до 15.03.2027", "просрочено на 700 км".

import { formatDate, formatKm, groupThousands, plural } from './format';
import type { RegulationItem } from './model';
import type { Execution, IntervalStep, ItemSchedule } from './schedule';

const NBSP = ' ';

export function monthsText(n: number): string {
  return `${n}${NBSP}мес`;
}

/** A span of days in words: "22 дня" (under 1,5 months), "7 мес", "3,5 года". */
export function spanText(days: number): string {
  const months = Math.round(days / 30.44);
  if (days < 45) return `${days}${NBSP}${plural(days, 'день', 'дня', 'дней')}`;
  if (months < 24) return monthsText(months);
  const halves = Math.round(days / 182.6);
  const years = halves / 2;
  return Number.isInteger(years) ? `${years}${NBSP}${plural(years, 'год', 'года', 'лет')}` : `${String(years).replace('.', ',')}${NBSP}года`;
}

/** "10 000 км / 12 мес" — whatever parts the item has. */
export function intervalText(km: number | null, months: number | null): string {
  return [km ? formatKm(km) : '', months ? monthsText(months) : ''].filter(Boolean).join(' / ');
}

/** Normal interval plus the severe one: "10 000 км / 12 мес (тяжёлые условия: 7 500 км / 6 мес)". */
export function itemIntervalText(item: RegulationItem): string {
  const normal = intervalText(item.intervalKm, item.intervalMonths) || 'интервал не задан';
  const severe = intervalText(item.severeIntervalKm, item.severeIntervalMonths);
  return severe ? `${normal} (тяжёлые условия: ${severe})` : normal;
}

/**
 * What is left or how much it is overdue. When only one limit has come ("whichever comes first"),
 * it says which one and how much is left of the other: "по времени срок прошёл 11.04.2026 (12 мес);
 * по пробегу ещё 4 300 км".
 */
export function dueText(s: ItemSchedule): string {
  if (s.status === 'gray') return s.grayReason === 'no-interval' ? 'интервал не задан' : 'нет данных';
  const parts: string[] = [];
  const kmOver = s.remainingKm !== null && s.remainingKm <= 0;
  const dateOver = s.remainingDays !== null && s.remainingDays <= 0;
  if (kmOver && dateOver) {
    parts.push(s.remainingKm === 0 ? 'пробег подошёл' : `просрочено на ${formatKm(-s.remainingKm!)}`);
    parts.push(s.remainingDays === 0 ? 'срок сегодня' : `срок прошёл ${formatDate(s.dueDate)}`);
    return parts.join(', ');
  }
  if (dateOver) {
    const months = s.intervalMonths ? ` (${monthsText(s.intervalMonths)})` : '';
    if (s.remainingKm === null) return s.remainingDays === 0 ? 'срок сегодня' : `срок прошёл ${formatDate(s.dueDate)}${months}`;
    const time = s.remainingDays === 0 ? 'по времени срок сегодня' : `по времени срок прошёл ${formatDate(s.dueDate)}${months}`;
    return `${time}; по пробегу ещё ${formatKm(s.remainingKm)}`;
  }
  if (kmOver) {
    const km = s.remainingKm === 0 ? 'пробег подошёл' : `просрочено на ${formatKm(-s.remainingKm!)}`;
    return s.dueDate ? `${s.remainingKm === 0 ? km : `по пробегу ${km}`}; по времени — до ${formatDate(s.dueDate)}` : km;
  }
  if (s.remainingKm !== null) parts.push(`через ${formatKm(s.remainingKm)}`);
  if (s.dueDate) parts.push(`до ${formatDate(s.dueDate)}`);
  return parts.join(' или ');
}

/** Where the item is due: "313 700 км / 30.10.2026". */
export function dueAtText(s: ItemSchedule): string {
  return [s.dueKm !== null ? formatKm(s.dueKm) : '', s.dueDate ? formatDate(s.dueDate) : ''].filter(Boolean).join(' / ');
}

/** "30.10.2025, 303 700 км"; "≈" marks estimated values. */
export function executionText(e: Execution): string {
  const date = formatDate(e.date);
  if (e.km === null) return `${e.approximate ? '≈ ' : ''}${date}`;
  return e.approximate ? `≈ ${date}, ≈ ${formatKm(e.km)}` : `${date}, ${formatKm(e.km)}`;
}

/** Actual interval: "12.03.25 → 22.07.25, 5 000 км, 4 мес". */
export function stepText(step: IntervalStep): string {
  const short = (iso: string) => formatDate(iso).replace(/\.(\d{2})(\d{2})$/, '.$2');
  const span = spanText(step.days);
  const km = step.km !== null ? `${step.from.approximate || step.to.approximate ? '≈ ' : ''}${groupThousands(step.km)}${NBSP}км` : '';
  return `${short(step.from.date)} → ${short(step.to.date)}, ${[km, span].filter(Boolean).join(', ')}`;
}
