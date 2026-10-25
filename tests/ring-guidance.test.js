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
    const ring = makeRing(6, 5, -24);

    guidance.update([ring], craft);
    assert.deepEqual(guidance.position.toArray(), [2, 4, -11]);
    assert.ok(guidance.stem.position.clone().add(guidance.position).distanceTo(ring.position) < 1e-8);
    assert.equal(guidance.stem.scale.y, 5 - 0.015);

    craft.position.set(-3, 7, -5);
    guidance.update([ring], craft);
    assert.deepEqual(guidance.position.toArray(), [-3, 7, -16]);
    assert.ok(guidance.stem.position.clone().add(guidance.position).distanceTo(ring.position) < 1e-8);
});

test('the diamond shows green when aligned and amber when not aligned', (t) => {
    const guidance = new RingGuidance();
    t.after(() => guidance.dispose());
    const craft = makeCraft(2, 4);
    const ring = makeRing(2, 4, -25);

    guidance.update([ring], craft);
    assert.equal(guidance.markerMaterial.color.getHex(), 0xc8ffad);

    craft.position.set(-6, 8, 0);
    guidance.update([ring], craft);
    assert.equal(guidance.markerMaterial.color.getHex(), 0xffd07b);
    assert.deepEqual(guidance.position.toArray(), [-6, 8, -11]);
});

test('changing the closest ring does not jump the diamond or leave anchors visible', (t) => {
    const guidance = new RingGuidance();
    t.after(() => guidance.dispose());
    const craft = makeCraft();
    const first = makeRing(0, 3, -20);
    const second = makeRing(8, 6, -30);

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
