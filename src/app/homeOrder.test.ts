import { describe, expect, it } from 'vitest';
import { HOME_BLOCKS, moveBlock, normalizeOrder } from './homeOrder';

describe('order of the main screen blocks', () => {
  it('starts from the default order', () => {
    expect(normalizeOrder(null)).toEqual([...HOME_BLOCKS]);
    expect(normalizeOrder('broken')).toEqual([...HOME_BLOCKS]);
  });

  it('keeps a saved order, drops unknown and repeated ids, puts missing blocks after their neighbour', () => {
    expect(normalizeOrder(['urgent', 'tiles', 'mileage', 'nope', 'urgent'])).toEqual([
      'urgent',
      // missing ones follow the block they come after by default: "Нужно отремонтировать" after "Пора заняться"
      'repairs',
      'docs',
      'selfcheck',
      'inbox',
      'gray',
      'green',
      'sync',
      'tiles',
      'mileage',
    ]);
  });

  it('moves a block', () => {
    const order = normalizeOrder(null);
    expect(moveBlock(order, 1, 2).slice(0, 3)).toEqual(['mileage', 'urgent', 'tiles']);
    expect(moveBlock(order, 0, 99)).toEqual(order);
  });
});
