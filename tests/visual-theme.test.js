import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
    DEFAULT_THEME, THEME_STORAGE_KEY, normalizeTheme, getStoredTheme,
    ThemeController,
} from '../src/ui/ThemeController.js';

class FakeEl {
    constructor() {
        this.listeners = new Map();
        this.attrs = new Map();
        this.dataset = {};
        this.hidden = false;
        this.focusCount = 0;
        this.disabled = false;
    }

    addEventListener(name, handler) { this.listeners.set(name, handler); }
    removeEventListener(name) { this.listeners.delete(name); }
    setAttribute(name, value) { this.attrs.set(name, value); }
    getAttribute(name) { return this.attrs.get(name); }
    focus() { this.focusCount += 1; }
    click() { this.listeners.get('click')?.({ currentTarget: this }); }
    contains(target) { return target === this; }
}

test('neon cockpit theme is default while ember remains a supported saved choice', () => {
    assert.equal(DEFAULT_THEME, 'neon');
    assert.equal(normalizeTheme('ember'), 'ember');
    assert.equal(normalizeTheme('neon'), 'neon');
    assert.equal(normalizeTheme('injected-value'), 'neon');
    assert.equal(getStoredTheme({ getItem: () => 'neon' }), 'neon');
    assert.equal(getStoredTheme({ getItem: () => 'invalid' }), 'neon');
    assert.equal(getStoredTheme({ getItem: () => { throw Error('blocked'); } }), 'neon');
});

test('theme toggle persists a reversible choice without touching game state', () => {
    const previousDocument = globalThis.document;
    const root = new FakeEl();
    const button = new FakeEl();
    const meta = new FakeEl();
    const value = new Map();
    const storage = {
        getItem(key) { return value.get(key) ?? null; },
        setItem(key, next) { value.set(key, next); },
    };
    globalThis.document = {
        querySelector(selector) {
            return selector === '[data-theme-toggle]' ? button : meta;
        },
    };
    try {
        const theme = new ThemeController({ root, storage });
        assert.equal(root.dataset.theme, 'neon');
        assert.equal(meta.content, '#0b0620');
        assert.match(button.textContent, /Orange \/ Black/);
        button.click();
        assert.equal(root.dataset.theme, 'ember');
        assert.equal(meta.content, '#080808');
        assert.equal(value.get(THEME_STORAGE_KEY), 'ember');
        assert.match(button.textContent, /Neon \/ Cyan/);
        button.click();
        assert.equal(root.dataset.theme, 'neon');
        assert.equal(value.get(THEME_STORAGE_KEY), 'neon');
        theme.dispose();
        assert.equal(button.listeners.has('click'), false);
    } finally {
        if (previousDocument === undefined) delete globalThis.document;
        else globalThis.document = previousDocument;
    }
});

test('theme controller also works without writable localStorage', () => {
    const oldDocument = globalThis.document;
    const root = new FakeEl();
    const button = new FakeEl();
    const meta = new FakeEl();
    globalThis.document = {
        querySelector(sel) { return sel === '[data-theme-toggle]' ? button : meta; },
    };
    try {
        const theme = new ThemeController({
            root, storage: {
                getItem() { throw Error('blocked'); },
                setItem() { throw Error('blocked'); },
            },
        });
        assert.doesNotThrow(() => theme.setTheme('neon'));
        assert.equal(root.dataset.theme, 'neon');
        theme.dispose();
    } finally {
        if (oldDocument === undefined) delete globalThis.document;
        else globalThis.document = oldDocument;
    }
});

test('the real HTML and CSS define all three requested font roles and both themes', () => {
    const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
    const css = readFileSync(new URL('../src/styles/racing-ui.css', import.meta.url), 'utf8');
    assert.match(html, /fonts\.googleapis\.com/);
    assert.match(html, /Space\+Grotesk/);
    assert.match(html, /IBM\+Plex\+Mono/);
    assert.match(html, /Inter/);
    assert.match(html, /href="\/src\/styles\/racing-ui\.css"/);
    assert.match(css, /--sr-font-display:\s*"Space Grotesk"/);
    assert.match(css, /--sr-font-body:\s*"Inter"/);
    assert.match(css, /--sr-font-data:\s*"IBM Plex Mono"/);
    assert.match(css, /:root\[data-theme="ember"\]/);
    assert.match(css, /:root\[data-theme="neon"\]/);
    assert.doesNotMatch(css, /Rajdhani/);
    assert.match(css, /prefers-reduced-motion/);
});


test('orange pre-flight border remains whole while cyan styling is untouched', () => {
 const css = readFileSync(new URL('../src/styles/racing-ui.css', import.meta.url), 'utf8');
 const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
 assert.match(css, /:root\[data-theme="ember"\] \.state-overlay__content\s*\{\s*clip-path:\s*none;/);
 assert.match(css, /:root\[data-theme="ember"\] \.glass-panel\s*\{\s*clip-path:/);
 assert.doesNotMatch(css, /:root\[data-theme="neon"\] \.state-overlay__content/);
 assert.match(html, /<html lang="en" data-theme="neon">/);
 assert.match(html, /<meta name="theme-color" content="#0b0620"\s*\/>/);
 assert.match(html, /data-theme-toggle>APPEARANCE · Orange \/ Black/);
});
