import { useCallback, useEffect, useSyncExternalStore } from 'react';

// Keep the key and values in sync with public/theme-init.js.
const STORAGE_KEY = 'carlog.theme';

export type ThemeChoice = 'system' | 'light' | 'dark';

export const THEME_LABELS: Record<ThemeChoice, string> = {
  system: 'Системная',
  light: 'Светлая',
  dark: 'Тёмная',
};

const listeners = new Set<() => void>();

function readChoice(): ThemeChoice {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    // Storage unavailable: use the system theme.
  }
  return 'system';
}

let current: ThemeChoice = readChoice();

function apply(choice: ThemeChoice) {
  const root = document.documentElement;
  if (choice === 'system') delete root.dataset.theme;
  else root.dataset.theme = choice;
  syncThemeColor();
}

/** Updates <meta name="theme-color"> so the Android status bar matches the app bar. */
function syncThemeColor() {
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) return;
  const color = getComputedStyle(document.documentElement).getPropertyValue('--bar').trim();
  if (color) meta.content = color;
}

export function setTheme(choice: ThemeChoice) {
  current = choice;
  try {
    if (choice === 'system') localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, choice);
  } catch {
    // Not persisted, but still applied for this session.
  }
  apply(choice);
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Theme choice plus setter. Also follows the OS theme while the choice is "system". */
export function useTheme(): [ThemeChoice, (choice: ThemeChoice) => void] {
  const choice = useSyncExternalStore(subscribe, () => current);

  useEffect(() => {
    apply(current);
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => syncThemeColor();
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  return [choice, useCallback((c: ThemeChoice) => setTheme(c), [])];
}
