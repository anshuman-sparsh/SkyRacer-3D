import test from 'node:test';
import assert from 'node:assert/strict';
import { AudioEngine } from '../src/utils/AudioEngine.js';

test('explicit Audio Off/On never starts, resumes or unpauses game audio', () => {
    const engine = new AudioEngine();
    let attemptedStart = 0;
    engine.start = async () => { attemptedStart += 1; throw Error('Audio must not auto-start'); };

    assert.equal(engine.paused, true);
    assert.equal(engine.context, null);
    assert.equal(engine.muted, false);
    assert.equal(engine.setMuted(true), true);
    assert.equal(engine.muted, true);
    assert.equal(engine.paused, true);
    assert.equal(engine.context, null);
    assert.equal(engine.setMuted(false), false);
    assert.equal(engine.muted, false);
    assert.equal(engine.paused, true);
    assert.equal(attemptedStart, 0);
});

test('explicit sound changes update existing master gain without altering pause state', () => {
    const engine = new AudioEngine();
    const changes = [];
    engine.context = { currentTime: 12.5 };
    engine.masterGain = {
        gain: {
            setTargetAtTime(target, time, rate) {
                changes.push({ target, time, rate });
            },
        },
    };
    engine.paused = true;
    engine.setMuted(true);
    engine.setMuted(false);
    assert.deepEqual(changes, [
        { target: 0, time: 12.5, rate: 0.02 },
        { target: 0.75, time: 12.5, rate: 0.02 },
    ]);
    assert.equal(engine.paused, true);
});
