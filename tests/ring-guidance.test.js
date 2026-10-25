import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { RingGuidance } from '../src/entities/RingGuidance.js';
import { EnergyRing } from '../src/entities/EnergyRing.js';

function makeCraft(x = 0, y = 3, z = 0) {
    return {
        position: new THREE.Vector3(x, y, z),
        velocity: new THREE.Vector3(0, 0, -28),
        bounds: { minX: -14.4, maxX: 14.4, minY: 1, maxY: 10 },
    };
}

function makeRing(x, y, z) {
    const ring = new EnergyRing();
    ring.position.set(x, y, z);
    return ring;
}

test('the marker only appears when an upcoming ring is in the approach range', (t) => {
    const guidance = new RingGuidance();
    t.after(() => guidance.dispose());
    const craft = makeCraft();
    const ring = makeRing(0, 3, -80);

    guidance.update([ring], craft);
    assert.equal(guidance.visible, false);
    assert.equal(ring.groundAnchor.visible, false);

    ring.position.z = -25;
    guidance.update([ring], craft);
    assert.equal(guidance.visible, true);
    assert.equal(ring.groundAnchor.visible, true);

    guidance.update([], craft);
    assert.equal(guidance.visible, false);
    assert.equal(ring.groundAnchor.visible, false);
});

test('the marker stays ahead of the craft, while the vertical line stays on the ring', (t) => {
    const guidance = new RingGuidance();
    t.after(() => guidance.dispose());
    const craft = makeCraft(2, 4);
    const ring = makeRing(3, 5, -24);

    guidance.update([ring], craft);
    assert.deepEqual(guidance.position.toArray(), [2, 4, -11]);
    assert.ok(guidance.stem.position.clone().add(guidance.position).distanceTo(ring.position) < 1e-8);
    assert.equal(guidance.stem.scale.y, 5 - 0.015);

    craft.position.set(2.7, 4.5, -5);
    guidance.update([ring], craft);
    assert.deepEqual(guidance.position.toArray(), [2.7, 4.5, -16]);
    assert.ok(guidance.stem.position.clone().add(guidance.position).distanceTo(ring.position) < 1e-8);
});

test('the diamond shows green when aligned and amber when not aligned', (t) => {
    const guidance = new RingGuidance();
    t.after(() => guidance.dispose());
    const craft = makeCraft(2, 4);
    const ring = makeRing(2, 4, -25);

    guidance.update([ring], craft);
    assert.equal(guidance.markerMaterial.color.getHex(), 0xc8ffad);

    // Keep the ring in the current lane, but steer away before crossing it.
    craft.velocity.x = 12;
    guidance.update([ring], craft);
    assert.equal(guidance.markerMaterial.color.getHex(), 0xffd07b);
    assert.deepEqual(guidance.position.toArray(), [2, 4, -11]);
});

test('changing the closest ring does not jump the diamond or leave anchors visible', (t) => {
    const guidance = new RingGuidance();
    t.after(() => guidance.dispose());
    const craft = makeCraft();
    const first = makeRing(0, 3, -20);
    const second = makeRing(1, 3.5, -30);

    guidance.update([first, second], craft);
    const markerPosition = guidance.position.clone();
    assert.equal(first.groundAnchor.visible, true);
    assert.equal(second.groundAnchor.visible, false);

    guidance.update([second], craft);
    assert.ok(guidance.position.equals(markerPosition));
    assert.equal(first.groundAnchor.visible, false);
    assert.equal(second.groundAnchor.visible, true);

    guidance.hide();
    assert.equal(guidance.visible, false);
    assert.equal(second.groundAnchor.visible, false);
});

test('an active ring has a small distance buffer to avoid visibility flicker', (t) => {
    const guidance = new RingGuidance();
    t.after(() => guidance.dispose());
    const craft = makeCraft();
    const ring = makeRing(0, 3, -40);

    guidance.update([ring], craft);
    assert.equal(guidance.visible, true);

    craft.position.z = 1.5;
    guidance.update([ring], craft);
    assert.equal(guidance.visible, true);

    craft.position.z = 5;
    guidance.update([ring], craft);
    assert.equal(guidance.visible, false);
    assert.equal(ring.groundAnchor.visible, false);
});

test('rings in other horizontal or vertical lanes do not show guidance', (t) => {
    const guidance = new RingGuidance();
    t.after(() => guidance.dispose());
    const craft = makeCraft(0, 3);
    const offLeft = makeRing(-6, 3, -18);
    const tooHigh = makeRing(0, 8, -22);

    guidance.update([offLeft, tooHigh], craft);
    assert.equal(guidance.visible, false);
    assert.equal(guidance.target, null);
    assert.equal(offLeft.groundAnchor.visible, false);
    assert.equal(tooHigh.groundAnchor.visible, false);
});

test('only in-lane rings are considered even when an off-lane ring is closer', (t) => {
    const guidance = new RingGuidance();
    t.after(() => guidance.dispose());
    const craft = makeCraft(0, 3);
    const offLane = makeRing(8, 3, -16);
    const inLane = makeRing(1.5, 3.5, -27);

    guidance.update([offLane, inLane], craft);
    assert.equal(guidance.visible, true);
    assert.equal(guidance.target, inLane);
    assert.equal(offLane.groundAnchor.visible, false);
    assert.equal(inLane.groundAnchor.visible, true);
    assert.deepEqual(guidance.position.toArray(), [0, 3, -11]);
});

test('guidance disappears when steering out of the current lane', (t) => {
    const guidance = new RingGuidance();
    t.after(() => guidance.dispose());
    const craft = makeCraft(0, 3);
    const ring = makeRing(0, 3, -22);

    guidance.update([ring], craft);
    assert.equal(guidance.visible, true);

    // Existing active ring gets a tiny lane exit buffer.
    craft.position.x = ring.collectionRadius + 0.8;
    guidance.update([ring], craft);
    assert.equal(guidance.visible, true);

    craft.position.x = 7;
    guidance.update([ring], craft);
    assert.equal(guidance.visible, false);
    assert.equal(guidance.target, null);
    assert.equal(ring.groundAnchor.visible, false);
});

test('steering into an approaching ring lane enables guidance without jumping', (t) => {
    const guidance = new RingGuidance();
    t.after(() => guidance.dispose());
    const craft = makeCraft(0, 3);
    const ring = makeRing(5, 3, -24);

    guidance.update([ring], craft);
    assert.equal(guidance.visible, false);

    craft.position.x = 4.2;
    guidance.update([ring], craft);
    assert.equal(guidance.visible, true);
    assert.deepEqual(guidance.position.toArray(), [4.2, 3, -11]);
    assert.ok(guidance.stem.position.clone().add(guidance.position).distanceTo(ring.position) < 1e-8);
});
