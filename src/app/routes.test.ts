import { describe, expect, it } from 'vitest';
import { hrefFor, parseHash, TABS } from './routes';

describe('parseHash', () => {
  it('treats an empty hash as the home tab', () => {
    expect(parseHash('')).toEqual({ tab: 'state', path: '/', rest: [] });
    expect(parseHash('#')).toEqual({ tab: 'state', path: '/', rest: [] });
    expect(parseHash('#/')).toEqual({ tab: 'state', path: '/', rest: [] });
  });

  it('recognises every tab', () => {
    for (const tab of TABS) {
      expect(parseHash(hrefFor(tab.path)).tab).toBe(tab.id);
    }
  });

  it('keeps nested segments and drops query and trailing slash', () => {
    expect(parseHash('#/history/visit-1/?from=search')).toEqual({
      tab: 'history',
      path: '/history/visit-1',
      rest: ['visit-1'],
    });
  });

  it('decodes segments and tolerates broken encoding', () => {
    expect(parseHash('#/history/%D0%BA%D0%BE%D0%BB').rest).toEqual(['кол']);
    expect(parseHash('#/history/%E0%A4%A').rest).toEqual(['%E0%A4%A']);
  });

  it('keeps the home tab for its cards', () => {
    expect(parseHash('#/state/item/abc')).toEqual({ tab: 'state', path: '/state/item/abc', rest: ['item', 'abc'] });
  });

  it('returns no tab for unknown paths', () => {
    expect(parseHash('#/nope').tab).toBeNull();
  });

  it('accepts a hash without the leading slash', () => {
    expect(parseHash('#inbox').tab).toBe('inbox');
  });
});
