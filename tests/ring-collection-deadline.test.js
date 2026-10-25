import test from 'node:test';
import assert from 'node:assert/strict';
import {
    RingCollectionDeadline,
    RING_GRACE_SECONDS,
    RING_WARNING_SECONDS,
    RING_DEADLINE_SECONDS,
} from '../src/managers/RingCollectionDeadline.js';

test('the first 20 seconds pass without showing a countdown', () => {
    const deadline = new RingCollectionDeadline();
    assert.equal(RING_GRACE_SECONDS, 20);
    assert.equal(RING_WARNING_SECONDS, 10);
    assert.equal(RING_DEADLINE_SECONDS, 30);
    assert.equal(deadline.countdownSeconds, null);
    assert.equal(deadline.advance(19.9), false);
    assert.equal(deadline.countdownSeconds, null);
});

test('the warning shows 10 through 1 seconds before ending the run', () => {
    const deadline = new RingCollectionDeadline();
    assert.equal(deadline.advance(20), false);
    assert.equal(deadline.countdownSeconds, 10);
    assert.equal(deadline.advance(1), false);
    assert.equal(deadline.countdownSeconds, 9);
    assert.equal(deadline.advance(8), false);
    assert.equal(deadline.countdownSeconds, 1);
    assert.equal(deadline.advance(1), true);
    assert.equal(deadline.expired, true);
    assert.equal(deadline.countdownSeconds, null);
});

test('collecting any ring resets the silent period and cancels the warning', () => {
    const deadline = new RingCollectionDeadline();
    deadline.advance(25);
    assert.equal(deadline.countdownSeconds, 5);
    assert.equal(deadline.advance(0.05, 1), false);
    assert.equal(deadline.secondsWithoutRing, 0);
    assert.equal(deadline.countdownSeconds, null);

    deadline.advance(20);
    assert.equal(deadline.countdownSeconds, 10);
    assert.equal(deadline.advance(0.05, 2), false);
    assert.equal(deadline.secondsWithoutRing, 0);
});

test('a ring collected on the expiration frame prevents termination', () => {
    const deadline = new RingCollectionDeadline();
    deadline.advance(29.99);
    assert.equal(deadline.advance(0.05, 1), false);
    assert.equal(deadline.expired, false);
    assert.equal(deadline.countdownSeconds, null);
});

test('restart clears an expired deadline for a fresh run', () => {
    const deadline = new RingCollectionDeadline();
    assert.equal(deadline.advance(30), true);
    deadline.reset();
    assert.equal(deadline.expired, false);
    assert.equal(deadline.secondsWithoutRing, 0);
    assert.equal(deadline.countdownSeconds, null);
});

test('time does not advance except when advance is called with active game delta', () => {
    const deadline = new RingCollectionDeadline();
    deadline.advance(12);
    // Pauses, inactive overlays and background tabs do not call advance.
    assert.equal(deadline.secondsWithoutRing, 12);
    deadline.advance(0);
    deadline.advance(-4);
    deadline.advance(Number.NaN);
    assert.equal(deadline.secondsWithoutRing, 12);
    deadline.advance(8);
    assert.equal(deadline.countdownSeconds, 10);
});
