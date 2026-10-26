// Line-name normalisation (SPEC section 7, "Привязка строк").
// The raw name is always kept as in the document; `name` is the cleaned-up version.

import type { LinePosition } from './model';

/** Known misspellings in service documents → correct stem. Matched case-insensitively at word start. */
const TYPO_STEMS: ReadonlyArray<[RegExp, string]> = [
  [/(?<![а-яё])супорт/giu, 'суппорт'],
  [/(?<![а-яё])маслянн+ый/giu, 'масляный'],
  [/(?<![а-яё])маслянный/giu, 'масляный'],
];

/** Abbreviations kept upper-case when an ALL-CAPS name is converted to sentence case. */
const ABBREVIATIONS = new Set([
  'АКПП', 'МКПП', 'КПП', 'ГРМ', 'ГБЦ', 'ШРУС', 'ШРУСА', 'ШРУСОВ', 'ГУР', 'ДВС', 'АКБ', 'ТО', 'ОЖ', 'ГСМ', 'ЭБУ', 'ДМРВ',
]);

const CYR = /[а-яё]/i;
const CYR_UPPER = /[А-ЯЁ]/;

/** Applies typo fixes, keeping the case of the first letter. */
function fixTypos(text: string): string {
  let out = text;
  for (const [re, stem] of TYPO_STEMS) {
    out = out.replace(re, (found) => matchCase(found, stem));
  }
  return out;
}

function matchCase(sample: string, replacement: string): string {
  if (sample === sample.toUpperCase()) return replacement.toUpperCase();
  if (sample[0] === sample[0]?.toUpperCase()) return replacement[0]!.toUpperCase() + replacement.slice(1);
  return replacement;
}

/**
 * True if most Cyrillic letters are upper-case ("ЗАМЕНА МАСЛА В АКПП").
 * Parenthesised notes are ignored: documents write "ЗАМЕНА МАСЛА В АКПП (аппаратная)".
 */
function isMostlyUpper(text: string): boolean {
  let letters = 0;
  let upper = 0;
  for (const ch of text.replace(/\([^)]*\)/g, ' ')) {
    if (CYR.test(ch)) {
      letters++;
      if (CYR_UPPER.test(ch)) upper++;
    }
  }
  return letters >= 4 && upper / letters > 0.7;
}

/** Sentence case for ALL-CAPS Cyrillic names; Latin tokens (brands, SFN, V-6) and abbreviations stay as is. */
function toSentenceCase(text: string): string {
  const tokens = text.split(/(\s+|[().,/«»"])/);
  const lowered = tokens.map((tok) => {
    if (!CYR.test(tok)) return tok;
    if (/[a-z0-9]/i.test(tok.replace(/[а-яё]/gi, ''))) return tok; // mixed with Latin/digits
    if (ABBREVIATIONS.has(tok.toUpperCase())) return tok.toUpperCase();
    // Only ALL-CAPS words are lowered; "Джип/М-вен" in a caps name is already written properly.
    return tok === tok.toUpperCase() ? tok.toLowerCase() : tok;
  });
  const joined = lowered.join('');
  const i = joined.search(/[а-яёa-z]/i);
  return i < 0 ? joined : joined.slice(0, i) + joined[i]!.toUpperCase() + joined.slice(i + 1);
}

/**
 * Cleans a document line name for display and grouping:
 * collapses spaces, fixes known typos, converts ALL CAPS to sentence case, drops a trailing dot.
 *   "ЗАМЕНА ТОРМОЗНОГО СУППОРТА С/У" → "Замена тормозного суппорта с/у"
 *   "Супорт тормозной зад.(лев.) SFN" → "Суппорт тормозной зад.(лев.) SFN"
 */
export function normalizeName(raw: string): string {
  let text = raw.replace(/[\s ]+/g, ' ').trim();
  if (!text) return '';
  text = fixTypos(text);
  if (isMostlyUpper(text)) text = toSentenceCase(text);
  return dropTrailingDot(text);
}

/**
 * "Фильтр салонный SFN." → "Фильтр салонный SFN", but "Масло мот." keeps the dot:
 * there it marks an abbreviation. Dropped only after a brand-like token or a long word.
 */
function dropTrailingDot(text: string): string {
  const m = /(\S+)\.$/.exec(text);
  if (!m) return text;
  const word = m[1]!;
  const brandLike = /^[A-Z0-9-]+$/.test(word);
  const longWord = word.length >= 6 && !/[.()/]/.test(word);
  return brandLike || longWord ? text.slice(0, -1) : text;
}

/**
 * Key for matching and search: lower case, ё → е, typos fixed, punctuation → spaces.
 * "Супорт тормозной зад.(лев.)" → "суппорт тормозной зад лев"
 */
export function matchKey(text: string): string {
  return fixTypos(text)
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^a-zа-я0-9]+/g, ' ')
    .trim();
}

const NOT_LETTER_BEFORE = '(?<![a-zа-я])';

/** Front/rear and left/right from a line name: "Колодки тормозные перед.(OEM)" → front. */
export function detectPosition(name: string): LinePosition {
  const t = name.toLowerCase().replace(/ё/g, 'е');
  const has = (stem: string) => new RegExp(NOT_LETTER_BEFORE + stem, 'u').test(t);
  const front = has('перед') || has('пер\\.') || has('пер ');
  const rear = has('зад');
  const left = has('лев');
  const right = has('прав');
  return {
    axle: front && !rear ? 'front' : rear && !front ? 'rear' : null,
    side: left && !right ? 'left' : right && !left ? 'right' : null,
  };
}
