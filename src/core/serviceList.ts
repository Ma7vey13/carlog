// "Список к ТО" (D-093): what to tell the service at the next visit. Items the service does that are
// due within the horizon, as "Заменить" / "Проверить", plus self-check items marked "Нужно внимание"
// (the owner noticed something; the master should look). Items the owner does himself stay out.

import type { Id } from './model';
import type { ItemSchedule, ScheduleStatus } from './schedule';
import { dueText } from './scheduleText';
import { selfCheckText, type SelfCheckStatus } from './selfCheck';

/** "Ближайшее ТО": what comes within this many km or days. */
export const SERVICE_LIST_HORIZON = { km: 2000, days: 60 } as const;

export type ServiceListGroup = 'replace' | 'inspect';

export const SERVICE_LIST_GROUP_TITLES: Record<ServiceListGroup, string> = { replace: 'Заменить', inspect: 'Проверить' };

export interface ServiceListEntry {
  id: Id;
  group: ServiceListGroup;
  /** As copied: the item name, a self-check name without the "(how)" part. */
  name: string;
  /** What the owner noted at the self-check; copied after the name. */
  note: string;
  status: ScheduleStatus | 'attention';
  /** Why it is in the list; shown on screen, never copied. */
  reason: string;
  /** Link to the item or self-check card. */
  path: string;
}

function isDueSoon(s: ItemSchedule, horizon: { km: number; days: number }): boolean {
  if (s.status === 'red' || s.status === 'yellow') return true;
  if (s.status !== 'green') return false;
  return (s.remainingKm !== null && s.remainingKm <= horizon.km) || (s.remainingDays !== null && s.remainingDays <= horizon.days);
}

/** Entries in schedule order (most urgent first), regulation items before self-check notes. */
export function serviceList(items: readonly ItemSchedule[], checks: readonly SelfCheckStatus[], horizon: { km: number; days: number } = SERVICE_LIST_HORIZON): ServiceListEntry[] {
  const out: ServiceListEntry[] = [];
  for (const s of items) {
    if (s.item.performer !== 'service' || !isDueSoon(s, horizon)) continue;
    out.push({
      id: s.item.id,
      group: s.item.action,
      name: s.item.name,
      note: '',
      status: s.status,
      reason: dueText(s),
      path: `/state/item/${s.item.id}`,
    });
  }
  for (const c of checks) {
    if (c.state !== 'attention') continue;
    out.push({
      id: c.item.id,
      group: 'inspect',
      name: c.item.name.replace(/\s*\(.*\)$/, ''),
      note: c.last?.note.trim() ?? '',
      status: 'attention',
      reason: selfCheckText(c),
      path: `/state/self-check/${c.item.id}`,
    });
  }
  return out;
}

/** The plain list for a messenger: two groups, one line per entry, nothing else. */
export function serviceListText(entries: readonly ServiceListEntry[]): string {
  const blocks: string[] = [];
  for (const group of ['replace', 'inspect'] as const) {
    const lines = entries.filter((e) => e.group === group).map((e) => `- ${e.name}${e.note ? ` — ${e.note}` : ''}`);
    if (lines.length) blocks.push(`${SERVICE_LIST_GROUP_TITLES[group]}:\n${lines.join('\n')}`);
  }
  return blocks.join('\n\n');
}
