// Hash-based routes (DECISIONS.md, D-003): GitHub Pages has no SPA fallback,
// and `#/history` works the same online, offline and in the installed app.

export type TabId = 'state' | 'history' | 'inbox' | 'regulation' | 'more';

export interface Tab {
  id: TabId;
  path: string;
  label: string;
  title: string;
}

export const TABS: readonly Tab[] = [
  { id: 'state', path: '/', label: 'Состояние', title: 'Состояние авто' },
  { id: 'history', path: '/history', label: 'История', title: 'История' },
  { id: 'inbox', path: '/inbox', label: 'Входящие', title: 'Входящие' },
  { id: 'regulation', path: '/regulation', label: 'Регламент', title: 'Регламент' },
  { id: 'more', path: '/more', label: 'Ещё', title: 'Ещё' },
];

export interface Route {
  /** Tab the route belongs to, or null for an unknown path. */
  tab: TabId | null;
  /** Normalised path without the leading `#`, e.g. `/history`. */
  path: string;
  /** Path segments after the tab segment, e.g. `/history/abc` → ['abc']. */
  rest: string[];
}

/** Parses `location.hash` (`#/history/abc?x=1`) into a route. Empty hash is the home tab. */
export function parseHash(hash: string): Route {
  let path = hash.replace(/^#/, '').split('?')[0] ?? '';
  if (!path.startsWith('/')) path = '/' + path;
  path = path.replace(/\/+$/, '') || '/';

  const segments = path.split('/').filter(Boolean).map(safeDecode);
  if (segments.length === 0) return { tab: 'state', path: '/', rest: [] };

  const [first, ...rest] = segments;
  // The home tab lives at `/`; its cards are `/state/item/<id>` and `/state/component/<id>`.
  if (first === 'state') return { tab: 'state', path, rest };
  const tab = TABS.find((t) => t.path === '/' + first);
  return { tab: tab ? tab.id : null, path, rest };
}

/** Builds the href for a path: `/history` → `#/history`. */
export function hrefFor(path: string): string {
  return '#' + (path.startsWith('/') ? path : '/' + path);
}

function safeDecode(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}
