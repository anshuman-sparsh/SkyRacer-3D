import * as THREE from 'three';

/**
 * Optional hitbox overlay (?debugHitboxes=1). Helpers are allocated once per
 * pooled obstacle and hidden when inactive, never rebuilt every frame.
 */
export class CollisionDebug {
    constructor(scene, craft, trackManager) {
        this.scene = scene;
        this.craft = craft;
        this.trackManager = trackManager;
        this.craftHelpers = this.#makeHelpers(craft.collisionBoxes, 0x64ffb5);
        this.obstacleHelpers = new Map();
    }

    #makeHelpers(boxes, color) {
        return boxes.map((box) => {
            const helper = new THREE.Box3Helper(box, color);
            helper.material.depthTest = false;
            helper.renderOrder = 100;
            this.scene.add(helper);
            return helper;
        });
    }

    update() {
        this.craft.refreshBounds();

        // Deactivate helpers for recycled obstacles; their Box3 objects are
        // still valid and will be reused if the obstacle is spawned again.
        for (const helpers of this.obstacleHelpers.values()) {
            for (const helper of helpers) helper.visible = false;
        }
        for (const obstacle of this.trackManager.obstacles) {
            if (Math.abs(obstacle.position.z - this.craft.position.z) > 35) continue;
            obstacle.refreshBounds();
            let helpers = this.obstacleHelpers.get(obstacle);
            if (!helpers) {
                helpers = this.#makeHelpers(obstacle.collisionBoxes, 0xff9977);
                this.obstacleHelpers.set(obstacle, helpers);
            }
            for (const helper of helpers) helper.visible = true;
        }
    }

    dispose() {
        const allHelpers = [
            ...this.craftHelpers,
            ...[...this.obstacleHelpers.values()].flat(),
        ];
        for (const helper of allHelpers) {
            this.scene.remove(helper);
            helper.geometry.dispose();
            helper.material.dispose();
        }
        this.obstacleHelpers.clear();
    }
}
