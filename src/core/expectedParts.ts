// "Work without its part" check (SPEC section 7, item 6): an oil change with no engine oil
// among the parts means the owner probably brought the oil. The rule list is editable.

import { seedId, SEED_TIMESTAMP } from './ids';
import type { ExpectedPartRule, LineKind } from './model';
import { matchKey } from './normalize';
import { searchStem } from './search';

const RULE_SEED_BASE = 0x2000;

type RuleSeed = Pick<ExpectedPartRule, 'label' | 'workKeywords' | 'partKeywords' | 'partName'>;

const DEFAULT_RULES: RuleSeed[] = [
  {
    label: 'Масло в двигателе',
    workKeywords: ['замена', 'масла', 'двигателе'],
    partKeywords: ['масло мот', 'масло моторн', 'моторное масло', 'масло двигат', '5w30', '5w 30', '5w40', '5w 40', '0w20', '0w30', '5w20', '10w40'],
    partName: 'Масло моторное',
  },
  { label: 'Масляный фильтр', workKeywords: ['замена', 'фильтра', 'двигателе'], partKeywords: ['фильтр масл', 'масляный фильтр'], partName: 'Фильтр масляный' },
  { label: 'Масло в АКПП', workKeywords: ['замена', 'масла', 'акпп'], partKeywords: ['масло акпп', 'atf'], partName: 'Масло АКПП' },
  { label: 'Масло в раздатке', workKeywords: ['замена', 'масла', 'раздаточной'], partKeywords: ['масло трансм', 'трансмисс', '75w90', '75w 90', 'gear oil'], partName: 'Масло трансмиссионное' },
  { label: 'Масло в заднем редукторе', workKeywords: ['замена', 'масла', 'редукторе'], partKeywords: ['масло трансм', 'трансмисс', '75w90', '75w 90', 'gear oil'], partName: 'Масло трансмиссионное' },
  { label: 'Воздушный фильтр', workKeywords: ['замена', 'воздушного', 'фильтра'], partKeywords: ['фильтр воздуш', 'воздушный фильтр'], partName: 'Фильтр воздушный' },
  { label: 'Салонный фильтр', workKeywords: ['замена', 'салонного', 'фильтра'], partKeywords: ['фильтр салон', 'салонный фильтр'], partName: 'Фильтр салонный' },
  { label: 'Передние колодки', workKeywords: ['замена', 'передних', 'колодок'], partKeywords: ['колодки'], partName: 'Колодки тормозные передние' },
  { label: 'Задние колодки', workKeywords: ['замена', 'задних', 'колодок'], partKeywords: ['колодки'], partName: 'Колодки тормозные задние' },
  { label: 'Свечи зажигания', workKeywords: ['замена', 'свечей'], partKeywords: ['свечи'], partName: 'Свечи зажигания' },
  { label: 'Антифриз', workKeywords: ['замена', 'антифриза'], partKeywords: ['антифриз', 'охлаждающ'], partName: 'Антифриз' },
  { label: 'Тормозная жидкость', workKeywords: ['замена', 'тормозной', 'жидкости'], partKeywords: ['тормозная жидкость', 'жидкость тормозн', 'dot'], partName: 'Тормозная жидкость' },
];

export const SEED_EXPECTED_PART_RULES: ExpectedPartRule[] = DEFAULT_RULES.map((r, i) => ({
  ...r,
  id: seedId(RULE_SEED_BASE + i),
  createdAt: SEED_TIMESTAMP,
  updatedAt: SEED_TIMESTAMP,
  deleted: false,
  deviceId: 'seed',
}));

/** Keyword match on word starts with light stemming: "масла" matches "масло", "масляный" does not. */
function hasKeyword(textKey: string, keyword: string): boolean {
  const words = matchKey(keyword).split(' ').filter(Boolean).map(searchStem);
  if (!words.length) return false;
  const tokens = textKey.split(' ');
  // Every keyword word must start some token; a multi-word keyword must be in order and adjacent.
  for (let i = 0; i < tokens.length; i++) {
    if (words.every((w, j) => tokens[i + j]?.startsWith(w))) return true;
  }
  return false;
}

export interface LineLike {
  key: string;
  kind: LineKind;
  name: string;
}

export interface MissingPart {
  rule: ExpectedPartRule;
  workLine: LineLike;
}

/** Work lines whose expected part is absent from the part/material lines. */
export function findMissingParts(lines: readonly LineLike[], rules: readonly ExpectedPartRule[]): MissingPart[] {
  const partKeys = lines.filter((l) => l.kind !== 'work').map((l) => matchKey(l.name));
  const result: MissingPart[] = [];
  for (const work of lines.filter((l) => l.kind === 'work')) {
    const workKey = matchKey(work.name);
    for (const rule of rules) {
      if (rule.deleted || rule.workKeywords.length === 0) continue;
      if (!rule.workKeywords.every((k) => hasKeyword(workKey, k))) continue;
      const present = partKeys.some((p) => rule.partKeywords.some((k) => hasKeyword(p, k)));
      if (!present) result.push({ rule, workLine: work });
    }
  }
  return result;
}
