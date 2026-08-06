import * as THREE from 'three';

const MAX_ROLL = THREE.MathUtils.degToRad(25);
const MAX_PITCH = THREE.MathUtils.degToRad(10);

class EngineTrailRibbon extends THREE.Mesh {
    constructor(side) {
        const geometry = new THREE.PlaneGeometry(0.4, 4.2, 1, 8);
        geometry.rotateX(Math.PI / 2);
        const material = new THREE.MeshBasicMaterial({
            color: 0x66ffe2,
            transparent: true,
            opacity: 0.3,
            side: THREE.DoubleSide,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
        });
        super(geometry, material);

        this.side = side;
        this.basePositions = geometry.getAttribute('position').array.slice();
        this.position.set(side * 0.72, -0.05, 4.15);
        this.name = 'EngineTrailRibbon';
    }

    update(elapsed, intensity) {
        const positionAttribute = this.geometry.getAttribute('position');
        for (let index = 0; index < positionAttribute.count; index += 1) {
            const offset = index * 3;
            const baseZ = this.basePositions[offset + 2];
            positionAttribute.array[offset] = this.basePositions[offset]
                + Math.sin(elapsed * 11 + baseZ * 2.4 + this.side) * 0.045 * intensity;
        }
        positionAttribute.needsUpdate = true;
        this.material.opacity = 0.16 + intensity * 0.3;
        this.scale.z = 0.7 + intensity * 0.75;
    }
}

export class HoverCraft extends THREE.Group {
    constructor({ trackWidth = 32, edgeClearance = 1.6 } = {}) {
        super();

        this.velocity = new THREE.Vector3();
        this.halfExtents = new THREE.Vector3(1.3, 0.5, 1.9);
        this.boundingBox = new THREE.Box3();
        this.isSpinningOut = false;
        this.spinOutTime = 0;
        this.spinRate = 0;
        this.acceleration = 18;
        this.friction = 5.5;
        this.drag = 1.8;
        this.turnSpeed = 18;
        this.maxSpeed = 28;
        this.pitch = 0;
        this.rollAngle = 0;
        this.energyBoostTimeRemaining = 0;
        this.energyBoostMultiplier = 1;
        this.energyBoostMaxDuration = 2.5;
        this.elapsed = 0;

        // Derived from the real track width so the craft can never fly out past
        // the guide rails, keeping it inside the visible grid at all times.
        const reachableHalfWidth = Math.max(trackWidth / 2 - edgeClearance, 1);
        this.bounds = {
            minX: -reachableHalfWidth,
            maxX: reachableHalfWidth,
            minY: 1,
            maxY: 10,
        };

        this.visual = new THREE.Group();
        this.add(this.visual);
        this.engineGlows = [];
        this.engineTrails = [];
        this.#buildModel();

        this.position.set(0, 3, 0);
        this.name = 'HoverCraft';
    }

    #buildModel() {
        const hullMaterial = new THREE.MeshLambertMaterial({ color: 0x35d3c2, emissive: 0x063d38 });
        const trimMaterial = new THREE.MeshLambertMaterial({ color: 0xf0cb58, emissive: 0x382b05 });
        const engineMaterial = new THREE.MeshLambertMaterial({ color: 0x263746 });
        const canopyMaterial = new THREE.MeshToonMaterial({ color: 0x69b6df });
        const glowMaterial = new THREE.MeshBasicMaterial({ color: 0x7fffe8 });

        const fuselageGeometry = new THREE.ConeGeometry(0.82, 3.8, 6);
        fuselageGeometry.rotateX(-Math.PI / 2);
        const fuselage = new THREE.Mesh(fuselageGeometry, hullMaterial);
        fuselage.position.z = -0.35;
        fuselage.scale.set(1, 0.62, 1);
        this.visual.add(fuselage);

        const spineGeometry = new THREE.BoxGeometry(0.68, 0.34, 2.1);
        const spine = new THREE.Mesh(spineGeometry, hullMaterial);
        spine.position.set(0, 0.12, 0.42);
        this.visual.add(spine);

