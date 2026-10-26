// Editing the "work → expected part" rule list (SPEC section 7, item 6).

import { nowIso } from '../core/dates';
import { newId } from '../core/ids';
import type { ExpectedPartRule, Id } from '../core/model';
import type { CarlogDB } from './db';
import { getDeviceId } from './device';

export type ExpectedPartRuleInput = Pick<ExpectedPartRule, 'label' | 'workKeywords' | 'partKeywords' | 'partName'>;

/** "масла, двигателе" → ["масла", "двигателе"] */
export function splitKeywords(text: string): string[] {
  return text
    .split(/[,;\n]/)
    .map((k) => k.trim().toLowerCase())
    .filter(Boolean);
}

export async function saveExpectedPartRule(db: CarlogDB, id: Id | null, input: ExpectedPartRuleInput): Promise<Id> {
  const deviceId = await getDeviceId(db);
  const now = nowIso();
  const prev = id ? await db.expectedPartRules.get(id) : undefined;
  const rule: ExpectedPartRule = {
    id: prev?.id ?? newId(),
    createdAt: prev?.createdAt ?? now,
    updatedAt: now,
    deleted: false,
    deviceId,
    ...input,
  };
  await db.expectedPartRules.put(rule);
  return rule.id;
}

export async function deleteExpectedPartRule(db: CarlogDB, id: Id): Promise<void> {
  const deviceId = await getDeviceId(db);
  await db.expectedPartRules.update(id, { deleted: true, updatedAt: nowIso(), deviceId });
}
