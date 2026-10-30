import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
    HANGAR_AIRCRAFT, HANGAR_MILESTONES, themeDefaultAircraft,
    aircraftForTheme, resolveAircraftId,
} from '../src/hangar/HangarCatalog.js';

test('M5-A catalog has exactly two free theme starters and four planned rewards', () => {
    assert.equal(HANGAR_AIRCRAFT.length, 6);
    assert.equal(new Set(HANGAR_AIRCRAFT.map(a => a.id)).size, 6);
    assert.equal(HANGAR_AIRCRAFT.filter(a => a.tier === 'Starter').length, 2);
    assert.equal(HANGAR_MILESTONES.length, 4);
});
test('orange and neon themes resolve to their designated default aircraft', () => {
    assert.equal(themeDefaultAircraft('ember'), 'ember-striker');
    assert.equal(themeDefaultAircraft('neon'), 'cyan-striker');
    assert.equal(aircraftForTheme('neon').name, 'Cyan Striker');
    assert.equal(aircraftForTheme('ember').name, 'Ember Striker');
});
test('future manual aircraft choices require ownership and do not change theme default policy', () => {
    assert.equal(resolveAircraftId({theme:'ember'}), 'ember-striker');
    assert.equal(resolveAircraftId({theme:'neon',preference:'ember-striker',ownedIds:['ember-striker']}),'ember-striker');
    assert.equal(resolveAircraftId({theme:'neon',preference:'apex-overdrive',ownedIds:[]}), 'cyan-striker');
});
test('Hangar is independent of quick menu, pre-flight gated, and never claims actual equip support', () => {
    const html = readFileSync(new URL('../index.html',import.meta.url),'utf8');
    const main = readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
    const panel = readFileSync(new URL('../src/ui/HangarPanel.js',import.meta.url),'utf8');
    const css = readFileSync(new URL('../src/styles/racing-ui.css',import.meta.url),'utf8');
    for (const hook of ['hangar-entry','hangar-current','hangar-open','hangar-dialog','hangar-close',
        'hangar-tab-aircraft','hangar-tab-achievements','hangar-panel-aircraft',
        'hangar-panel-achievements','hangar-collection','hangar-achievements','hangar-preview']) {
        assert.match(html,new RegExp('data-'+hook));
    }
    assert.doesNotMatch(html.match(/<nav class="quick-menu"[\s\S]*?<\/nav>/)?.[0]??'', /hangar/i);
    assert.match(main, /hangarPanel\.setAvailable\(nextState === 'start'\)/);
    assert.match(main, /hangarPanel\.dialog\.open/);
    assert.match(main, /hangarPanel\.dispose\(\)/);
    assert.match(panel, /this\.dialog\.showModal\(\)/);
    assert.match(html, /3D models and equipped skins arrive in M5-B/);
    assert.match(css,/\.hangar-shell/);
});
