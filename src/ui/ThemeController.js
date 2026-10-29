// Theme selection affects CSS only, never game state or scoring.
export const THEME_STORAGE_KEY = 'skyracer_theme_v2';
export const DEFAULT_THEME = 'ember';

export function normalizeTheme(theme) {
    return theme === 'neon' ? 'neon' : DEFAULT_THEME;
}

export function getStoredTheme(storage) {
    try { return normalizeTheme(storage?.getItem(THEME_STORAGE_KEY)); }
    catch { return DEFAULT_THEME; }
}

export class ThemeController {
    constructor({ root = document.documentElement, storage = window.localStorage } = {}) {
        this.root = root;
        this.storage = storage;
        this.theme = getStoredTheme(storage);
        this.button = document.querySelector('[data-theme-toggle]');
        this.meta = document.querySelector('meta[name="theme-color"]');
        this.change = () => this.setTheme(this.theme === 'ember' ? 'neon' : 'ember');
        this.button?.addEventListener('click', this.change);
        this.#apply();
    }

    setTheme(nextTheme) {
        this.theme = normalizeTheme(nextTheme);
        try { this.storage?.setItem(THEME_STORAGE_KEY, this.theme); }
        catch { /* Storage-blocked sessions still support temporary switching. */ }
        this.#apply();
    }

    #apply() {
        this.root.dataset.theme = this.theme;
        if (this.meta) this.meta.content = this.theme === 'ember' ? '#080808' : '#0b0620';
        if (this.button) {
            const nextName = this.theme === 'ember' ? 'Neon / Cyan' : 'Orange / Black';
            this.button.textContent = 'APPEARANCE · ' + nextName;
            this.button.setAttribute('aria-label', 'Switch interface to ' + nextName);
            this.button.setAttribute('title', 'Switch interface to ' + nextName);
        }
    }

    dispose() {
        this.button?.removeEventListener('click', this.change);
    }
}
