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
        // Boost and Surge share the same effect. Hide a small fraction of the
        // dots while boosting; keep all positions moving so returning to normal
        // doesn't suddenly restart particles.
        this.visibleParticleCount = particleCount;
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
        const response = 1 - Math.exp(-7 * delta);
        const targetCount = isBoosting
            ? Math.round(this.particleCount * 0.82)
            : this.particleCount;
        this.visibleParticleCount = THREE.MathUtils.lerp(
            this.visibleParticleCount, targetCount, response,
        );
        this.geometry.setDrawRange(0, Math.round(this.visibleParticleCount));

        // Keep the feeling of acceleration without obscuring rings or the
        // aiming reticle with enlarged, high-opacity speed particles.
        this.material.size = THREE.MathUtils.lerp(
            this.material.size,
            isBoosting ? 0.125 : 0.075,
            response,
        );
        this.material.opacity = THREE.MathUtils.lerp(
            this.material.opacity,
            isBoosting ? 0.51 : 0.58,
            response,
        );
        this.scale.z = THREE.MathUtils.lerp(
            this.scale.z,
            isBoosting ? 1.5 : 1,
            response,
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