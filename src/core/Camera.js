import * as THREE from 'three';

const BASE_FOV = 60;
const BOOST_FOV = 73;
const LOOK_AHEAD = 20;
const LOOK_HEIGHT = 1.2;
const FOLLOW_HEIGHT = 3.8;
const FOLLOW_DISTANCE = 8.5;

export function createCamera(aspect) {
    const camera = new THREE.PerspectiveCamera(BASE_FOV, aspect, 0.1, 160);
    camera.position.set(0, FOLLOW_HEIGHT, FOLLOW_DISTANCE);
    camera.lookAt(0, LOOK_HEIGHT, -LOOK_AHEAD);

    return camera;
}

export class CameraDynamics {
    constructor(camera) {
        this.camera = camera;
        this.springPosition = camera.position.clone();
        this.springVelocity = new THREE.Vector3();
        this.desiredPosition = new THREE.Vector3();
        this.springAcceleration = new THREE.Vector3();
        this.lookTarget = new THREE.Vector3();
        this.impulse = new THREE.Vector3();
        this.shakeOffset = new THREE.Vector3();
        this.shakeStrength = 0;
        this.shakeTime = 0;
        this.lean = 0;
        this.previousForwardSpeed = 0;
    }

    /**
     * The camera tracks the craft's X exactly and aims at that same X, which locks
     * the craft to the central axis of the track grid. Turns read as banking via
     * roll and FOV rather than lateral drift.
     */
    #setLookTarget(craft) {
        this.lookTarget.set(
            craft.position.x,
            craft.position.y + LOOK_HEIGHT,
            craft.position.z - LOOK_AHEAD,
        );
    }

    snapTo(craft) {
        this.springPosition.set(
            craft.position.x,
            craft.position.y + FOLLOW_HEIGHT,
            craft.position.z + FOLLOW_DISTANCE,
        );
        this.springVelocity.set(0, 0, 0);
        this.impulse.set(0, 0, 0);
        this.shakeOffset.set(0, 0, 0);
        this.shakeStrength = 0;
        this.lean = 0;
        this.previousForwardSpeed = 0;
        this.camera.position.copy(this.springPosition);
        this.camera.fov = BASE_FOV;
        this.camera.updateProjectionMatrix();
        this.#setLookTarget(craft);
        this.camera.lookAt(this.lookTarget);
    }

    update(delta, craft, isBoosting) {
        const dt = Math.min(delta, 0.05);
        const forwardSpeed = Math.max(0, -craft.velocity.z);
        const normalizedSpeed = THREE.MathUtils.clamp(forwardSpeed / craft.maxSpeed, 0, 1.6);
        const acceleration = Math.max(0, (forwardSpeed - this.previousForwardSpeed) / Math.max(dt, 0.001));
        const pullback = normalizedSpeed * 1.2 + Math.min(acceleration * 0.025, 0.8) + (isBoosting ? 2.1 : 0);

        this.desiredPosition.set(
            craft.position.x,
            craft.position.y + FOLLOW_HEIGHT,
            craft.position.z + FOLLOW_DISTANCE + pullback,
        );

        const stiffness = 34;
        const damping = 10.5;
        this.springAcceleration.copy(this.desiredPosition).sub(this.springPosition).multiplyScalar(stiffness);
        this.springAcceleration.addScaledVector(this.springVelocity, -damping);
        this.springVelocity.addScaledVector(this.springAcceleration, dt);
        this.springPosition.addScaledVector(this.springVelocity, dt);

        this.#updateShake(dt);
        this.camera.position.copy(this.springPosition).add(this.impulse).add(this.shakeOffset);

        this.#setLookTarget(craft);
        this.camera.lookAt(this.lookTarget);

        const targetLean = THREE.MathUtils.clamp(-craft.velocity.x * 0.021, -0.14, 0.14);
        this.lean = THREE.MathUtils.lerp(this.lean, targetLean, 1 - Math.exp(-6 * dt));
        this.camera.rotateZ(this.lean);

        const targetFov = isBoosting ? BOOST_FOV : BASE_FOV;
        const response = 1 - Math.exp(-5 * dt);
        const nextFov = THREE.MathUtils.lerp(this.camera.fov, targetFov, response);

        if (Math.abs(nextFov - this.camera.fov) > 0.001) {
            this.camera.fov = nextFov;
            this.camera.updateProjectionMatrix();
        }

        this.impulse.multiplyScalar(Math.exp(-14 * dt));
        this.previousForwardSpeed = forwardSpeed;
    }

    /**
     * Shake is layered on after the spring solve so it never fights the spring.
     * Summed sine waves keep the motion smooth rather than strobing per frame.
     */
    #updateShake(dt) {
        if (this.shakeStrength <= 0.0001) {
            this.shakeOffset.set(0, 0, 0);
            this.shakeStrength = 0;
            return;
        }

        this.shakeTime += dt;
        this.shakeStrength *= Math.exp(-5.2 * dt);

        const amplitude = this.shakeStrength * 0.42;
        this.shakeOffset.set(
            Math.sin(this.shakeTime * 41.3) * amplitude,
            Math.sin(this.shakeTime * 33.7 + 1.7) * amplitude * 0.8,
            Math.sin(this.shakeTime * 27.1 + 3.1) * amplitude * 0.35,
        );
    }

    addShake(strength = 0.35) {
        this.shakeStrength = Math.min(this.shakeStrength + strength, 1.2);
    }

    addRingImpulse(strength = 0.32) {
        this.impulse.y += strength;
        this.impulse.z += strength * 0.45;
    }
}

export function resizeCamera(camera, aspect) {
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
}
