import * as THREE from 'three';
import { GroundAnchor } from './GroundAnchor.js';

const MAX_ROLL = THREE.MathUtils.degToRad(30);
const MAX_PITCH = THREE.MathUtils.degToRad(14);
const LATERAL_SPEED = 17;
const VERTICAL_SPEED = 11.5;
const INPUT_RESPONSE = 17;
const RELEASE_RESPONSE = 21;
const KMH_PER_WORLD_UNIT = 3.6;
const DEFAULT_BASE_SPEED = 28;
const SPEED_INCREASE_KMH_PER_LEVEL = 2;
const ENERGY_BOOST_DURATION = 4.5;
const SURGE_BASE_SPEED_KMH = 165;
const SURGE_SPEED_INCREASE_KMH = 5;
const SURGE_RINGS_PER_LEVEL = 4;
const SURGE_DURATION = 1.6;
const OVERSPEED_DECAY_RESPONSE = 1.65;
const TIMER_EPSILON = 1e-6;

// Conservative solid-body approximations. Small separate shapes avoid the
// empty corners of the former single aircraft AABB; trails/glows never collide.
// Local-space centres follow the procedural meshes in #buildModel().
const COLLISION_SHAPES = [
    ['hull', 0, 0, -0.25, 0.52, 0.30, 1.35],
    ['nose', 0, 0, -1.90, 0.24, 0.22, 0.82],
    ['canopy', 0, 0.40, -0.75, 0.32, 0.31, 0.57],
    ['rear-hull', 0, -0.05, 1.28, 0.40, 0.27, 0.68],
    ['tail-fin', 0, 0.37, 1.24, 0.11, 0.43, 0.56],
    ['left-wing', -1.15, -0.08, 0.62, 0.85, 0.09, 0.43],
    ['right-wing', 1.15, -0.08, 0.62, 0.85, 0.09, 0.43],
    ['left-wingtip', -2.08, -0.01, 1.19, 0.51, 0.08, 0.35],
    ['right-wingtip', 2.08, -0.01, 1.19, 0.51, 0.08, 0.35],
    ['left-engine', -0.82, -0.08, 1.60, 0.30, 0.29, 1.04],
    ['right-engine', 0.82, -0.08, 1.60, 0.30, 0.29, 1.04],
];

class EngineTrailRibbon extends THREE.Mesh {
    constructor(side) {
        const geometry = new THREE.PlaneGeometry(0.42, 4.8, 1, 7);
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
        this.position.set(side * 0.82, -0.08, 4.72);
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
        this.material.opacity = 0.14 + intensity * 0.32;
        this.scale.z = 0.62 + intensity * 0.88;
    }
}

export class HoverCraft extends THREE.Group {
    constructor({ trackWidth = 32, edgeClearance = 1.6 } = {}) {
        super();

        this.velocity = new THREE.Vector3();
        // Reuse these boxes every frame: no collision-related GPU or heap churn.
        this.boundingBox = new THREE.Box3();
        this.collisionParts = COLLISION_SHAPES.map(([name, x, y, z, hx, hy, hz]) => ({
            name,
            centre: new THREE.Vector3(x, y, z),
            halfExtents: new THREE.Vector3(hx, hy, hz),
            box: new THREE.Box3(),
        }));
        this.collisionBoxes = this.collisionParts.map((part) => part.box);
        this.isSpinningOut = false;
        this.spinOutTime = 0;
        this.spinRate = 0;
        this.acceleration = 18;
        this.maxSpeed = DEFAULT_BASE_SPEED;
        this.speedProgressionLevel = 0;
        this.pitch = 0;
        this.rollAngle = 0;
        this.energyBoostTimeRemaining = 0;
        this.energyBoostMultiplier = 1;
        this.energyBoostMaxDuration = ENERGY_BOOST_DURATION;
        this.speedSurgeTimeRemaining = 0;
        this.collectedSurgeRings = 0;
        this.speedSurgeTarget = SURGE_BASE_SPEED_KMH / KMH_PER_WORLD_UNIT;
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
        this.groundAnchor = new GroundAnchor({ radius: 1.8, color: 0x62ffe6, opacity: 0.1 });
        this.add(this.groundAnchor);
        this.engineGlows = [];
        this.engineTrails = [];
        this.#buildModel();

        this.position.set(0, 3, 0);
        this.name = 'HoverCraft';
    }

