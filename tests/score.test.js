import test from 'node:test';
import assert from 'node:assert/strict';
import {
    ScoreManager,
    SCORE_VERSION,
    SCORE_PER_DISTANCE_UNIT,
    RING_BONUS_POINTS,
} from '../src/managers/ScoreManager.js';

function useFakeStorage(t, entries = {}) {
    const existing = globalThis.window;
    const values = new Map(Object.entries(entries));
    globalThis.window = {
        localStorage: {
            getItem: (key) => values.get(key) ?? null,
            setItem: (key, value) => { values.set(key, String(value)); },
        },
    };
    t.after(() => {
        if (existing === undefined) delete globalThis.window;
        else globalThis.window = existing;
    });
    return values;
}

test('distance uses 10 points per world unit; each ring adds 50', (t) => {
    useFakeStorage(t);
    const score = new ScoreManager();
    score.update(2, { z: -10 });
    score.collectRings(3);
    assert.equal(SCORE_PER_DISTANCE_UNIT, 10);
    assert.equal(RING_BONUS_POINTS, 50);
    assert.equal(score.distance, 20);
    assert.equal(score.ringsCollected, 3);
    assert.equal(score.currentScore, 350);
    assert.equal(score.currentScore,
        Math.floor(10 * score.distance + 50 * score.ringsCollected));
});

test('distance scoring is floored, not rounded upward', (t) => {
    useFakeStorage(t);
    const score = new ScoreManager();
    score.update(0.105, { z: -10 });
    score.collectRings();
    assert.equal(score.currentScore, 60);
});

test('revised best scores do not import old 500-point-per-ring records', (t) => {
    const values = useFakeStorage(t, {
        skyracer_highscore: '999999',
        skyracer_best_rings: '12',
    });
    const score = new ScoreManager();
    assert.equal(SCORE_VERSION, 2);
    assert.equal(score.getHighScore(), 0);
    assert.equal(score.getBestRings(), 12);
    score.collectRings(2);
    score.persistRecords();
    assert.equal(values.get('skyracer_highscore_v2'), '100');
    assert.equal(values.get('skyracer_highscore'), '999999');
});

test('restart clears only the current run, not the new high-score record', (t) => {
    useFakeStorage(t);
    const score = new ScoreManager();
    score.collectRings(2);
    score.persistRecords();
    score.reset();
    assert.equal(score.currentScore, 0);
    assert.equal(score.getHighScore(), 100);
    assert.equal(score.getBestRings(), 2);
});
