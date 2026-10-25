import test from 'node:test';
import assert from 'node:assert/strict';
import {
    SCENERY_STATIONS_PER_SIDE,
    buildSceneryLayout,
} from '../src/utils/SceneryLayout.js';

test('recycled segments get stable deterministic scenery', () => {
    assert.deepEqual(
        buildSceneryLayout(32, 24, -96),
        buildSceneryLayout(32, 24, -96),
    );
    assert.notDeepEqual(
        buildSceneryLayout(32, 24, -96),
        buildSceneryLayout(32, 24, -120),
    );
});

test('roadside indicators and towers stay outside the navigable track', () => {
    for (const width of [24, 32, 40]) {
        const markers = buildSceneryLayout(width, 24, -240);
        assert.equal(markers.length, 2 * SCENERY_STATIONS_PER_SIDE);
        for (const item of markers) {
            assert.ok(Math.abs(item.markerX) > width / 2 + 0.35);
            assert.ok(Math.abs(item.towerX) - item.towerWidth / 2 > width / 2 + 5);
            assert.ok(item.towerHeight >= 3.5 && item.towerHeight <= 12);
            assert.ok(Math.abs(item.markerZ) < 12);
            assert.ok(Math.abs(item.towerZ) < 12);
        }
    }
});

test('landmarks have left and right coverage and regular visual rhythm', () => {
    const scenery = buildSceneryLayout(32, 24, 0);
    const sides = [-1, 1];
    for (const side of sides) {
        const positions = scenery.filter((item) => Math.sign(item.markerX) === side);
        assert.equal(positions.length, SCENERY_STATIONS_PER_SIDE);
        const zs = positions.map((item) => item.markerZ);
        for (let i = 1; i < zs.length; i += 1) {
            assert.equal(zs[i] - zs[i - 1], 6);
        }
    }
});

test('layout depends only on inputs and does not consume global randomness', () => {
    const previous = Math.random;
    try {
        Math.random = () => { throw Error('unexpected random call'); };
        assert.equal(buildSceneryLayout(32, 24, -48).length, 8);
    } finally {
        Math.random = previous;
    }
});
