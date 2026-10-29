// Order of the blocks on the main screen (D-098). The owner rearranges them with "Изменить порядок";
// the order is kept on this device only (a phone and a computer may want different ones).

export const HOME_BLOCKS = ['mileage', 'tiles', 'urgent', 'repairs', 'docs', 'selfcheck', 'inbox', 'gray', 'green', 'sync'] as const;

export type HomeBlock = (typeof HOME_BLOCKS)[number];

export const HOME_BLOCK_LABELS: Record<HomeBlock, string> = {
  mileage: 'Пробег',
  tiles: 'Плитки: список к ТО, ремонт, самопроверка, документы',
  urgent: 'Пора заняться',
  repairs: 'Нужно отремонтировать',
  docs: 'Документы со сроком',
  selfcheck: 'Самопроверка',
  inbox: 'Входящие',
  gray: 'Нет данных',
  green: 'В порядке',
  sync: 'Синхронизация',
};

const KEY = 'carlog.homeOrder';

/**
 * A saved order made whole: unknown and repeated ids dropped, blocks missing from it (added in a
 * later version) put right after the block they follow by default.
 */
export function normalizeOrder(saved: unknown): HomeBlock[] {
  const known = new Set<string>(HOME_BLOCKS);
  const out: HomeBlock[] = [];
  if (Array.isArray(saved)) for (const id of saved) if (typeof id === 'string' && known.has(id) && !out.includes(id as HomeBlock)) out.push(id as HomeBlock);
  HOME_BLOCKS.forEach((id, i) => {
    if (out.includes(id)) return;
    const before = HOME_BLOCKS.slice(0, i).reverse().find((b) => out.includes(b));
    out.splice(before ? out.indexOf(before) + 1 : 0, 0, id);
  });
  return out;
}

/** Moves the block at `from` to index `to`. */
export function moveBlock(order: readonly HomeBlock[], from: number, to: number): HomeBlock[] {
  const next = [...order];
  if (from < 0 || from >= next.length || to < 0 || to >= next.length || from === to) return next;
  const [block] = next.splice(from, 1);
  next.splice(to, 0, block!);
  return next;
}

export function loadHomeOrder(): HomeBlock[] {
  try {
    const raw = localStorage.getItem(KEY);
    return normalizeOrder(raw ? JSON.parse(raw) : null);
  } catch {
    return [...HOME_BLOCKS];
  }
}

export function saveHomeOrder(order: readonly HomeBlock[] | null): void {
  try {
    if (order === null) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, JSON.stringify(order));
  } catch {
    // Private mode: the order lasts until the page is closed.
  }
}
