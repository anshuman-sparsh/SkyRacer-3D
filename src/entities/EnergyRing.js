import * as THREE from 'three';
import { markShared } from '../utils/Memory.js';

const sharedGeometries = new Map();

/**
 * Ring torus geometry is identical for every ring of a given radius, so it is
 * built once and reused. Materials stay per-instance because each ring breathes
 * its colour on an independent phase offset.
 */
function getGeometries(radius) {
    const key = radius.toFixed(3);
    const cached = sharedGeometries.get(key);
    if (cached) return cached;

    const geometries = {
        ring: markShared(new THREE.TorusGeometry(radius, 0.17, 6, 18)),
        halo: markShared(new THREE.TorusGeometry(radius, 0.27, 6, 18)),
    };

    sharedGeometries.set(key, geometries);
    return geometries;
}

/** Releases the torus geometries shared by all energy rings, during teardown. */
export function disposeEnergyRingResources() {
    sharedGeometries.forEach((geometries) => {
        Object.values(geometries).forEach((geometry) => geometry.dispose());
    });
    sharedGeometries.clear();
}

export class EnergyRing extends THREE.Group {
    constructor({ radius = 1.8, color = 0x70ffe6 } = {}) {
        super();

        this.collectionRadius = radius * 0.72;
        this.rotationSpeed = 0.75;
        this.elapsed = Math.random() * Math.PI * 2;
        this.name = 'EnergyRing';

        const geometries = getGeometries(radius);

        this.material = new THREE.MeshLambertMaterial({
            color,
            emissive: color,
            emissiveIntensity: 0.9,
        });
        this.ring = new THREE.Mesh(geometries.ring, this.material);
        this.add(this.ring);

        this.haloMaterial = new THREE.MeshBasicMaterial({
            color,
            transparent: true,
            opacity: 0.16,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
        });
        this.halo = new THREE.Mesh(geometries.halo, this.haloMaterial);
        this.add(this.halo);
    }

    update(delta) {
        this.elapsed += delta;
        const pulse = 0.5 + Math.sin(this.elapsed * 3.4) * 0.5;
        this.rotation.z += this.rotationSpeed * delta;
        this.rotation.y += this.rotationSpeed * 0.22 * delta;
        this.material.emissive.setHSL(0.47 + pulse * 0.04, 0.95, 0.42 + pulse * 0.08);
        this.material.emissiveIntensity = 0.65 + pulse * 0.7;
        this.haloMaterial.opacity = 0.1 + pulse * 0.15;
        this.halo.scale.setScalar(0.98 + pulse * 0.08);
    }

    containsPoint(point, pointRadius = 0.7) {
        const radius = this.collectionRadius + pointRadius;
        return this.position.distanceToSquared(point) <= radius * radius;
    }
}
