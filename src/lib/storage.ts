// Browser-local settings: watchlist and theme. No account, nothing leaves the device.
const read = <T,>(key: string, fallback: T): T => {
  try { const raw = localStorage.getItem(key); return raw ? (JSON.parse(raw) as T) : fallback; } catch { return fallback; }
};
const write = (key: string, value: unknown) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode: keep in memory only */ } };

export const loadWatchlist = (): string[] => read<string[]>('ll.watchlist', []);
export const saveWatchlist = (list: string[]) => write('ll.watchlist', list);
export type Theme = 'light' | 'dark' | 'auto';
export const loadTheme = (): Theme => read<Theme>('ll.theme', 'auto');
export const saveTheme = (theme: Theme) => write('ll.theme', theme);
