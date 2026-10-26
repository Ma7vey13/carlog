import { describe, expect, it } from 'vitest';
import { detectPosition, matchKey, normalizeName } from './normalize';

describe('normalizeName', () => {
  it.each([
    // Typo fixes (SPEC section 11, page 3).
    ['Супорт тормозной зад.(лев.) SFN', 'Суппорт тормозной зад.(лев.) SFN'],
    ['Направляющая нижняя пер.супорта SFN', 'Направляющая нижняя пер.суппорта SFN'],
    ['Фильтр масляннный SFN', 'Фильтр масляный SFN'],
    // ALL CAPS → sentence case, abbreviations and Latin kept.
    ['ЗАМЕНА МАСЛА В АКПП (аппаратная)', 'Замена масла в АКПП (аппаратная)'],
    ['ЗАМЕНА ТОРМОЗНОГО СУППОРТА С/У', 'Замена тормозного суппорта с/у'],
    ['КАП.РЕМОНТ ДВИГАТЕЛЯ V-6 (с/у, переборка)', 'Кап.ремонт двигателя V-6 (с/у, переборка)'],
    ['ЗАМЕНА СТУПИЦЫ ЗАД. (SFN/F/L/Sorento R)', 'Замена ступицы зад. (SFN/F/L/Sorento R)'],
    ['ШЛИФОВКА ПЛОСКОСТИ ГБЦ И ОПРЕССОВКА', 'Шлифовка плоскости ГБЦ и опрессовка'],
    // Already mixed case: untouched except spacing.
    ['Колодки  тормозные перед.(OEM)   SFN', 'Колодки тормозные перед.(OEM) SFN'],
    ['ШРУС перед. внутр.(прав.) 2,7 SFN', 'ШРУС перед. внутр.(прав.) 2,7 SFN'],
    // Trailing dot: dropped after a brand, kept after an abbreviation.
    ['Фильтр салонный SFN.', 'Фильтр салонный SFN'],
    ['Масло мот.', 'Масло мот.'],
    ['', ''],
  ])('%j → %j', (raw, expected) => {
    expect(normalizeName(raw)).toBe(expected);
  });
});

describe('matchKey', () => {
  it('folds case, ё, punctuation and typos', () => {
    expect(matchKey('Супорт тормозной зад.(лев.)')).toBe('суппорт тормозной зад лев');
    expect(matchKey('Шины и колёса')).toBe('шины и колеса');
    expect(matchKey('КОЛОДКИ')).toBe(matchKey('колодки'));
  });
});

describe('detectPosition', () => {
  it.each([
    ['Колодки тормозные перед.(OEM) SFN', 'front', null],
    ['Направляющая нижняя пер.суппорта SFN', 'front', null],
    ['Пыльник направляющей суппорта переднего SFN', 'front', null],
    ['Суппорт тормозной зад.(лев.) SFN', 'rear', 'left'],
    ['ЗАМЕНА ЗАДНИХ ТОРМОЗНЫХ КОЛОДОК (диск-джип)', 'rear', null],
    ['ШРУС перед. внутр.(прав.) 2,7 SFN', 'front', 'right'],
    ['КАП.РЕМОНТ ДВИГАТЕЛЯ V-6 (с/у, переборка)', null, null],
    ['Профилактика тормозного диска', null, null],
  ])('%s', (name, axle, side) => {
    expect(detectPosition(name)).toEqual({ axle, side });
  });
});
