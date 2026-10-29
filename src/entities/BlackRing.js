import * as THREE from 'three';
import { EnergyRing } from './EnergyRing.js';
import { markShared } from '../utils/Memory.js';

// Black hazard rings share the same swept collection volume as energy rings,
// but never award a ring, boost, or deadline reset. One low-cost warning X
// makes their fatal nature readable against both UI themes and dark scenery.
let warningGeometry = null;
let warningMaterial = null;

function getWarningResources() {
    if (!warningGeometry) {
        warningGeometry = markShared(new THREE.BoxGeometry(0.15, 3.15, 0.1));
        warningMaterial = markShared(new THREE.MeshBasicMaterial({
            color: 0xff5836,
            toneMapped: false,
            fog: false,
        }));
    }
    return { geometry: warningGeometry, material: warningMaterial };
}

export function disposeBlackRingResources() {
    warningGeometry?.dispose();
    warningMaterial?.dispose();
    warningGeometry = null;
    warningMaterial = null;
}

export class BlackRing extends EnergyRing {
    constructor() {
        super({ radius: 1.8, color: 0x121215, isSurge: false });
        this.name = 'BlackHazardRing';
        this.isHazard = true;
        this.rotationSpeed = -0.42;

        // Dark graphite body; the crimson rim and crossed warning bars,
        // not a giant invisible collider, distinguish fatal rings.
        this.material.color.setHex(0x101014);
        this.material.emissive.setHex(0x441614);
        this.material.emissiveIntensity = 0.55;
        this.haloMaterial.color.setHex(0xff4b30);
        this.haloMaterial.opacity = 0.36;
        this.groundAnchor.outerMaterial.color.setHex(0xff5836);
        this.groundAnchor.coreMaterial.color.setHex(0xff5836);
        this.groundAnchor.baseOpacity = 0.16;

        const warning = getWarningResources();
        for (const angle of [-Math.PI / 4, Math.PI / 4]) {
            const crossbar = new THREE.Mesh(warning.geometry, warning.material);
            crossbar.rotation.z = angle;
            this.ringVisual.add(crossbar);
        }
    }

    update(delta) {
        this.elapsed += delta;
        const pulse = 0.5 + Math.sin(this.elapsed * 4.5) * 0.5;
        this.ringVisual.rotation.z += this.rotationSpeed * delta;
        this.material.emissiveIntensity = 0.48 + pulse * 0.26;
        this.haloMaterial.opacity = 0.28 + pulse * 0.18;
        this.halo.scale.setScalar(1.01 + pulse * 0.09);
        this.groundAnchor.update(this.position.y, this.elapsed, 1 + pulse * 0.18);
    }
}
