import { EnergyRing } from './EnergyRing.js';

// A black, unobstructed hazard ring: the opening stays clear, with no X or
// red warning bars. A restrained neutral halo keeps its dark rim readable
// against the near-black track without recoloring the circumference.
// This is visual-only; the fatal swept collision volume stays unchanged.
export class BlackRing extends EnergyRing {
    constructor() {
        super({ radius: 1.8, color: 0x050505, isSurge: false });
        this.name = 'BlackHazardRing';
        this.isHazard = true;
        this.rotationSpeed = -0.42;

        // The circumference itself is black (not red). The faint grayscale
        // halo is separate geometry behind it, not a colored torus surface.
        this.material.color.setHex(0x050505);
        this.material.emissive.setHex(0x090909);
        this.material.emissiveIntensity = 0.24;
        this.haloMaterial.color.setHex(0x484848);
        this.haloMaterial.opacity = 0.26;
        this.groundAnchor.outerMaterial.color.setHex(0x505050);
        this.groundAnchor.coreMaterial.color.setHex(0x505050);
        this.groundAnchor.baseOpacity = 0.12;
    }

    update(delta) {
        this.elapsed += delta;
        const pulse = 0.5 + Math.sin(this.elapsed * 4.5) * 0.5;
        this.ringVisual.rotation.z += this.rotationSpeed * delta;
        this.material.emissiveIntensity = 0.18 + pulse * 0.14;
        this.haloMaterial.opacity = 0.24 + pulse * 0.12;
        this.halo.scale.setScalar(1.01 + pulse * 0.09);
        this.groundAnchor.update(this.position.y, this.elapsed, 1 + pulse * 0.18);
    }
}
