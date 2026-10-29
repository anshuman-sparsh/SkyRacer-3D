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
        this.textContent = '';
        this.parent = null;
    }
    addEventListener(type, handler) { this.handlers.set(type, handler); }
    removeEventListener(type) { this.handlers.delete(type); }
    setAttribute(name, value) { this.attributes.set(name, String(value)); }
    getAttribute(name) { return this.attributes.get(name); }
    focus() { this.focused = true; }
    contains(target) {
        for (let node = target; node; node = node.parent) {
            if (node === this) return true;
        }
        return false;
    }
    click() { this.handlers.get('click')?.({ currentTarget: this }); }
}

function fixture(config = {}) {
    const prev = globalThis.document;
    const selectors = ['quick-open', 'quick-menu', 'quick-help', 'quick-audio',
        'quick-audio-group', 'quick-audio-panel', 'quick-audio-on', 'quick-audio-off',
        'quick-audio-state', 'quick-leaderboard', 'quick-daily'];
    const elements = new Map(selectors.map(x => [x, new FakeElement()]));
    const get = name => elements.get(name);
    get('quick-menu').hidden = true;
    get('quick-audio-panel').hidden = true;
    for (const name of ['quick-help', 'quick-audio-group', 'quick-leaderboard', 'quick-daily']) {
        get(name).parent = get('quick-menu');
    }
    get('quick-audio').parent = get('quick-audio-group');
    get('quick-audio-state').parent = get('quick-audio');
    get('quick-audio-panel').parent = get('quick-audio-group');
    get('quick-audio-on').parent = get('quick-audio-panel');
    get('quick-audio-off').parent = get('quick-audio-panel');

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
        menu, elements, handlers, get,
        restore() {
            menu.dispose();
            if (prev === undefined) delete globalThis.document;
            else globalThis.document = prev;
        },
    };
}

test('quick menu opens audio popover without changing audio or closing navigation', () => {
    const calls = [];
    let enabled = true;
    const f = fixture({
        onOpen: () => calls.push('pause'),
        onHelp: () => calls.push('help'),
        getAudioEnabled: () => enabled,
        onAudioChange: (on) => { enabled = on; calls.push('audio-' + on); },
        onLeaderboard: () => calls.push('classic'),
        onDaily: () => calls.push('daily'),
    });
    try {
        const el = f.get;
        el('quick-open').click();
        assert.equal(f.menu.opened, true);
        assert.equal(el('quick-menu').hidden, false);
        assert.equal(el('quick-open').getAttribute('aria-expanded'), 'true');
        assert.equal(el('quick-help').focused, true);
        assert.deepEqual(calls, ['pause']);

        el('quick-audio').click();
        assert.equal(f.menu.opened, true);
        assert.equal(f.menu.audioOpen, true);
        assert.equal(el('quick-audio-panel').hidden, false);
        assert.equal(el('quick-audio').getAttribute('aria-expanded'), 'true');
        assert.equal(el('quick-audio-on').getAttribute('aria-pressed'), 'true');
        assert.equal(el('quick-audio-off').getAttribute('aria-pressed'), 'false');
        assert.equal(el('quick-audio-on').focused, true);
        assert.equal(el('quick-audio-state').textContent, 'ON');
        assert.deepEqual(calls, ['pause'], 'Opening audio must not change sound');

        el('quick-audio-off').click();
        assert.equal(enabled, false);
        assert.equal(f.menu.audioOpen, true);
        assert.equal(f.menu.opened, true);
        assert.equal(el('quick-audio-state').textContent, 'OFF');
        assert.equal(el('quick-audio-on').getAttribute('aria-pressed'), 'false');
        assert.equal(el('quick-audio-off').getAttribute('aria-pressed'), 'true');
        el('quick-audio-on').click();
        assert.equal(enabled, true);
        assert.equal(el('quick-audio-state').textContent, 'ON');
        assert.deepEqual(calls, ['pause', 'audio-false', 'audio-true']);

        el('quick-audio').click();
        assert.equal(f.menu.audioOpen, false);
        assert.equal(f.menu.opened, true);
        assert.equal(el('quick-audio-panel').hidden, true);
        assert.equal(el('quick-audio').getAttribute('aria-expanded'), 'false');

        el('quick-help').click();
        assert.equal(f.menu.opened, false);
        assert.deepEqual(calls, ['pause', 'audio-false', 'audio-true', 'help']);
        el('quick-open').click();
        el('quick-leaderboard').click();
        el('quick-open').click();
        el('quick-daily').click();
        assert.deepEqual(calls, [
            'pause', 'audio-false', 'audio-true', 'help',
            'pause', 'classic', 'pause', 'daily',
        ]);
    } finally { f.restore(); }
});