        const wingGeometry = new THREE.BoxGeometry(2.45, 0.14, 0.86);
        for (const side of [-1, 1]) {
            const wing = new THREE.Mesh(wingGeometry, trimMaterial);
            wing.position.set(side * 1.25, -0.08, 0.55);
            wing.rotation.y = side * THREE.MathUtils.degToRad(17);
            this.visual.add(wing);
        }

        const nacelleGeometry = new THREE.CylinderGeometry(0.3, 0.38, 1.35, 8);
        nacelleGeometry.rotateX(Math.PI / 2);
        const glowGeometry = new THREE.ConeGeometry(0.22, 0.72, 8);
        glowGeometry.rotateX(Math.PI / 2);

        for (const side of [-1, 1]) {
            const nacelle = new THREE.Mesh(nacelleGeometry, engineMaterial);
            nacelle.position.set(side * 0.72, -0.05, 1.18);
            this.visual.add(nacelle);

            const glow = new THREE.Mesh(glowGeometry, glowMaterial);
            glow.position.set(side * 0.72, -0.05, 2.12);
            this.visual.add(glow);
            this.engineGlows.push(glow);

            const trail = new EngineTrailRibbon(side);
            this.visual.add(trail);
            this.engineTrails.push(trail);
        }

        const canopyGeometry = new THREE.CylinderGeometry(0.3, 0.48, 0.85, 6);
        const canopy = new THREE.Mesh(canopyGeometry, canopyMaterial);
        canopy.scale.set(1, 0.55, 1.3);
        canopy.position.set(0, 0.42, -0.25);
        this.visual.add(canopy);
    }

    update(delta, inputState) {
        const dt = Math.min(delta, 0.05);
        this.elapsed += dt;

        if (this.isSpinningOut) {
            this.#updateSpinOut(dt);
            return;
        }

        const horizontalInput = THREE.MathUtils.clamp(
            Number(inputState.moveRight) - Number(inputState.moveLeft) + (inputState.steer ?? 0),
            -1,
            1,
        );
        const verticalInput = THREE.MathUtils.clamp(
            Number(inputState.moveUp) - Number(inputState.moveDown) + (inputState.pitch ?? 0),
            -1,
            1,
        );
        this.energyBoostTimeRemaining = Math.max(0, this.energyBoostTimeRemaining - dt);
        if (this.energyBoostTimeRemaining === 0) this.energyBoostMultiplier = 1;

        const inputBoostMultiplier = inputState.boost ? 1.35 : 1;
        const boostMultiplier = Math.max(inputBoostMultiplier, this.energyBoostMultiplier);
        const speedLimit = this.maxSpeed * boostMultiplier;

        this.velocity.z = Math.max(
            this.velocity.z - this.acceleration * boostMultiplier * dt,
            -speedLimit,
        );
        this.velocity.x += horizontalInput * this.turnSpeed * dt;
        this.velocity.y += verticalInput * this.turnSpeed * 0.72 * dt;

        const lateralDamping = Math.exp(-this.friction * dt);
        const forwardDamping = Math.exp(-this.drag * dt * 0.08);
        this.velocity.x *= horizontalInput === 0 ? lateralDamping : forwardDamping;
        this.velocity.y *= verticalInput === 0 ? lateralDamping : forwardDamping;
        this.velocity.z *= forwardDamping;
        this.velocity.x = THREE.MathUtils.clamp(this.velocity.x, -10, 10);
        this.velocity.y = THREE.MathUtils.clamp(this.velocity.y, -7, 7);

        this.position.addScaledVector(this.velocity, dt);
        this.#applyBounds();

        const rotationResponse = 1 - Math.exp(-8 * dt);
        this.rollAngle = THREE.MathUtils.lerp(this.rollAngle, -horizontalInput * MAX_ROLL, rotationResponse);
        this.pitch = THREE.MathUtils.lerp(this.pitch, verticalInput * MAX_PITCH, rotationResponse);
        this.rotation.set(this.pitch, 0, this.rollAngle);

        const glowScale = boostMultiplier > 1 ? 1.45 : 1;
        for (const glow of this.engineGlows) {
            glow.scale.z = THREE.MathUtils.lerp(glow.scale.z, glowScale, rotationResponse);
        }

        const trailIntensity = THREE.MathUtils.clamp(-this.velocity.z / this.maxSpeed, 0.2, 1.9)
            * (boostMultiplier > 1 ? 1.55 : 1);
        for (const trail of this.engineTrails) trail.update(this.elapsed, trailIntensity);
    }

    /**
     * Damped tumble played after contacting a Navigation Barrier. Forward motion
     * bleeds off quickly while the craft settles, so the course stops advancing.
     */
    #updateSpinOut(dt) {
        this.spinOutTime += dt;
        this.velocity.multiplyScalar(Math.exp(-3.4 * dt));
        this.position.addScaledVector(this.velocity, dt);
        this.position.y = Math.max(this.position.y - this.spinOutTime * dt * 5.5, this.bounds.minY * 0.6);

        this.spinRate *= Math.exp(-0.9 * dt);
        this.rotation.z += this.spinRate * dt;
        this.rotation.x = THREE.MathUtils.lerp(this.rotation.x, -0.42, 1 - Math.exp(-3 * dt));

        for (const trail of this.engineTrails) trail.update(this.elapsed, 0.1);
        for (const glow of this.engineGlows) {
            glow.scale.z = THREE.MathUtils.lerp(glow.scale.z, 0.2, 1 - Math.exp(-4 * dt));
        }
    }

    spinOut() {
        if (this.isSpinningOut) return;

        this.isSpinningOut = true;
        this.spinOutTime = 0;
        this.spinRate = (this.velocity.x >= 0 ? 1 : -1) * 7.5;
        this.energyBoostTimeRemaining = 0;
        this.energyBoostMultiplier = 1;
    }

    /** Refreshes world-space bounds from the cached local extents. */
    refreshBounds() {
        this.boundingBox.min.copy(this.position).sub(this.halfExtents);
        this.boundingBox.max.copy(this.position).add(this.halfExtents);
        return this.boundingBox;
    }

    /** Restores flight-ready state for an in-place restart, with no reallocation. */
    reset() {
        this.velocity.set(0, 0, 0);
        this.position.set(0, 3, 0);
        this.rotation.set(0, 0, 0);
        this.isSpinningOut = false;
        this.spinOutTime = 0;
        this.spinRate = 0;
        this.pitch = 0;
        this.rollAngle = 0;
        this.elapsed = 0;
        this.energyBoostTimeRemaining = 0;
        this.energyBoostMultiplier = 1;

        for (const glow of this.engineGlows) glow.scale.z = 1;
        for (const trail of this.engineTrails) trail.update(0, 0.2);
    }

    activateEnergyBoost(duration = 2.5, multiplier = 1.5) {
        this.energyBoostTimeRemaining = Math.max(this.energyBoostTimeRemaining, duration);
        this.energyBoostMaxDuration = Math.max(this.energyBoostMaxDuration, duration);
        this.energyBoostMultiplier = Math.max(this.energyBoostMultiplier, multiplier);
    }

    get boostRatio() {
        return THREE.MathUtils.clamp(this.energyBoostTimeRemaining / this.energyBoostMaxDuration, 0, 1);
    }

    #applyBounds() {
        const boundedX = THREE.MathUtils.clamp(this.position.x, this.bounds.minX, this.bounds.maxX);
        const boundedY = THREE.MathUtils.clamp(this.position.y, this.bounds.minY, this.bounds.maxY);

        if (boundedX !== this.position.x) this.velocity.x = 0;
        if (boundedY !== this.position.y) this.velocity.y = 0;
        this.position.x = boundedX;
        this.position.y = boundedY;
    }
}