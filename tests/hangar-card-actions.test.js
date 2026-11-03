import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { HangarPanel } from '../src/ui/HangarPanel.js';
import { AircraftSelection, AIRCRAFT_PREFERENCE_KEY } from '../src/hangar/AircraftSelection.js';
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('Hangar has no introduction or top-level equip/match-theme toolbar', () => {
    const html = read('index.html');
    assert.doesNotMatch(html, /id="hangar-intro"/);
    assert.doesNotMatch(html, /data-hangar-equip\b|data-hangar-match(?:\s|=|>)|data-hangar-selected-state/);
    assert.match(html, /data-hangar-match-appearance aria-pressed="true"/);
    assert.doesNotMatch(html, /Explore the aircraft lineup and achievements/);
    assert.match(html, /data-hangar-preview/);
    assert.match(html, /data-hangar-collection/);
});

test('cards preview on selection while separate Equip buttons change aircraft', () => {
    const src = read('src/ui/HangarPanel.js');
    assert.match(src, /item\.addEventListener\('click'/);
    assert.match(src, /this\.selectPreview\(aircraft\.id\)/);
    assert.match(src, /item\.addEventListener\('keydown'/);
    assert.match(src, /equip\.addEventListener\('click'/);
    assert.match(src, /event\.stopPropagation\(\)/);
    assert.match(src, /this\.selection\.choose\(aircraft\.id\)/);
    assert.match(src, /current \? 'EQUIPPED' : 'EQUIP'/);
    assert.match(src, /equip\.disabled = current/);
    assert.match(src, /equip\.hidden = !owned/);
    assert.match(src, /locked\.hidden = owned/);
    assert.match(src, /locked\.textContent = '🔒 Locked'/);
    assert.doesNotMatch(src, /LOCKED · ACHIEVEMENT|UNLOCKED · EQUIPABLE|Free starter|PREVIEW'/);
    assert.doesNotMatch(src, /data-hangar-selected-state|data-hangar-theme-default/);
});

test('cards keep achievement requirements for locked aircraft only', () => {
    const src = read('src/ui/HangarPanel.js');
    assert.match(src, /requirement\.hidden = owned \|\| isStarter/);
    assert.match(src, /progress\.hidden = owned \|\| isStarter/);
    assert.match(src, /this\.selection\.setUnlocked\(data\.unlockedIds\)/);
    assert.match(src, /this\.renderProgress\(\)/);
    assert.match(read('src/styles/racing-ui.css'), /\.hangar-aircraft__equip/);
    assert.match(read('src/styles/racing-ui.css'), /\.hangar-aircraft__locked/);
});

test('Match Appearance action restores automatic selection and persists across reloads', () => {
    const data = new Map();
    const storage = { getItem: key => data.get(key), setItem: (key, value) => data.set(key, value) };
    const selection = new AircraftSelection({ storage, theme: 'ember' });
    selection.choose('cyan-striker');
    const panel = Object.create(HangarPanel.prototype);
    panel.selection = selection;
    let refreshed = 0;
    panel.refresh = () => { refreshed++; };
    panel.matchAppearance();
    assert.equal(selection.preference, 'match-theme');
    assert.equal(panel.previewId, 'ember-striker');
    assert.equal(data.get(AIRCRAFT_PREFERENCE_KEY), 'match-theme');
    assert.equal(refreshed, 1);
    assert.equal(new AircraftSelection({ storage, theme: 'neon' }).activeId, 'cyan-striker');
    selection.choose('ember-striker');
    selection.setTheme('neon');
    assert.equal(selection.activeId, 'ember-striker');
    panel.matchAppearance();
    assert.equal(selection.activeId, 'cyan-striker');
    const src = read('src/ui/HangarPanel.js');
    assert.match(src, /this\.matchButton\.addEventListener\('click', this\.handleMatch\)/);
    assert.match(src, /this\.matchButton\.setAttribute\('aria-pressed', String\(matching\)\)/);
    assert.match(src, /this\.matchButton\.removeEventListener\('click', this\.handleMatch\)/);
});
