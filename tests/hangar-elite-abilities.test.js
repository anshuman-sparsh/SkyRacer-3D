import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { HoverCraft } from '../src/entities/HoverCraft.js';
import { EnergyRing } from '../src/entities/EnergyRing.js';
import { RingGuidance } from '../src/entities/RingGuidance.js';
import { TrackManager } from '../src/managers/TrackManager.js';
import { eliteAbilityFor, BASE_RING_CAPTURE_RADIUS, BASE_ENERGY_BOOST_DURATION,
    NOVA_RING_CAPTURE_RADIUS, APEX_ENERGY_BOOST_DURATION } from '../src/hangar/EliteAbilities.js';

const mainSource = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const hangarSource = readFileSync(new URL('../src/hangar/HangarCatalog.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('all standard aircraft have normal physics and both elite perks require verified ownership', () => {
    for (const id of ['cyan-striker', 'ember-striker', 'silver-arrow', 'voidrunner']) {
        const ability = eliteAbilityFor(id, [id]);
        assert.equal(ability.id, 'standard');
        assert.equal(ability.ringCaptureRadius, BASE_RING_CAPTURE_RADIUS);
        assert.equal(ability.energyBoostDuration, BASE_ENERGY_BOOST_DURATION);
    }
    assert.equal(eliteAbilityFor('nova-vortex', []).id, 'standard');
    assert.equal(eliteAbilityFor('apex-overdrive', ['cyan-striker']).id, 'standard');
    assert.equal(eliteAbilityFor('nova-vortex', ['nova-vortex']).id, 'ring-assist');
    assert.equal(eliteAbilityFor('apex-overdrive', ['apex-overdrive']).id, 'extended-boost');
    assert.equal(eliteAbilityFor('nova-vortex', ['nova-vortex']).ringCaptureRadius, NOVA_RING_CAPTURE_RADIUS);
    assert.equal(eliteAbilityFor('apex-overdrive', ['apex-overdrive']).energyBoostDuration, APEX_ENERGY_BOOST_DURATION);
});

test('Nova captures a slight edge miss without altering hazard hitboxes or score math', () => {
    const previousDocument = globalThis.document;
    const context = { fillRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {} };
    globalThis.document = { createElement: () => ({
        width: 256, height: 256, getContext: () => context,
    }) };
    let track;
    try {
        const scene = new THREE.Scene();
        const craft = new HoverCraft();
        track = new TrackManager(scene, {
            ringSpawnChance: 0, obstacleSpawnChance: 0, blackRingSpawnChance: 0,
            random: () => 0.5,
        });
        const parts = craft.collisionParts.map(part => part.box);
        const ring = new EnergyRing();
        ring.position.set(2.25, 3, 0);
        scene.add(ring);
        track.energyRings.push(ring);
        assert.equal(track.update(0, craft, BASE_RING_CAPTURE_RADIUS).collectedRings, 0);
        assert.equal(track.energyRings.length, 1);
        const result = track.update(0, craft, NOVA_RING_CAPTURE_RADIUS);
        assert.equal(result.collectedRings, 1);
        assert.equal(result.collectedEnergyRings, 1);
        assert.equal(result.collided, false);
        assert.equal(track.energyRings.length, 0);
        assert.equal(craft.collisionParts.length, parts.length);
        assert.deepEqual(craft.collisionParts.map(part => part.box), parts);
    } finally {
        track?.destroy();
        if (previousDocument === undefined) delete globalThis.document;
        else globalThis.document = previousDocument;
    }
});

test('Nova ring guidance agrees with its expanded collectible lane', t => {
    const guide = new RingGuidance();
    t.after(() => guide.dispose());
    const craft = new HoverCraft();
    craft.velocity.z = -28;
    const ring = new EnergyRing();
    ring.position.set(2.25, 3, -25);
    guide.update([ring], craft, BASE_RING_CAPTURE_RADIUS);
    assert.equal(guide.visible, false);
    guide.update([ring], craft, NOVA_RING_CAPTURE_RADIUS);
    assert.equal(guide.visible, true);
    assert.equal(guide.target, ring);
    guide.hide();
    assert.equal(ring.groundAnchor.visible, false);
});

test('Apex increases boost duration but not its velocity multiplier or maximum cruise speed', () => {
    const normal = new HoverCraft();
    const apex = new HoverCraft();
    normal.activateEnergyBoost(BASE_ENERGY_BOOST_DURATION);
    apex.activateEnergyBoost(APEX_ENERGY_BOOST_DURATION);
    assert.equal(apex.energyBoostMultiplier, normal.energyBoostMultiplier);
    assert.equal(apex.maxSpeed, normal.maxSpeed);
    assert.ok(apex.energyBoostTimeRemaining > normal.energyBoostTimeRemaining);
    assert.equal(apex.energyBoostMaxDuration, APEX_ENERGY_BOOST_DURATION);
});

test('one equipment snapshot applies to Classic, Daily, and Friend; no enhanced mode or endpoint', () => {
    assert.match(mainSource, /activeFlightAbility = eliteAbilityFor\(activeFlightAircraftId, aircraftSelection\.ownedIds\)/);
    assert.match(mainSource, /trackManager\.update\(delta, hovercraft, activeFlightAbility\.ringCaptureRadius\)/);
    assert.match(mainSource, /hovercraft\.activateEnergyBoost\(activeFlightAbility\.energyBoostDuration\)/);
    assert.match(mainSource, /ringGuidance\.update\(trackManager\.energyRings, hovercraft,\s*activeFlightAbility\.ringCaptureRadius\)/);
    assert.match(mainSource, /gameMode = 'daily'/);
    assert.match(mainSource, /gameMode = 'friend'/);
    assert.doesNotMatch(mainSource, /gameMode = 'enhanced'/);
    assert.match(hangarSource, /Classic, Daily and Friend flights/);
    assert.match(html, /Elite rewards work in Classic, Daily and Friend Challenge flights/);
});
