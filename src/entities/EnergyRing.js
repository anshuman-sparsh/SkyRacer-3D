import * as THREE from 'three';
import { markShared } from '../utils/Memory.js';
import { GroundAnchor } from './GroundAnchor.js';

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
    constructor({ radius = 1.8, color = null, isSurge = false } = {}) {
        super();

        const ringColor = color ?? (isSurge ? 0xff4fae : 0x70ffe6);
        this.collectionRadius = radius * 0.72;
        this.isSurge = isSurge;
        this.rotationSpeed = isSurge ? 1.15 : 0.75;
        this.elapsed = Math.random() * Math.PI * 2;
        this.name = isSurge ? 'SurgeRing' : 'EnergyRing';

        const geometries = getGeometries(radius);

        this.material = new THREE.MeshLambertMaterial({
            color: ringColor,
            emissive: ringColor,
            emissiveIntensity: isSurge ? 1.35 : 1.05,
        });
        this.ringVisual = new THREE.Group();
        this.add(this.ringVisual);
        this.ring = new THREE.Mesh(geometries.ring, this.material);
        this.ringVisual.add(this.ring);

        this.haloMaterial = new THREE.MeshBasicMaterial({
            color: ringColor,
            transparent: true,
            opacity: 0.16,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
        });
        this.halo = new THREE.Mesh(geometries.halo, this.haloMaterial);
        this.ringVisual.add(this.halo);

        this.groundAnchor = new GroundAnchor({
            radius: radius * 0.88,
            color: isSurge ? 0xffc44f : ringColor,
            opacity: isSurge ? 0.32 : 0.25,
        });
        this.add(this.groundAnchor);
    }

    update(delta) {
        this.elapsed += delta;
        const pulse = 0.5 + Math.sin(this.elapsed * 3.4) * 0.5;
        this.ringVisual.rotation.z += this.rotationSpeed * delta;
        this.ringVisual.rotation.y += this.rotationSpeed * 0.22 * delta;
        const hue = this.isSurge ? 0.91 + pulse * 0.05 : 0.47 + pulse * 0.04;
        this.material.emissive.setHSL(hue, 0.98, 0.44 + pulse * 0.09);
        this.material.emissiveIntensity = (this.isSurge ? 1.08 : 0.78) + pulse * 0.82;
        this.haloMaterial.opacity = (this.isSurge ? 0.16 : 0.1) + pulse * 0.15;
        this.halo.scale.setScalar(0.98 + pulse * (this.isSurge ? 0.13 : 0.08));
        this.groundAnchor.update(this.position.y, this.elapsed, 0.9 + pulse * 0.18);
    }

    containsPoint(point, pointRadius = 0.7) {
        const radius = this.collectionRadius + pointRadius;
        return this.position.distanceToSquared(point) <= radius * radius;
    }
}