test('Escape dismisses audio first; second Escape dismisses main menu', () => {
    const f = fixture();
    try {
        f.menu.open();
        f.get('quick-audio').click();
        const makeEvent = () => ({
            key: 'Escape', prevented: false, stopped: false,
            preventDefault() { this.prevented = true; },
            stopPropagation() { this.stopped = true; },
        });
        const first = makeEvent();
        f.handlers.get('keydown')(first);
        assert.equal(first.prevented, true);
        assert.equal(first.stopped, true);
        assert.equal(f.menu.audioOpen, false);
        assert.equal(f.menu.opened, true);
        assert.equal(f.get('quick-audio').focused, true);
        const second = makeEvent();
        f.handlers.get('keydown')(second);
        assert.equal(second.prevented, true);
        assert.equal(second.stopped, true);
        assert.equal(f.menu.opened, false);
        assert.equal(f.get('quick-open').focused, true);
    } finally { f.restore(); }
});

test('outside audio row closes only the popover; outside menu closes everything', () => {
    const f = fixture();
    try {
        f.menu.open();
        f.get('quick-audio').click();
        f.handlers.get('pointerdown')({ target: f.get('quick-audio-on') });
        assert.equal(f.menu.audioOpen, true, 'Popover interaction stays open');
        f.handlers.get('pointerdown')({ target: f.get('quick-help') });
        assert.equal(f.menu.audioOpen, false);
        assert.equal(f.menu.opened, true);
        f.get('quick-audio').click();
        f.handlers.get('pointerdown')({ target: new FakeElement() });
        assert.equal(f.menu.audioOpen, false);
        assert.equal(f.menu.opened, false);
    } finally { f.restore(); }
});

test('audio popover reflects externally updated sound state', () => {
    let enabled = true;
    const f = fixture({ getAudioEnabled: () => enabled });
    try {
        enabled = false;
        f.menu.open();
        assert.equal(f.get('quick-audio-state').textContent, 'OFF');
        f.get('quick-audio').click();
        assert.equal(f.get('quick-audio-off').getAttribute('aria-pressed'), 'true');
        enabled = true;
        f.menu.refreshAudio();
        assert.equal(f.get('quick-audio-on').getAttribute('aria-pressed'), 'true');
        assert.equal(f.get('quick-audio-state').textContent, 'ON');
    } finally { f.restore(); }
});

test('unavailable leaderboard/Daily do not block Help or Audio', () => {
    const f = fixture({ canLeaderboard: () => false, canDaily: () => false });
    try {
        f.menu.open();
        assert.equal(f.get('quick-leaderboard').disabled, true);
        assert.equal(f.get('quick-daily').disabled, true);
        assert.equal(f.get('quick-help').disabled, false);
        f.get('quick-audio').click();
        assert.equal(f.menu.audioOpen, true);
    } finally { f.restore(); }
});

test('all quick-menu and audio DOM hooks exist', () => {
    const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
    const controller = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
    const css = readFileSync(new URL('../src/styles/racing-ui.css', import.meta.url), 'utf8');
    for (const attribute of ['quick-open', 'quick-menu', 'quick-help', 'quick-audio',
        'quick-audio-group', 'quick-audio-panel', 'quick-audio-on', 'quick-audio-off',
        'quick-audio-state', 'quick-leaderboard', 'quick-daily', 'theme-toggle',
        'start-flight', 'overlay-hero', 'exit-menu']) {
        assert.ok(html.includes('data-' + attribute), 'Missing ' + attribute);
    }
    assert.match(controller, /const themeController = new ThemeController\(\)/);
    assert.match(controller, /const quickMenu = new QuickMenu/);
    assert.match(css, /\.quick-menu__audio-popover/);
    assert.match(html, /aria-controls="skyracer-audio-panel"/);
});
