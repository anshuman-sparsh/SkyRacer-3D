import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { BlackRing, disposeBlackRingResources } from '../src/entities/BlackRing.js';
import { EnergyRing } from '../src/entities/EnergyRing.js';
import { HoverCraft } from '../src/entities/HoverCraft.js';
import { TrackManager } from '../src/managers/TrackManager.js';
import { createDailyRandom } from '../src/utils/DailyChallenge.js';

function withTrack(run, options = {}) {
    const originalDocument = globalThis.document;
    const context = {
        fillRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {},
    };
    globalThis.document = {
        createElement: (tag) => {
            assert.equal(tag, 'canvas');
            return { width: 256, height: 256, getContext: () => context };
        },
    };
    const scene = new THREE.Scene();
    let track;
    try {
        track = new TrackManager(scene, options);
        run({ track, scene });
    } finally {
        track?.destroy();
        disposeBlackRingResources();
        if (originalDocument === undefined) delete globalThis.document;
        else globalThis.document = originalDocument;
    }
}

function coordinates(track) {
    const position = (object) => [
        object.position.x, object.position.y, object.position.z,
    ];
    return {
        energy: track.energyRings.map(position),
        black: track.blackRings.map(position),
        obstacles: track.obstacles.map(position),
    };
}

test('black hazard rings have distinct markings and a swept crossing volume', () => {
    const black = new BlackRing();
    try {
        assert.equal(black.isHazard, true);
        assert.equal(black.isSurge, false);
        assert.equal(black.name, 'BlackHazardRing');
        assert.equal(black.ringVisual.children.length >= 4, true);
        black.position.set(0, 3, -10);
        assert.equal(black.intersectsPath(
            new THREE.Vector3(0, 3, 6),
            new THREE.Vector3(0, 3, -30),
        ), true, 'high-speed passage must still register');
        assert.equal(black.intersectsPath(
            new THREE.Vector3(6, 3, 6),
            new THREE.Vector3(6, 3, -30),
        ), false, 'flying outside the opening is safe');
        assert.equal(black.containsPoint(new THREE.Vector3(0, 3, -10)), true);
        black.update(1 / 60);
        assert.ok(black.haloMaterial.opacity > 0.2);
    } finally {
        disposeBlackRingResources();
    }
});

test('black-ring contact terminates before simultaneous collectible-ring scoring', () => {
    withTrack(({ track, scene }) => {
        const craft = new HoverCraft();
        const hazard = new BlackRing();
        hazard.position.set(0, 3, 0);
        hazard.visible = true;
        track.blackRings.push(hazard);
        scene.add(hazard);

        const regular = new EnergyRing();
        regular.position.copy(hazard.position);
        regular.visible = true;
        track.energyRings.push(regular);
        scene.add(regular);

        track.previousCraftPosition = new THREE.Vector3(0, 3, 10);
        craft.position.set(0, 3, -10);
        const result = track.update(0.016, craft);
        assert.equal(result.collided, true);
        assert.equal(result.collisionType, 'black-ring');
        assert.equal(result.collectedRings, 0);
        assert.equal(result.collectedEnergyRings, 0);
        assert.equal(result.collectedSurgeRings, 0);
        assert.equal(result.nearMisses, 0);
        assert.equal(track.energyRings.includes(regular), true,
            'the collectible ring must remain uncollected on terminal frame');
    }, { ringSpawnChance: 0, obstacleSpawnChance: 0, blackRingSpawnChance: 0 });
});

test('passing beside a black ring never ends the run', () => {
    withTrack(({ track, scene }) => {
        const craft = new HoverCraft();
        const black = new BlackRing();
        black.position.set(0, 3, 0);
        black.visible = true;
        track.blackRings.push(black);
        scene.add(black);

        track.previousCraftPosition = new THREE.Vector3(8, 3, 10);
        craft.position.set(8, 3, -10);
        const result = track.update(0.016, craft);
        assert.equal(result.collided, false);
        assert.equal(result.collisionType, null);
        assert.equal(result.collectedRings, 0);
    }, { ringSpawnChance: 0, obstacleSpawnChance: 0, blackRingSpawnChance: 0 });
});

test('black-ring spawn frequency stays below barrier frequency and opening is clear', () => {
    withTrack(({ track }) => {
        assert.equal(track.blackRingSpawnChance < track.obstacleSpawnChance, true);
        assert.ok(track.blackRings.length > 0, 'rare black rings should still appear');
        assert.ok(track.obstacles.length > track.blackRings.length,
            'barriers must be more common on this representative seeded course');
        assert.ok(track.blackRings.every((ring) =>
            ring.position.z < -track.segmentLength * 2),
        'black rings must not be placed in the opening stretch');
    }, {
        random: createDailyRandom('2026-10-29', 2),
        aheadDistance: 24 * 125,
    });
});

test('daily version 2 regenerates the exact same black ring locations on reset', () => {
    withTrack(({ track }) => {
        const before = coordinates(track);
        assert.ok(before.black.length > 0);
        track.reset({ random: createDailyRandom('2026-10-29', 2) });
        assert.deepEqual(coordinates(track), before);
        track.reset({ random: createDailyRandom('2026-10-30', 2) });
        assert.notDeepEqual(coordinates(track), before);
    }, { random: createDailyRandom('2026-10-29', 2), aheadDistance: 24 * 90 });
});

test('black rings return to the pool on reset and leave the scene on destroy', () => {
    withTrack(({ track, scene }) => {
        const previous = [...track.blackRings];
        assert.ok(previous.length > 0);
        track.reset({ random: createDailyRandom('2026-10-29', 2) });
        for (const ring of previous) {
            assert.ok(track.blackRings.includes(ring) || track.blackRingPool.includes(ring));
        }
        assert.ok(scene.children.some((object) => object.isHazard));
    }, { random: createDailyRandom('2026-10-29', 2), aheadDistance: 24 * 80 });
});

test('help and termination copy clearly explain that black rings are fatal', () => {
    const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
    const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
    assert.match(html, /Black ring with a red X/);
    assert.match(html, /immediately ends the run/);
    assert.match(main, /blackRing: \['BLACK RING HIT'/);
    assert.match(main, /collisionType === 'black-ring'/);
    assert.match(main, /ringGuidance\.update\(trackManager\.energyRings, hovercraft\)/);
});
