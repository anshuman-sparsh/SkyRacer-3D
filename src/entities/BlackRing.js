import { EnergyRing } from './EnergyRing.js';
import { BoxGeometry, Group, Mesh, MeshBasicMaterial } from 'three';

// A bright red-orange hazard ring with a dark inner rim and soft danger halo.
// Keep the historical class/type identifiers for existing collision handling.
// This is visual-only; the fatal swept collision volume stays unchanged.
export class BlackRing extends EnergyRing {
    constructor() {
        super({ radius: 1.8, color: 0xff4d3d, isSurge: false });
        this.name = 'BlackHazardRing';
        this.isHazard = true;
        this.rotationSpeed = -0.42;

        // Reuse the existing shared torus; this accent has no collision role.
        this.innerRim = new Mesh(this.ring.geometry, new MeshBasicMaterial({ color: 0x171018 }));
        this.innerRim.scale.setScalar(0.94);
        this.innerRim.position.z = -0.025;
        this.ringVisual.add(this.innerRim);
        this.material.emissiveIntensity = 0.9;
        this.haloMaterial.opacity = 0.18;
        this.groundAnchor.outerMaterial.color.setHex(0xff4d3d);
        this.groundAnchor.coreMaterial.color.setHex(0xff4d3d);
        this.groundAnchor.baseOpacity = 0.16;

        // Keep the warning X upright while the rim rotates. Both bars remain
        // inside the opening and are decorative only, with no collision role.
        this.warningCross = new Group();
        this.warningCross.name = 'DangerCross';
        this.warningCross.position.z = 0.08;
        const barGeometry = new BoxGeometry(0.2, 2.6, 0.1);
        const barMaterial = new MeshBasicMaterial({ color: 0xff4d3d, toneMapped: false });
        for (const angle of [-Math.PI / 4, Math.PI / 4]) {
            const bar = new Mesh(barGeometry, barMaterial);
            bar.rotation.z = angle;
            this.warningCross.add(bar);
        }
        this.add(this.warningCross);
    }

    update(delta) {
        this.elapsed += delta;
        const pulse = 0.5 + Math.sin(this.elapsed * 4.5) * 0.5;
        this.ringVisual.rotation.z += this.rotationSpeed * delta;
        this.material.emissiveIntensity = 0.75 + pulse * 0.35;
        this.haloMaterial.opacity = 0.14 + pulse * 0.1;
        this.halo.scale.setScalar(1.01 + pulse * 0.09);
        this.groundAnchor.update(this.position.y, this.elapsed, 1 + pulse * 0.18);
    }
}
