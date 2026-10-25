import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { HoverCraft } from '../src/entities/HoverCraft.js';
import { Obstacle } from '../src/entities/Obstacle.js';

function detect(craft, obstacle) {
    return obstacle.intersects(craft.refreshBounds(), craft.collisionBoxes);
}

function setup(x = 0, y = 3, z = 0) {
    const craft = new HoverCraft();
    const obstacle = new Obstacle();
    obstacle.position.set(x, y, z);
    return { craft, obstacle };
}

test('direct central impact still ends the flight', () => {
    const { craft, obstacle } = setup();
    assert.equal(detect(craft, obstacle), true);
});

test('the visible nose is solid', () => {
    const { craft, obstacle } = setup(0, 3, -2.6);
    assert.equal(detect(craft, obstacle), true);
});

test('wingtip contacts remain solid', () => {
    const { craft, obstacle } = setup(2.3, 3, 1.15);
    assert.equal(detect(craft, obstacle), true);
});

test('former oversized-box corner does not cause a phantom crash', () => {
    const { craft, obstacle } = setup(2.4, 4.0, -1.3);
    const oldCraftBox = new THREE.Box3().setFromCenterAndSize(
        craft.position, new THREE.Vector3(2.6, 1.0, 3.8),
    );
    const oldObstacleBox = new THREE.Box3().setFromCenterAndSize(
        obstacle.position, new THREE.Vector3(2.6, 1.5, 0.6),
    );
    assert.equal(oldCraftBox.intersectsBox(oldObstacleBox), true);
    assert.equal(detect(craft, obstacle), false);
});

test('visible lower support posts can still collide', () => {
    const { craft, obstacle } = setup(0, 4.55, 0.6);
    assert.equal(detect(craft, obstacle), true);
});

test('glow-only proximity does not crash the player', () => {
    const { craft, obstacle } = setup(0, 3, 3.15);
    assert.equal(detect(craft, obstacle), false);
});

test('pitch and roll update the solid hitboxes', () => {
    const { craft } = setup();
    craft.refreshBounds();
    const box = craft.collisionBoxes[7];
    const initialY = box.min.y;
    craft.visual.rotation.set(THREE.MathUtils.degToRad(12), 0, THREE.MathUtils.degToRad(30));
    craft.refreshBounds();
    assert.notEqual(box.min.y, initialY);
    assert.equal(box, craft.collisionBoxes[7]);
});

test('collision boxes are reused after movement and reset', () => {
    const { craft, obstacle } = setup(0, 3, 0);
    const cachedCraft = craft.collisionBoxes[0];
    const cachedObstacle = obstacle.collisionBoxes[0];
    assert.equal(detect(craft, obstacle), true);
    obstacle.position.x = 10;
    assert.equal(detect(craft, obstacle), false);
    craft.position.x = 10;
    assert.equal(detect(craft, obstacle), true);
    craft.reset();
    assert.equal(detect(craft, obstacle), false);
    assert.equal(craft.collisionBoxes[0], cachedCraft);
    assert.equal(obstacle.collisionBoxes[0], cachedObstacle);
});
