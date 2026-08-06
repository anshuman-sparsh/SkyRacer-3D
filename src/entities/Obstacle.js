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
        this.halfExtents = new THREE.Vector3(BODY_WIDTH / 2, BODY_HEIGHT / 2, BODY_DEPTH / 2);
        this.boundingBox = new THREE.Box3();
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

    /** Refreshes the world-space bounds without traversing geometry each frame. */
    refreshBounds() {
        this.boundingBox.min.copy(this.position).sub(this.halfExtents);
        this.boundingBox.max.copy(this.position).add(this.halfExtents);
        return this.boundingBox;
    }
}
