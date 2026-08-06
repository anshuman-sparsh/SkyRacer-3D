import * as THREE from 'three';
import { markShared } from '../utils/Memory.js';

const TRACK_SURFACE_Y = 0.015;
const sharedGeometries = new Map();

function getGeometries(radius) {
    const key = radius.toFixed(2);
    const cached = sharedGeometries.get(key);
    if (cached) return cached;

    const geometries = {
        outer: markShared(new THREE.CylinderGeometry(radius, radius, 0.018, 20)),
        core: markShared(new THREE.CylinderGeometry(radius * 0.58, radius * 0.58, 0.022, 20)),
    };
    sharedGeometries.set(key, geometries);
    return geometries;
}

/** Releases projection geometry after every anchored entity has been disposed. */
export function disposeGroundAnchorResources() {
    sharedGeometries.forEach((geometries) => {
        Object.values(geometries).forEach((geometry) => geometry.dispose());
    });
    sharedGeometries.clear();
}

/**
 * Lightweight additive projection that stays on the course plane while its parent
 * flies above it. Perspective compression makes object altitude and distance easy
 * to read without real-time shadow maps or projected textures.
 */
export class GroundAnchor extends THREE.Group {
    constructor({ radius = 1.5, color = 0x70ffe6, opacity = 0.2 } = {}) {
        super();

        this.baseOpacity = opacity;
        const geometries = getGeometries(radius);
        this.outerMaterial = new THREE.MeshBasicMaterial({
            color,
            transparent: true,
            opacity,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            fog: true,
        });
        this.coreMaterial = new THREE.MeshBasicMaterial({
            color,
            transparent: true,
            opacity: opacity * 0.38,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            fog: true,
        });

        const outer = new THREE.Mesh(geometries.outer, this.outerMaterial);
        const core = new THREE.Mesh(geometries.core, this.coreMaterial);
        outer.renderOrder = 1;
        core.renderOrder = 1;
        this.add(outer, core);
        this.name = 'GroundAnchor';
    }

    update(ownerWorldY, elapsed = 0, intensity = 1) {
        const altitude = THREE.MathUtils.clamp((ownerWorldY - 0.5) / 10, 0, 1);
        const pulse = 0.88 + Math.sin(elapsed * 3.2) * 0.12;
        const altitudeFade = 1 - altitude * 0.22;
        const scale = 0.92 + altitude * 0.3;

        this.position.y = TRACK_SURFACE_Y - ownerWorldY;
        this.scale.set(scale, 1, scale);
        this.outerMaterial.opacity = this.baseOpacity * pulse * altitudeFade * intensity;
        this.coreMaterial.opacity = this.outerMaterial.opacity * 0.38;
    }
}