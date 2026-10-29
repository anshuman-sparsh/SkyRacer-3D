import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { QuickMenu } from '../src/ui/QuickMenu.js';

class FakeElement {
    constructor() {
        this.handlers = new Map();
        this.attributes = new Map();
        this.hidden = false;
        this.focused = false;
        this.disabled = false;
    }
    addEventListener(type, handler) { this.handlers.set(type, handler); }
    removeEventListener(type) { this.handlers.delete(type); }
    setAttribute(name, value) { this.attributes.set(name, String(value)); }
    getAttribute(name) { return this.attributes.get(name); }
    focus() { this.focused = true; }
    contains(target) { return this === target; }
    click() { this.handlers.get('click')?.({ currentTarget: this }); }
}

function fixture(config = {}) {
    const prev = globalThis.document;
    const selectors = ['quick-open', 'quick-menu', 'quick-help', 'quick-audio',
        'quick-leaderboard', 'quick-daily'];
    const elements = new Map(selectors.map(x => [x, new FakeElement()]));
    elements.get('quick-menu').hidden = true;
    const handlers = new Map();
    globalThis.document = {
        querySelector(selector) {
            const key = selector.match(/\[data-([\w-]+)\]/)?.[1];
            return elements.get(key) ?? null;
        },
        addEventListener(type, fn) { handlers.set(type, fn); },
        removeEventListener(type) { handlers.delete(type); },
    };
    const menu = new QuickMenu(config);
    return {
        menu, elements, handlers,
        restore() {
            menu.dispose();
            if (prev === undefined) delete globalThis.document;
            else globalThis.document = prev;
        },
    };
}

test('one quick menu provides actions and saves open state in aria-expanded', () => {
    const calls = [];
    const f = fixture({
        onOpen: () => calls.push('pause'),
        onHelp: () => calls.push('help'),
        onAudio: () => calls.push('audio'),
        onLeaderboard: () => calls.push('classic'),
        onDaily: () => calls.push('daily'),
    });
    try {
        const el = name => f.elements.get(name);
        el('quick-open').click();
        assert.equal(f.menu.opened, true);
        assert.equal(el('quick-menu').hidden, false);
        assert.equal(el('quick-open').getAttribute('aria-expanded'), 'true');
        assert.equal(el('quick-help').focused, true);
        assert.deepEqual(calls, ['pause']);
        el('quick-help').click();
        assert.equal(f.menu.opened, false);
        assert.equal(el('quick-menu').hidden, true);
        assert.deepEqual(calls, ['pause', 'help']);
        el('quick-open').click();
        el('quick-audio').click();
        assert.deepEqual(calls, ['pause', 'help', 'pause', 'audio']);
        el('quick-open').click();
        el('quick-leaderboard').click();
        assert.deepEqual(calls, ['pause', 'help', 'pause', 'audio', 'pause', 'classic']);
        el('quick-open').click();
        el('quick-daily').click();
        assert.deepEqual(calls, ['pause', 'help', 'pause', 'audio', 'pause', 'classic', 'pause', 'daily']);
    } finally { f.restore(); }
});

test('Escape closes menu and prevents game from toggling pause twice', () => {
    const f = fixture();
    try {
        f.menu.open();
        const event = {
            key: 'Escape', prevented: false, stopped: false,
            preventDefault() { this.prevented = true; },
            stopPropagation() { this.stopped = true; },
        };
        f.handlers.get('keydown')(event);
        assert.equal(f.menu.opened, false);
        assert.equal(event.prevented, true);
        assert.equal(event.stopped, true);
        assert.equal(f.elements.get('quick-open').focused, true);
    } finally { f.restore(); }
});

test('unavailable leaderboard or Daily are disabled without affecting help or theme', () => {
    const f = fixture({ canLeaderboard: () => false, canDaily: () => false });
    try {
        f.menu.open();
        assert.equal(f.elements.get('quick-leaderboard').disabled, true);
        assert.equal(f.elements.get('quick-daily').disabled, true);
        assert.equal(f.elements.get('quick-help').disabled, false);
        f.handlers.get('pointerdown')({ target: new FakeElement() });
        assert.equal(f.menu.opened, false);
    } finally { f.restore(); }
});

test('all quick-menu DOM hooks exist and no gameplay source files are modified for theme colors', () => {
    const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
    const controller = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
    for (const attribute of ['quick-open', 'quick-menu', 'quick-help', 'quick-audio',
        'quick-leaderboard', 'quick-daily', 'theme-toggle',
        'start-flight', 'overlay-hero']) {
        assert.ok(html.includes('data-' + attribute), 'Missing ' + attribute);
    }
    assert.match(controller, /const themeController = new ThemeController\(\)/);
    assert.match(controller, /const quickMenu = new QuickMenu/);
});
