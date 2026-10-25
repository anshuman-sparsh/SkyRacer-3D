import * as THREE from 'three';
import { markShared } from '../utils/Memory.js';
import { GroundAnchor } from './GroundAnchor.js';

const BODY_WIDTH = 2.6;
const BODY_HEIGHT = 1.5;
const BODY_DEPTH = 0.6;

let sharedResources = null;

/**
 * Navigation Barriers are inert course scenery. Geometry and materials are built
 * once and reused by every instance, so the continuous spawn/recycle cycle costs
 * no repeated GPU uploads. Lambert surfaces keep nearby silhouettes readable while
 * scene fog provides a stronger distance cue than fully unlit barrier surfaces.
 */
function getResources() {
    if (sharedResources) return sharedResources;

    sharedResources = {
        geometries: {
            body: new THREE.BoxGeometry(BODY_WIDTH, BODY_HEIGHT, BODY_DEPTH),
            accent: new THREE.BoxGeometry(BODY_WIDTH * 0.96, 0.22, BODY_DEPTH * 1.12),
            post: new THREE.BoxGeometry(0.2, 1.1, 0.2),
            halo: new THREE.BoxGeometry(BODY_WIDTH * 1.14, BODY_HEIGHT * 1.2, BODY_DEPTH * 2.1),
        },
        materials: {
            body: new THREE.MeshLambertMaterial({ color: 0x34143b, emissive: 0x15051d }),
            accent: new THREE.MeshLambertMaterial({
                color: 0xff7b20,
                emissive: 0xa52205,
                emissiveIntensity: 0.72,
            }),
            alert: new THREE.MeshLambertMaterial({
                color: 0xff3567,
                emissive: 0xa80736,
                emissiveIntensity: 0.88,
            }),
            post: new THREE.MeshLambertMaterial({ color: 0x62405f, emissive: 0x170c1b }),
            halo: new THREE.MeshBasicMaterial({
                color: 0xff4a2b,
                transparent: true,
                opacity: 0.15,
                depthWrite: false,
                blending: THREE.AdditiveBlending,
            }),
        },
    };

    Object.values(sharedResources.geometries).forEach(markShared);
    Object.values(sharedResources.materials).forEach(markShared);
    return sharedResources;
}

/** Releases barrier GPU resources. Call once every barrier has left the scene. */
export function disposeObstacleResources() {
    if (!sharedResources) return;

    Object.values(sharedResources.geometries).forEach((geometry) => geometry.dispose());
    Object.values(sharedResources.materials).forEach((material) => material.dispose());
    sharedResources = null;
}

export class Obstacle extends THREE.Group {
    constructor() {
        super();

        this.name = 'NavigationBarrier';
        this.boundingBox = new THREE.Box3();
        // Solid central barrier and its two physical supports. Thin inset
        // reduces phantom edge hits; the much larger glow is decorative only.
        this.collisionParts = [
            { name: 'body', x: 0, y: 0, z: 0,
                hx: BODY_WIDTH / 2 - 0.06, hy: BODY_HEIGHT / 2 - 0.06,
                hz: BODY_DEPTH / 2 - 0.03, box: new THREE.Box3() },
            ...[-1, 1].map((side) => ({
                name: side < 0 ? 'left-post' : 'right-post',
                x: side * BODY_WIDTH * 0.42, y: -BODY_HEIGHT * 0.82, z: 0,
                hx: 0.08, hy: 0.52, hz: 0.08, box: new THREE.Box3(),
            })),
        ];
        this.collisionBoxes = this.collisionParts.map((part) => part.box);
        this.elapsed = Math.random() * Math.PI * 2;
        this.wasNearMissed = false;

        const { geometries, materials } = getResources();

        const body = new THREE.Mesh(geometries.body, materials.body);
        this.add(body);

        for (const y of [BODY_HEIGHT * 0.28, -BODY_HEIGHT * 0.28]) {
            const stripe = new THREE.Mesh(geometries.accent, materials.accent);
            stripe.position.y = y;
            this.add(stripe);
        }

        const alertBar = new THREE.Mesh(geometries.accent, materials.alert);
        alertBar.scale.set(0.38, 0.72, 1.04);
        this.add(alertBar);

        for (const side of [-1, 1]) {
            const post = new THREE.Mesh(geometries.post, materials.post);
            post.position.set(side * BODY_WIDTH * 0.42, -BODY_HEIGHT * 0.82, 0);
            this.add(post);
        }

        this.halo = new THREE.Mesh(geometries.halo, materials.halo);
        this.add(this.halo);

        this.groundAnchor = new GroundAnchor({ radius: 1.45, color: 0xff6a2b, opacity: 0.22 });
        this.add(this.groundAnchor);
    }

    update(delta) {
        this.elapsed += delta;
        const pulse = 0.5 + Math.sin(this.elapsed * 4.1) * 0.5;
        this.halo.scale.setScalar(0.97 + pulse * 0.07);
        this.groundAnchor.update(this.position.y, this.elapsed, 0.88 + pulse * 0.16);
    }

    /** Refit cached collider boxes from the actual body and support positions. */
    refreshBounds() {
        this.boundingBox.makeEmpty();
        for (const part of this.collisionParts) {
            const x = this.position.x + part.x;
            const y = this.position.y + part.y;
            const z = this.position.z + part.z;
            part.box.min.set(x - part.hx, y - part.hy, z - part.hz);
            part.box.max.set(x + part.hx, y + part.hy, z + part.hz);
            this.boundingBox.union(part.box);
        }
        return this.boundingBox;
    }

    /**
     * First reject with the union boxes, then check pairs of solid parts.
     * Neither empty AABB corners nor the emissive glow can cause termination.
     */
    intersects(craftBounds, craftCollisionBoxes) {
        if (!craftBounds.intersectsBox(this.refreshBounds())) return false;
        for (const obstacleBox of this.collisionBoxes) {
            if (!craftBounds.intersectsBox(obstacleBox)) continue;
            for (const craftBox of craftCollisionBoxes) {
                if (craftBox.intersectsBox(obstacleBox)) return true;
            }
        }
        return false;
    }
}
