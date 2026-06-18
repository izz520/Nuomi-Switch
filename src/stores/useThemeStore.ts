import { create } from 'zustand';

export type ThemePreference = 'light' | 'dark' | 'auto';
export type ResolvedTheme = 'light' | 'dark';

const STORAGE_KEY = 'codex-lite-theme';

function systemTheme(): ResolvedTheme {
  if (typeof window === 'undefined' || !window.matchMedia) return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function readStored(): ThemePreference {
  if (typeof localStorage === 'undefined') return 'auto';
  const value = localStorage.getItem(STORAGE_KEY);
  return value === 'light' || value === 'dark' || value === 'auto' ? value : 'auto';
}

function resolve(pref: ThemePreference): ResolvedTheme {
  return pref === 'auto' ? systemTheme() : pref;
}

export function applyTheme(resolved: ResolvedTheme): void {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.theme = resolved;
}

/** Apply the stored preference to the DOM as early as possible (called before render to avoid a flash). */
export function initTheme(): void {
  applyTheme(resolve(readStored()));
}

interface ThemeState {
  preference: ThemePreference;
  resolved: ResolvedTheme;
  setPreference: (preference: ThemePreference) => void;
  toggle: () => void;
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  preference: readStored(),
  resolved: resolve(readStored()),
  setPreference(preference) {
    const resolved = resolve(preference);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, preference);
    }
    applyTheme(resolved);
    set({ preference, resolved });
  },
  toggle() {
    get().setPreference(get().resolved === 'dark' ? 'light' : 'dark');
  },
}));

// Keep 'auto' in sync with the OS preference while the app is open.
if (typeof window !== 'undefined' && window.matchMedia) {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (useThemeStore.getState().preference !== 'auto') return;
    const resolved = systemTheme();
    applyTheme(resolved);
    useThemeStore.setState({ resolved });
  });
}
