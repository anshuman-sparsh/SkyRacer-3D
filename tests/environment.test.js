import test from 'node:test';
import assert from 'node:assert/strict';
import {
    SCENERY_STATIONS_PER_SIDE,
    buildSceneryLayout,
    advanceSceneryGlow,
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

test('near and far skyline bands stay balanced across the road', () => {
    const scenery = buildSceneryLayout(32, 24, -96);
    for (const side of [-1, 1]) {
        const sideTowers = scenery.filter((part) => Math.sign(part.towerX) === side);
        assert.equal(sideTowers.filter((part) => part.towerLayer === 'near').length, 2);
        assert.equal(sideTowers.filter((part) => part.towerLayer === 'far').length, 2);
        for (const part of sideTowers) {
            if (part.towerLayer === 'far') assert.ok(Math.abs(part.towerX) > 32 / 2 + 20);
        }
    }
});

test('roadside variation is small and regularly distributed', () => {
    const scenery = buildSceneryLayout(32, 24, -48);
    const heights = new Set(scenery.map((part) => part.markerHeight));
    assert.equal(heights.size, 2);
    for (const part of scenery) {
        assert.ok(part.markerHeight >= 1.3 && part.markerHeight <= 1.7);
        assert.ok(part.markerWidth >= 0.13 && part.markerWidth <= 0.18);
    }
});

test('compact skyline sampling keeps both distant and near landmarks on each side', () => {
    const scenery = buildSceneryLayout(32, 24, -72);
    const selected = scenery.filter((_, index) => {
        const station = index % SCENERY_STATIONS_PER_SIDE;
        return station === 0 || station === 3;
    });
    assert.equal(selected.length, 4);
    for (const side of [-1, 1]) {
        const layers = selected.filter((part) => Math.sign(part.towerX) === side)
            .map((part) => part.towerLayer);
        assert.deepEqual(layers.sort(), ['far', 'near']);
    }
});

test('speed accents ease smoothly both on boost and when returning to normal', () => {
    assert.equal(advanceSceneryGlow(0.3, true, 0), 0.3);
    const brighten = advanceSceneryGlow(0, true, 0.016);
    assert.ok(brighten > 0 && brighten < 0.1);
    const dim = advanceSceneryGlow(brighten, false, 0.016);
    assert.ok(dim > 0 && dim < brighten);
    assert.ok(advanceSceneryGlow(1, true, 0.05) <= 1);
});
