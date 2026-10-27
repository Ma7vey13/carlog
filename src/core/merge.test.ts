import { describe, expect, it } from 'vitest';
import { mergeTable, pickWinner } from './merge';
import type { SyncFields } from './model';

type Rec = SyncFields & { value: string };
const rec = (id: string, updatedAt: string, deviceId: string, value: string, deleted = false): Rec => ({
  id,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt,
  deleted,
  deviceId,
  value,
});

const T1 = '2026-03-01T10:00:00.000Z';
const T2 = '2026-03-01T10:00:01.000Z';

describe('pickWinner', () => {
  it('newer edit wins', () => {
    expect(pickWinner(rec('a', T1, 'phone', 'old'), rec('a', T2, 'pc', 'new')).value).toBe('new');
    expect(pickWinner(rec('a', T2, 'phone', 'new'), rec('a', T1, 'pc', 'old')).value).toBe('new');
  });

  it('a deletion is an ordinary edit', () => {
    expect(pickWinner(rec('a', T1, 'phone', 'x'), rec('a', T2, 'pc', 'x', true)).deleted).toBe(true);
    expect(pickWinner(rec('a', T2, 'phone', 'edited after delete'), rec('a', T1, 'pc', 'x', true)).deleted).toBe(false);
  });

  it('a tie is decided by deviceId, the same way on both devices', () => {
    const phone = rec('a', T1, 'phone', 'from phone');
    const pc = rec('a', T1, 'pc', 'from pc');
    expect(pickWinner(phone, pc).value).toBe('from phone');
    expect(pickWinner(pc, phone).value).toBe('from phone');
  });

  it('compares times, not strings (with and without milliseconds)', () => {
    expect(pickWinner(rec('a', '2026-03-01T10:00:00Z', 'x', 'a'), rec('a', '2026-03-01T10:00:00.500Z', 'x', 'b')).value).toBe('b');
  });
});

describe('mergeTable', () => {
  it('both devices changed different things without syncing: nothing is lost', () => {
    const base = [rec('v1', T1, 'phone', 'visit 1'), rec('v2', T1, 'phone', 'visit 2')];
    // Phone: edits v1, adds v3. PC: deletes v2, adds v4.
    const phone = [rec('v1', T2, 'phone', 'visit 1 edited'), base[1]!, rec('v3', T2, 'phone', 'visit 3')];
    const pc = [base[0]!, rec('v2', T2, 'pc', 'visit 2', true), rec('v4', T2, 'pc', 'visit 4')];

    const onPhone = mergeTable(phone, pc);
    const onPc = mergeTable(pc, phone);
    const view = (rs: Rec[]) => rs.map((r) => `${r.id}:${r.value}${r.deleted ? ':deleted' : ''}`).sort();
    const expected = ['v1:visit 1 edited', 'v2:visit 2:deleted', 'v3:visit 3', 'v4:visit 4'];
    expect(view(onPhone.merged)).toEqual(expected);
    expect(view(onPc.merged)).toEqual(expected);
    expect(view(onPhone.toLocal)).toEqual(['v2:visit 2:deleted', 'v4:visit 4']);
    expect(onPhone.localWins).toBe(1); // v1
  });

  it('identical records produce no writes', () => {
    const a = [rec('x', T1, 'phone', 'same')];
    expect(mergeTable(a, structuredClone(a))).toMatchObject({ toLocal: [], localWins: 0 });
  });

  it('merging is idempotent', () => {
    const local = [rec('a', T1, 'p', '1'), rec('b', T2, 'p', '2')];
    const remote = [rec('a', T2, 'q', '1b'), rec('c', T1, 'q', '3')];
    const once = mergeTable(local, remote).merged;
    expect(mergeTable(once, remote).toLocal).toEqual([]);
  });
});
