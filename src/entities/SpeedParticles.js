import * as THREE from 'three';

export class SpeedParticles extends THREE.Points {
    constructor({ count = 180, random = Math.random } = {}) {
        const particleCount = Math.min(count, 299);
        const positions = new Float32Array(particleCount * 3);
        const geometry = new THREE.BufferGeometry();
        const material = new THREE.PointsMaterial({
            color: 0xb8fff2,
            size: 0.075,
            transparent: true,
            opacity: 0.58,
            depthWrite: false,
            sizeAttenuation: true,
        });

        super(geometry, material);

        this.particleCount = particleCount;
        this.positions = positions;
        this.random = random;
        this.volume = { width: 23, height: 13, nearZ: -8, farZ: -72 };
        this.frustumCulled = false;
        this.name = 'SpeedParticles';

        for (let index = 0; index < this.particleCount; index += 1) {
            this.#resetParticle(index, true);
        }

        geometry.setAttribute(
            'position',
            new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage),
        );
    }

    update(delta, camera, forwardSpeed, isBoosting) {
        this.position.copy(camera.position);
        this.quaternion.copy(camera.quaternion);

        const normalizedSpeed = THREE.MathUtils.clamp(forwardSpeed / 28, 0, 1.7);
        const streamSpeed = (10 + normalizedSpeed * 30) * (isBoosting ? 1.7 : 1);
        const positionAttribute = this.geometry.getAttribute('position');

        for (let index = 0; index < this.particleCount; index += 1) {
            const offset = index * 3;
            this.positions[offset + 2] += streamSpeed * delta;
            if (this.positions[offset + 2] > this.volume.nearZ) this.#resetParticle(index, false);
        }

        positionAttribute.needsUpdate = true;
        this.material.size = THREE.MathUtils.lerp(
            this.material.size,
            isBoosting ? 0.16 : 0.075,
            1 - Math.exp(-7 * delta),
        );
        this.scale.z = THREE.MathUtils.lerp(
            this.scale.z,
            isBoosting ? 1.65 : 1,
            1 - Math.exp(-7 * delta),
        );
    }

    dispose() {
        this.geometry.dispose();
        this.material.dispose();
    }

    #resetParticle(index, initial) {
        const offset = index * 3;
        this.positions[offset] = (this.random() * 2 - 1) * this.volume.width;
        this.positions[offset + 1] = (this.random() * 2 - 1) * this.volume.height;
        this.positions[offset + 2] = initial
            ? THREE.MathUtils.lerp(this.volume.farZ, this.volume.nearZ, this.random())
            : this.volume.farZ - this.random() * 8;
    }
}