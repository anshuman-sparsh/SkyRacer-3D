import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
    DAILY_COURSE_VERSION, isValidUtcDate, utcChallengeDate, nextUtcMidnight,
    formatCountdown, createDailyRandom,
} from '../src/utils/DailyChallenge.js';
import { TrackManager } from '../src/managers/TrackManager.js';
import { ScoreManager } from '../src/managers/ScoreManager.js';
import {
    isPlausibleDailyResult, isDailySubmissionOpen,
    DAILY_GRACE_MS, dailyDeadlineMs,
} from '../supabase/functions/daily-challenge/validation.js';

test('UTC course identity rolls over exactly at midnight, independent of device timezone', () => {
    assert.equal(utcChallengeDate(new Date('2026-10-29T23:59:59.999Z')), '2026-10-29');
    assert.equal(utcChallengeDate(new Date('2026-10-30T00:00:00.000Z')), '2026-10-30');
    assert.equal(nextUtcMidnight('2026-10-29'), Date.parse('2026-10-30T00:00:00Z'));
    assert.equal(DAILY_COURSE_VERSION, 1);
    assert.equal(isValidUtcDate('2026-02-29'), false);
    assert.equal(isValidUtcDate('2028-02-29'), true);
    assert.equal(isValidUtcDate('2026-13-01'), false);
    assert.equal(formatCountdown(3661000), '01:01:01');
    assert.equal(formatCountdown(-20), '00:00:00');
});

test('same day and version generate identical placements regardless of earlier runs', () => {
    const a = createDailyRandom('2026-10-29');
    const b = createDailyRandom('2026-10-29');
    assert.deepEqual(Array.from({length: 120}, () => a()),
        Array.from({length: 120}, () => b()));
    const otherDate = createDailyRandom('2026-10-30');
    const otherVersion = createDailyRandom('2026-10-29', 2);
    assert.notEqual(createDailyRandom('2026-10-29')(), otherDate());
    assert.notEqual(createDailyRandom('2026-10-29')(), otherVersion());
    assert.throws(() => createDailyRandom('2026-02-30'));
});

test('track reset replays exact daily ring and obstacle positions', () => {
    // TrackSegment renders a shared procedural CanvasTexture. Supply only the
    // 2D canvas methods it needs; tests still run without a browser.
    const previousDocument = globalThis.document;
    const context = {
        fillRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {},
    };
    globalThis.document = {
        createElement: (tag) => {
            assert.equal(tag, 'canvas');
            return { width: 256, height: 256, getContext: () => context };
        },
    };
    let track;
    try {
        const scene = new THREE.Scene();
        track = new TrackManager(scene, {
            random: createDailyRandom('2026-10-29'), aheadDistance: 400,
        });
        const snapshot = () => ({
            rings: track.energyRings.map((r) => [r.position.x, r.position.y, r.position.z, r.isSurge]),
            obstacles: track.obstacles.map((r) => [r.position.x, r.position.y, r.position.z]),
        });
        const first = snapshot();
        assert.ok(first.rings.length > 0);
        track.reset({ random: createDailyRandom('2026-10-29') });
        assert.deepEqual(snapshot(), first);
        track.reset({ random: createDailyRandom('2026-10-30') });
        assert.notDeepEqual(snapshot(), first);
    } finally {
        track?.destroy();
        if (previousDocument === undefined) delete globalThis.document;
        else globalThis.document = previousDocument;
    }
});

test('daily ScoreManager never changes Classic persisted records', () => {
    const values = new Map([
        ['skyracer_highscore_v2', '800'],
        ['skyracer_best_rings', '14'],
    ]);
    const previousWindow = globalThis.window;
    globalThis.window = { localStorage: {
        getItem: (key) => values.get(key) ?? null,
        setItem: (key, val) => values.set(key, String(val)),
    } };
    try {
        const classic = new ScoreManager();
        const daily = new ScoreManager({ recordsEnabled: false });
        daily.update(30, new THREE.Vector3(0, 0, -100));
        daily.collectRings(18);
        daily.persistRecords();
        assert.equal(classic.getHighScore(), 800);
        assert.equal(daily.getHighScore(), 0);
        assert.equal(daily.isNewHighScore, false);
        assert.equal(values.get('skyracer_highscore_v2'), '800');
        assert.equal(values.get('skyracer_best_rings'), '14');
    } finally {
        if (previousWindow === undefined) delete globalThis.window;
        else globalThis.window = previousWindow;
    }
});

test('daily score verification uses existing 10-distance and 50-ring formula', () => {
    const elapsed = 22;
    assert.equal(isPlausibleDailyResult({score: 1070, rings: 2, distance: 97}, elapsed), true);
    assert.equal(isPlausibleDailyResult({score: 1071, rings: 2, distance: 97}, elapsed), true);
    assert.equal(isPlausibleDailyResult({score: 1073, rings: 2, distance: 97}, elapsed), false);
    assert.equal(isPlausibleDailyResult({score: 50000, rings: 2, distance: 97}, elapsed), false);
    assert.equal(isPlausibleDailyResult({score: 1070, rings: 2, distance: 97}, 0.1), false);
    assert.equal(isPlausibleDailyResult({score: 1070, rings: 2, distance: 97}, 999999), false);
    assert.equal(isPlausibleDailyResult({score: 1, rings: 20000, distance: 1}, elapsed), false);
});

test('old UTC challenge submissions close after five-minute grace, new day starts at UTC midnight', () => {
    const dayEnd = nextUtcMidnight('2026-10-29');
    assert.equal(dailyDeadlineMs('2026-10-29'), dayEnd + DAILY_GRACE_MS);
    assert.equal(isDailySubmissionOpen('2026-10-29', dayEnd + 1000), true);
    assert.equal(isDailySubmissionOpen('2026-10-29', dayEnd + DAILY_GRACE_MS), false);
    assert.equal(isDailySubmissionOpen('2026-10-30', dayEnd), true);
});