    #buildModel() {
        const hullMaterial = new THREE.MeshLambertMaterial({
            color: 0x24bfb7,
            emissive: 0x063e3b,
            emissiveIntensity: 0.8,
        });
        const trimMaterial = new THREE.MeshLambertMaterial({
            color: 0xf6c84b,
            emissive: 0x4a3003,
            emissiveIntensity: 0.75,
        });
        const engineMaterial = new THREE.MeshLambertMaterial({ color: 0x172b3b, emissive: 0x07121d });
        const canopyMaterial = new THREE.MeshToonMaterial({
            color: 0x67cfff,
            emissive: 0x123d66,
            emissiveIntensity: 1.15,
        });
        const glowMaterial = new THREE.MeshBasicMaterial({ color: 0x8cfff0 });
        const hotCoreMaterial = new THREE.MeshBasicMaterial({ color: 0xfff2a6 });

        // A tapered hexagonal fuselage provides a crisp jet silhouette at very low
        // vertex cost. Forward travel is negative Z, so the cone points that way.
        const fuselageGeometry = new THREE.ConeGeometry(0.84, 4.85, 6);
        fuselageGeometry.rotateX(-Math.PI / 2);
        const fuselage = new THREE.Mesh(fuselageGeometry, hullMaterial);
        fuselage.position.set(0, 0, -0.42);
        fuselage.scale.set(1, 0.58, 1);
        this.visual.add(fuselage);

        const spineGeometry = new THREE.BoxGeometry(0.64, 0.25, 2.45);
        const spine = new THREE.Mesh(spineGeometry, hullMaterial);
        spine.position.set(0, 0.1, 0.52);
        this.visual.add(spine);

        const wingGeometry = new THREE.BoxGeometry(2.7, 0.12, 0.76);
        const wingTipGeometry = new THREE.BoxGeometry(1.2, 0.1, 0.42);
        for (const side of [-1, 1]) {
            const wing = new THREE.Mesh(wingGeometry, trimMaterial);
            wing.position.set(side * 1.24, -0.08, 0.62);
            wing.rotation.y = side * THREE.MathUtils.degToRad(24);
            this.visual.add(wing);

            const wingTip = new THREE.Mesh(wingTipGeometry, hullMaterial);
            wingTip.position.set(side * 2.05, -0.01, 1.22);
            wingTip.rotation.y = side * THREE.MathUtils.degToRad(31);
            this.visual.add(wingTip);
        }

        const nacelleGeometry = new THREE.CylinderGeometry(0.3, 0.4, 1.7, 8);
        nacelleGeometry.rotateX(Math.PI / 2);
        const nozzleGeometry = new THREE.CylinderGeometry(0.3, 0.36, 0.38, 8);
        nozzleGeometry.rotateX(Math.PI / 2);
        const coreGeometry = new THREE.CylinderGeometry(0.2, 0.2, 0.06, 8);
        coreGeometry.rotateX(Math.PI / 2);
        const glowGeometry = new THREE.ConeGeometry(0.23, 0.9, 8);
        glowGeometry.rotateX(Math.PI / 2);

        for (const side of [-1, 1]) {
            const nacelle = new THREE.Mesh(nacelleGeometry, engineMaterial);
            nacelle.position.set(side * 0.82, -0.08, 1.22);
            this.visual.add(nacelle);

            const nozzle = new THREE.Mesh(nozzleGeometry, trimMaterial);
            nozzle.position.set(side * 0.82, -0.08, 2.22);
            this.visual.add(nozzle);

            const core = new THREE.Mesh(coreGeometry, hotCoreMaterial);
            core.position.set(side * 0.82, -0.08, 2.43);
            this.visual.add(core);

            const glow = new THREE.Mesh(glowGeometry, glowMaterial);
            glow.position.set(side * 0.82, -0.08, 2.78);
            this.visual.add(glow);
            this.engineGlows.push(glow);

            const trail = new EngineTrailRibbon(side);
            this.visual.add(trail);
            this.engineTrails.push(trail);
        }

        const canopyGeometry = new THREE.CylinderGeometry(0.3, 0.5, 1.35, 6);
        canopyGeometry.rotateX(-Math.PI / 2);
        const canopy = new THREE.Mesh(canopyGeometry, canopyMaterial);
        canopy.scale.set(1, 0.72, 1);
        canopy.position.set(0, 0.42, -0.72);
        this.visual.add(canopy);

        const tailFinGeometry = new THREE.BoxGeometry(0.12, 0.72, 1.05);
        const tailFin = new THREE.Mesh(tailFinGeometry, trimMaterial);
        tailFin.position.set(0, 0.38, 1.25);
        tailFin.rotation.x = THREE.MathUtils.degToRad(-12);
        this.visual.add(tailFin);
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
        this.energyBoostTimeRemaining = this.energyBoostTimeRemaining <= dt + TIMER_EPSILON
            ? 0
            : this.energyBoostTimeRemaining - dt;
        if (this.energyBoostTimeRemaining === 0) this.energyBoostMultiplier = 1;
        this.speedSurgeTimeRemaining = this.speedSurgeTimeRemaining <= dt + TIMER_EPSILON
            ? 0
            : this.speedSurgeTimeRemaining - dt;

