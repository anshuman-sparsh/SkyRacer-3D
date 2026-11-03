import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { TrackManager } from '../src/managers/TrackManager.js';
import { Obstacle } from '../src/entities/Obstacle.js';

function scenario(lastAttemptClear, pooled, t) {
    const previousDocument = globalThis.document;
    globalThis.document = { createElement: () => ({ getContext: () => ({
        fillRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {},
    }) }) };
    t.after(() => { globalThis.document = previousDocument; });
    // Two opening segments, then a ring at the rear of its band and a barrier
    // at the front of its band. Five/six identical XY samples are rejected.
    const samples = [.1,.5,.5,1, .1,.5,.5,1, 1,.1,.5,.5,1,.1,0,
        ...Array(10).fill(.5), lastAttemptClear ? 1 : .5, .5];
    let used = 0;
    const track = new TrackManager(new THREE.Scene(), { aheadDistance: -1,
        random: () => { assert.ok(used < samples.length); return samples[used++]; } });
    if (pooled) track.obstaclePool.push(pooled);
    track.aheadDistance = 48;
    const craft = { position: new THREE.Vector3(), refreshBounds: () => new THREE.Box3(), isSpinningOut: false };
    track.update(0, craft);
    t.after(() => track.destroy());
    assert.equal(used, samples.length);
    return track;
}

test('six rejected placements skip the barrier without acquiring pooled resources', async t => {
    const pooled = { name: 'pool sentinel' };
    const track = scenario(false, pooled, t);
    assert.equal(track.obstacles.length, 0);
    assert.equal(track.obstaclePool[0], pooled);
    // Sentinel is deliberately not a Three object: leave it outside destroy().
    track.obstaclePool.length = 0;
});

test('a valid sixth placement spawns normally and remains clear of the ring', t => {
    const pooled = new Obstacle();
    const track = scenario(true, pooled, t);
    assert.equal(track.obstacles.length, 1);
    assert.equal(track.obstacles[0], pooled);
    assert.equal(track.obstaclePool.length, 0);
    const ring = track.energyRings.at(-1), obstacle = track.obstacles[0];
    assert.ok(Math.hypot(ring.position.x - obstacle.position.x, ring.position.y - obstacle.position.y) > 4.2);
});
