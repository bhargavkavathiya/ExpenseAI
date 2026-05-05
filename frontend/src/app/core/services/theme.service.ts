import { Injectable, signal, computed } from '@angular/core';

// App-wide light/dark theme controller.
//
// How it's wired:
//   - The current mode is exposed as a signal so components can `computed()`
//     off it (e.g. icon swaps).
//   - On change, we set `data-theme="light"` on <html>; styles.scss has a
//     bunch of `html[data-theme="light"] …` overrides that flip the surface
//     and text tokens. Dark is the default — no attribute needed for it.
//   - Choice is persisted to localStorage so reloads keep the user's pick.
//   - On first construction we honour: stored value > prefers-color-scheme
//     media query > dark (the original design baseline).
export type ThemeMode = 'dark' | 'light';

const STORAGE_KEY = 'uc10:theme';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly _mode = signal<ThemeMode>(this.resolveInitial());

  readonly mode = this._mode.asReadonly();
  readonly isLight = computed(() => this._mode() === 'light');

  constructor() {
    this.apply(this._mode());
  }

  toggle(): void {
    this.set(this._mode() === 'light' ? 'dark' : 'light');
  }

  set(mode: ThemeMode): void {
    this._mode.set(mode);
    this.apply(mode);
    try { localStorage.setItem(STORAGE_KEY, mode); } catch { /* private mode etc. — ignore */ }
  }

  private apply(mode: ThemeMode): void {
    const root = document.documentElement;
    if (mode === 'light') root.setAttribute('data-theme', 'light');
    else root.removeAttribute('data-theme');
  }

  private resolveInitial(): ThemeMode {
    // Light is the app default. Only an explicit user toggle (stored in
    // localStorage) flips to dark. We deliberately do NOT honour the OS
    // `prefers-color-scheme` setting — that's why an incognito window on
    // a dark-mode OS would otherwise open dark even though we've decided
    // light is the brand default.
    try {
      const stored = localStorage.getItem(STORAGE_KEY) as ThemeMode | null;
      if (stored === 'light' || stored === 'dark') return stored;
    } catch { /* ignore */ }
    return 'light';
  }
}