        const inputBoostMultiplier = inputState.boost ? 1.35 : 1;
        const boostMultiplier = Math.max(inputBoostMultiplier, this.energyBoostMultiplier);
        const cruiseSpeed = this.maxSpeed * boostMultiplier;
        const currentForwardSpeed = Math.max(0, -this.velocity.z);
        let nextForwardSpeed = currentForwardSpeed;

        if (this.isSpeedSurging) {
            // Hold the run's progressive Pink Ring target, or above it if a very
            // advanced session's boosted cruise speed has exceeded that threshold.
            nextForwardSpeed = Math.max(this.speedSurgeTarget, cruiseSpeed);
        } else if (currentForwardSpeed > cruiseSpeed) {
            nextForwardSpeed = THREE.MathUtils.lerp(
                currentForwardSpeed,
                cruiseSpeed,
                1 - Math.exp(-OVERSPEED_DECAY_RESPONSE * dt),
            );
        } else {
            nextForwardSpeed = Math.min(
                currentForwardSpeed + this.acceleration * boostMultiplier * dt,
                cruiseSpeed,
            );
        }
        this.velocity.z = -nextForwardSpeed;
        const controlResponse = 1 - Math.exp(-INPUT_RESPONSE * dt);
        const lateralRelease = 1 - Math.exp(-RELEASE_RESPONSE * dt);
        this.velocity.x = THREE.MathUtils.lerp(
            this.velocity.x,
            horizontalInput * LATERAL_SPEED,
            horizontalInput === 0 ? lateralRelease : controlResponse,
        );
        this.velocity.y = THREE.MathUtils.lerp(
            this.velocity.y,
            verticalInput * VERTICAL_SPEED,
            verticalInput === 0 ? lateralRelease : controlResponse,
        );

        this.position.addScaledVector(this.velocity, dt);
        this.#applyBounds();

        const rotationResponse = 1 - Math.exp(-15 * dt);
        this.rollAngle = THREE.MathUtils.lerp(this.rollAngle, -horizontalInput * MAX_ROLL, rotationResponse);
        this.pitch = THREE.MathUtils.lerp(this.pitch, verticalInput * MAX_PITCH, rotationResponse);
        this.visual.rotation.set(this.pitch, 0, this.rollAngle);

        const glowScale = boostMultiplier > 1 ? 1.45 : 1;
        for (const glow of this.engineGlows) {
            glow.scale.z = THREE.MathUtils.lerp(glow.scale.z, glowScale, rotationResponse);
        }

        const trailIntensity = THREE.MathUtils.clamp(-this.velocity.z / this.maxSpeed, 0.2, 1.9)
            * (boostMultiplier > 1 ? 1.55 : 1);
        for (const trail of this.engineTrails) trail.update(this.elapsed, trailIntensity);
        this.groundAnchor.update(this.position.y, this.elapsed, 0.8 + trailIntensity * 0.18);
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
        this.visual.rotation.z += this.spinRate * dt;
        this.visual.rotation.x = THREE.MathUtils.lerp(
            this.visual.rotation.x,
            -0.42,
            1 - Math.exp(-3 * dt),
        );

