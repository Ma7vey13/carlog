import { describe, expect, it } from 'vitest';
import { reg } from '../../tests/fixtures/bundles';
import type { RegulationItem, SelfCheckItem } from './model';
import type { ItemSchedule, ScheduleStatus } from './schedule';
import type { SelfCheckStatus } from './selfCheck';
import { repairEntries, serviceList, serviceListText } from './serviceList';

const sched = (item: RegulationItem, status: ScheduleStatus, remainingKm: number | null, remainingDays: number | null): ItemSchedule => ({
  item,
  status,
  grayReason: status === 'gray' ? 'no-data' : null,
  last: null,
  executions: [],
  intervalKm: item.intervalKm,
  intervalMonths: item.intervalMonths,
  severeUsed: false,
  dueKm: remainingKm === null ? null : 310000 + remainingKm,
  dueDate: remainingDays === null ? null : '2026-12-01',
  remainingKm,
  remainingDays,
  urgencyDays: null,
});

const check = (name: string, state: SelfCheckStatus['state'], note = ''): SelfCheckStatus => {
  const item: SelfCheckItem = { id: name, createdAt: '', updatedAt: '', deleted: false, deviceId: 'd', name, periodDays: 30, howTo: '', order: 1 };
  const last = { id: 'log', createdAt: '', updatedAt: '', deleted: false, deviceId: 'd', itemId: name, date: '2026-10-20', result: state === 'attention' ? ('attention' as const) : ('ok' as const), note };
  return { item, state, last, nextDate: null, daysLeft: null, logs: [last] };
};

describe('Список к ТО', () => {
  const oil = reg('Масло двигателя');
  const air = reg('Воздушный фильтр');
  const plugs = reg('Свечи зажигания');
  const brakes = reg('Тормозная система', { action: 'inspect' });
  const wipers = reg('Щётки', { performer: 'self' });
  const coolant = reg('Антифриз');

  const items = [
    sched(oil, 'red', -300, 20),
    sched(brakes, 'yellow', 800, 100),
    sched(air, 'green', 1500, 300), // within 2 000 km
    sched(plugs, 'green', 9000, 45), // within 2 months
    sched(coolant, 'green', 9000, 300), // not yet
    sched(wipers, 'red', null, -5), // the owner does it himself
    sched(reg('Ремень ГРМ'), 'gray', null, null),
  ];
  const checks = [check('Подтёки под машиной после стоянки', 'attention', 'тёмное пятно'), check('Давление в шинах, включая запаску', 'ok'), check('Уровень моторного масла (на холодном, на ровном месте)', 'attention')];

  it('takes what the service does within 2 000 km or 2 months, and self-check notes', () => {
    const list = serviceList(items, checks);
    expect(list.map((e) => [e.group, e.name])).toEqual([
      ['replace', 'Масло двигателя'],
      ['inspect', 'Тормозная система'],
      ['replace', 'Воздушный фильтр'],
      ['replace', 'Свечи зажигания'],
      ['inspect', 'Подтёки под машиной после стоянки'],
      ['inspect', 'Уровень моторного масла'],
    ]);
    expect(list[0]!.reason.replace(/ /g, ' ')).toBe('по пробегу просрочено на 300 км; по времени — до 01.12.2026');
  });

  it('copies as a plain list: what to replace, what to check', () => {
    expect(serviceListText(serviceList(items, checks))).toBe(
      [
        'Заменить:',
        '- Масло двигателя',
        '- Воздушный фильтр',
        '- Свечи зажигания',
        '',
        'Проверить:',
        '- Тормозная система',
        '- Подтёки под машиной после стоянки — тёмное пятно',
        '- Уровень моторного масла',
      ].join('\n'),
    );
  });

  it('leaves out an empty group', () => {
    expect(serviceListText(serviceList([sched(oil, 'yellow', 500, 200)], []))).toBe('Заменить:\n- Масло двигателя');
    expect(serviceListText([])).toBe('');
  });

  it('adds picked repairs as the third group', () => {
    const repair = { id: 'r1', createdAt: '', updatedAt: '', deleted: false, deviceId: 'd', title: 'ШРУС передний левый', note: 'хрустит при повороте', urgency: 'urgent' as const, componentId: null, doneDate: null, visitId: null };
    const entries = repairEntries([repair]);
    expect(entries[0]).toMatchObject({ group: 'repair', status: 'red', reason: 'Срочно', path: '/state/repairs/r1' });
    expect(serviceListText([...serviceList([sched(oil, 'yellow', 500, 200)], []), ...entries])).toBe(
      'Заменить:\n- Масло двигателя\n\nОтремонтировать:\n- ШРУС передний левый — хрустит при повороте',
    );
  });
});
