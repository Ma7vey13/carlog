import { describe, expect, it } from 'vitest';
import { bundle, doc, line, reg } from '../../tests/fixtures/bundles';
import type { Repair } from './model';
import { regulationById } from './purpose';
import type { ServiceListEntry } from './serviceList';
import { partsForRepair, shoppingList, shoppingText } from './shopping';

const entry = (id: string, group: ServiceListEntry['group'], name: string): ServiceListEntry => ({ id, group, name, note: '', status: 'yellow', reason: '', path: '' });

const repair = (id: string, title: string, componentId: string | null = null): Repair => ({
  id,
  createdAt: '',
  updatedAt: '',
  deleted: false,
  deviceId: 'd',
  title,
  note: '',
  urgency: 'soon',
  componentId,
  doneDate: null,
  visitId: null,
});

describe('Что купить', () => {
  const OIL = reg('oil', { name: 'Масло двигателя', componentId: 'lube' });
  const PLUGS = reg('plugs', { name: 'Свечи зажигания' });
  const BRAKES = reg('brakes', { name: 'Тормозная система', action: 'inspect' });

  const older = bundle('2021-10-24', [
    {
      document: doc(),
      lines: [
        line('work', 'Замена масла', 45000, { regulationItemIds: ['oil'], componentId: 'lube' }),
        line('part', 'Фильтр маслянный SFN', 45000, { componentId: 'lube', brand: 'SFN' }),
        line('part', 'Масло мот. Eneos 5W-30', 261000, { componentId: 'lube', qty: 4.5, price: 58000, brand: 'Eneos' }),
        line('work', 'Замена стойки стабилизатора передней', 117000, { componentId: 'front' }),
        line('part', 'Стойка стабил. перед лев. SFN', 230000, { componentId: 'front' }),
      ],
    },
  ]);
  const newer = bundle('2022-11-24', [
    {
      document: doc(),
      lines: [
        line('work', 'Замена масла', 50000, { regulationItemIds: ['oil'] }),
        line('part', 'Фильтр маслянный SFN', 70000, { componentId: 'lube', article: '26300-35503' }),
        line('part', 'Масло мот. Eneos 5W-30', 382500, { componentId: 'lube', qty: 4.5, price: 85000 }),
        line('material', 'Расходные материалы', 20000, { componentId: 'lube' }),
        line('part', 'Колодки тормозные передние', 300000, { regulationItemIds: ['brakes'] }),
      ],
    },
  ]);
  const ctx = {
    regulation: regulationById([OIL, PLUGS, BRAKES]),
    repairs: new Map([
      ['r1', repair('r1', 'Стойки стабилизатора')],
      ['r2', repair('r2', 'ШРУС передний левый')],
    ]),
    bundles: [older, newer],
  };

  it('takes the parts of the last time, without the service consumables', () => {
    const list = shoppingList([entry('oil', 'replace', 'Масло двигателя'), entry('plugs', 'replace', 'Свечи зажигания')], ctx);
    expect(list.items.map((i) => [i.name, i.qty, i.price, i.article, i.date])).toEqual([
      ['Фильтр маслянный SFN', 1, 70000, '26300-35503', '2022-11-24'],
      ['Масло мот. Eneos 5W-30', 4.5, 85000, null, '2022-11-24'],
    ]);
    expect(list.notFound).toEqual(['Свечи зажигания']);
  });

  it('finds the parts of a repair by its name; an inspection is not ticked at first', () => {
    const list = shoppingList([entry('r1', 'repair', 'Стойки стабилизатора'), entry('r2', 'repair', 'ШРУС передний левый'), entry('brakes', 'inspect', 'Тормозная система')], ctx);
    expect(list.items.map((i) => [i.name, i.date, i.maybe, i.for])).toEqual([
      ['Стойка стабил. перед лев. SFN', '2021-10-24', false, ['Стойки стабилизатора']],
      ['Колодки тормозные передние', '2022-11-24', true, ['Тормозная система']],
    ]);
    expect(list.notFound).toEqual(['ШРУС передний левый']);
    // a repair on another node does not take parts of this one
    expect(partsForRepair(repair('x', 'Стойки стабилизатора', 'rear'), ctx.bundles)).toBeNull();
  });

  it('skips self-check notes and copies a plain list', () => {
    const list = shoppingList([entry('oil', 'replace', 'Масло двигателя'), entry('self', 'inspect', 'Подтёки под машиной')], ctx);
    expect(list.notFound).toEqual([]);
    expect(shoppingText(list.items).replace(/ /g, ' ')).toBe(
      'Купить:\n- Фильтр маслянный SFN — 1 шт, арт. 26300-35503, в прошлый раз 700 ₽\n- Масло мот. Eneos 5W-30 — 4,5 шт, в прошлый раз 850 ₽',
    );
    expect(shoppingText([])).toBe('');
  });
});