        for (const trail of this.engineTrails) trail.update(this.elapsed, 0.1);
        for (const glow of this.engineGlows) {
            glow.scale.z = THREE.MathUtils.lerp(glow.scale.z, 0.2, 1 - Math.exp(-4 * dt));
        }
        this.groundAnchor.update(this.position.y, this.elapsed, 0.58);
    }

    spinOut() {
        if (this.isSpinningOut) return;

        this.isSpinningOut = true;
        this.spinOutTime = 0;
        this.spinRate = (this.velocity.x >= 0 ? 1 : -1) * 7.5;
        this.energyBoostTimeRemaining = 0;
        this.energyBoostMultiplier = 1;
        this.energyBoostMaxDuration = ENERGY_BOOST_DURATION;
        this.speedSurgeTimeRemaining = 0;
    }

    /**
     * Updates conservative AABBs for the solid aircraft parts, including its
     * visible pitch/bank. The union is a broad-phase reject; callers use the
     * individual boxes for the actual collision so empty corners cannot hit.
     */
    refreshBounds() {
        const sinPitch = Math.sin(this.visual.rotation.x);
        const cosPitch = Math.cos(this.visual.rotation.x);
        const sinRoll = Math.sin(this.visual.rotation.z);
        const cosRoll = Math.cos(this.visual.rotation.z);
        const absSinPitch = Math.abs(sinPitch);
        const absCosPitch = Math.abs(cosPitch);
        const absSinRoll = Math.abs(sinRoll);
        const absCosRoll = Math.abs(cosRoll);
        const world = this.position;

        this.boundingBox.makeEmpty();
        for (const part of this.collisionParts) {
            const { centre, halfExtents, box } = part;
            // Three.js's default XYZ Euler order: X pitch, then Z bank
            // (rotation around local Y is always zero for this visual).
            const rolledY = sinRoll * centre.x + cosRoll * centre.y;
            const x = world.x + cosRoll * centre.x - sinRoll * centre.y;
            const y = world.y + cosPitch * rolledY - sinPitch * centre.z;
            const z = world.z + sinPitch * rolledY + cosPitch * centre.z;

            const hx = absCosRoll * halfExtents.x + absSinRoll * halfExtents.y;
            const hy = absCosPitch * (absSinRoll * halfExtents.x
                + absCosRoll * halfExtents.y) + absSinPitch * halfExtents.z;
            const hz = absSinPitch * (absSinRoll * halfExtents.x
                + absCosRoll * halfExtents.y) + absCosPitch * halfExtents.z;

            box.min.set(x - hx, y - hy, z - hz);
            box.max.set(x + hx, y + hy, z + hz);
            this.boundingBox.union(box);
        }
        return this.boundingBox;
    }

    /** Restores flight-ready state for an in-place restart, with no reallocation. */
    reset() {
        this.velocity.set(0, 0, 0);
        this.position.set(0, 3, 0);
        this.rotation.set(0, 0, 0);
        this.visual.rotation.set(0, 0, 0);
        this.isSpinningOut = false;
        this.spinOutTime = 0;
        this.spinRate = 0;
        this.pitch = 0;
        this.rollAngle = 0;
        this.elapsed = 0;
        this.energyBoostTimeRemaining = 0;
        this.energyBoostMultiplier = 1;
        this.energyBoostMaxDuration = ENERGY_BOOST_DURATION;
        this.speedSurgeTimeRemaining = 0;
        this.collectedSurgeRings = 0;
        this.speedSurgeTarget = SURGE_BASE_SPEED_KMH / KMH_PER_WORLD_UNIT;
        this.speedProgressionLevel = 0;
        this.maxSpeed = DEFAULT_BASE_SPEED;

        for (const glow of this.engineGlows) glow.scale.z = 1;
        for (const trail of this.engineTrails) trail.update(0, 0.2);
        this.groundAnchor.update(this.position.y, 0, 1);
    }

    activateEnergyBoost(duration = ENERGY_BOOST_DURATION, multiplier = 1.5) {
        this.energyBoostTimeRemaining = Math.max(this.energyBoostTimeRemaining, duration);
        this.energyBoostMaxDuration = Math.max(this.energyBoostMaxDuration, duration);
        this.energyBoostMultiplier = Math.max(this.energyBoostMultiplier, multiplier);
    }

    /**
     * Enters a temporary Pink Ring rush. Each completed group of four previously
     * collected Pink Rings raises the next ring's target by 5 km/h for this run.
     */
    activateSpeedSurge(collectedRings = 1, duration = SURGE_DURATION) {
        const ringCount = Math.max(0, Math.floor(collectedRings));
        if (ringCount === 0) return;

        this.collectedSurgeRings += ringCount;
        const surgeLevel = Math.floor((this.collectedSurgeRings - 1) / SURGE_RINGS_PER_LEVEL);
        const targetKmh = SURGE_BASE_SPEED_KMH + surgeLevel * SURGE_SPEED_INCREASE_KMH;
        this.speedSurgeTarget = targetKmh / KMH_PER_WORLD_UNIT;
        this.speedSurgeTimeRemaining = Math.max(this.speedSurgeTimeRemaining, duration);
        this.velocity.z = -Math.max(Math.max(0, -this.velocity.z), this.speedSurgeTarget);
    }

    /** Synchronizes permanent session progression from ScoreManager's ring total. */
    setSpeedProgressionLevel(level) {
        this.speedProgressionLevel = Math.max(0, Math.floor(level));
        this.maxSpeed = DEFAULT_BASE_SPEED
            + (this.speedProgressionLevel * SPEED_INCREASE_KMH_PER_LEVEL) / KMH_PER_WORLD_UNIT;
    }

    get boostRatio() {
        return THREE.MathUtils.clamp(this.energyBoostTimeRemaining / this.energyBoostMaxDuration, 0, 1);
    }

    get isSpeedSurging() {
        return this.speedSurgeTimeRemaining > 0;
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
