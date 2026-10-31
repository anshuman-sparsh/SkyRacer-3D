import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('Hangar has no introduction or top-level equip/match-theme toolbar', () => {
    const html = read('index.html');
    assert.doesNotMatch(html, /id="hangar-intro"/);
    assert.doesNotMatch(html, /data-hangar-equip|data-hangar-match|data-hangar-selected-state/);
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
