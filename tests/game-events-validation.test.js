import test from 'node:test';
import assert from 'node:assert/strict';
import { validateGameplayEvent } from '../supabase/functions/game-events/validation.js';

const eventId = '12345678-1234-4234-8234-123456789abc';
const sessionId = 'aabbccdd-1234-4234-8234-123456789abc';
const base = { eventId, sessionId, mode: 'classic' };

test('accepts known lightweight event names without player identifiers', () => {
    for (const eventName of ['game_start', 'second_run', 'challenge_shared']) {
        const result = validateGameplayEvent({ ...base, eventName });
        assert.equal(result.eventName, eventName);
        assert.equal(result.score, null);
        assert.equal(result.reason, null);
    }
    const daily = validateGameplayEvent({ ...base, eventName: 'daily_challenge_played', mode: 'daily' });
    assert.equal(daily.mode, 'daily');
});

test('accepts bounded scoring metrics on a terminal run only', () => {
    const result = validateGameplayEvent({
        ...base, eventName: 'game_over',
        score: 1050, rings: 5, distance: 80,
        durationSeconds: 25.456, reason: 'collision',
    });
    assert.equal(result.score, 1050);
    assert.equal(result.durationSeconds, 25.5);
    assert.equal(result.distance, 80);
    assert.equal(result.reason, 'collision');
});

test('rejects unknown, malformed, or over-privileged telemetry payloads', () => {
    assert.equal(validateGameplayEvent(null), null);
    assert.equal(validateGameplayEvent([]), null);
    assert.equal(validateGameplayEvent({ ...base, eventName: 'kill_switch' }), null);
    assert.equal(validateGameplayEvent({ ...base, eventName: 'game_start', userId: eventId }), null);
    assert.equal(validateGameplayEvent({ ...base, eventName: 'game_start', nickname: 'private' }), null);
    assert.equal(validateGameplayEvent({ ...base, eventName: 'game_start', ip: '1.2.3.4' }), null);
    assert.equal(validateGameplayEvent({ ...base, eventName: 'game_start', score: 1 }), null);
    assert.equal(validateGameplayEvent({ ...base, eventId: 'not-uuid', eventName: 'game_start' }), null);
    assert.equal(validateGameplayEvent({ ...base, sessionId: 'bad', eventName: 'game_start' }), null);
    assert.equal(validateGameplayEvent({ ...base, mode: 'unknown', eventName: 'game_start' }), null);
    assert.equal(validateGameplayEvent({ ...base, eventName: 'daily_challenge_played' }), null);
    assert.equal(validateGameplayEvent({ ...base, eventName: 'challenge_shared', mode: 'practice' }), null);
});

test('rejects impossible scores and invalid end reasons', () => {
    const sample = {
        ...base, eventName: 'game_over', score: 850,
        rings: 3, distance: 70, durationSeconds: 16, reason: 'collision',
    };
    const invalid = [
        { score: 8510 }, { rings: -1 }, { distance: Infinity },
        { distance: -2 }, { durationSeconds: -1 }, { durationSeconds: 99999 },
        { score: 1.5 }, { rings: 1.5 }, { reason: 'injected' },
        { score: null }, { durationSeconds: null }, { distance: null }, { reason: null },
    ];
    for (const changed of invalid) {
        assert.equal(validateGameplayEvent({ ...sample, ...changed }), null,
            'Invalid metrics unexpectedly accepted: ' + JSON.stringify(changed));
    }
});

test('multiple game modes are supported without changing classic validation', () => {
    const same = { ...base, eventName: 'game_over', score: 0, rings: 0, distance: 0,
        durationSeconds: 0, reason: 'completed' };
    assert.equal(validateGameplayEvent({ ...same, mode: 'practice' }).mode, 'practice');
    assert.equal(validateGameplayEvent({ ...same, mode: 'friend' }).mode, 'friend');
});
