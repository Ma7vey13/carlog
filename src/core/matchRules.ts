// Learned line bindings (SPEC section 7, "Привязка строк"): raw name → normalised name,
// component, regulation items. Created when the owner corrects a line and ticks
// "Запомнить для похожих строк"; applied before keyword suggestions.

import type { MatchRule } from './model';
import { matchKey } from './normalize';

/**
 * Key that makes "similar" lines match: matchKey without numbers in brackets-free form.
 * "Супорт тормозной зад.(лев.) SFN" and "СУППОРТ ТОРМОЗНОЙ ЗАД (ЛЕВ) SFN" share one key.
 */
export function ruleKey(rawName: string): string {
  return matchKey(rawName);
}

export function findRule(rawName: string, rules: readonly MatchRule[]): MatchRule | undefined {
  const key = ruleKey(rawName);
  if (!key) return undefined;
  // Newest edit wins if two rules share a key (possible after merging devices).
  return rules
    .filter((r) => !r.deleted && r.pattern === key)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
}
