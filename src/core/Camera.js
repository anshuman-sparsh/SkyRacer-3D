import * as THREE from 'three';

const LANDSCAPE_PROFILE = Object.freeze({
    baseFov: 58,
    boostFov: 71,
    lookAhead: 23,
    lookHeight: 0.75,
    followHeight: 4.45,
    followDistance: 9.4,
});

const PORTRAIT_PROFILE = Object.freeze({
    baseFov: 76,
    boostFov: 84,
    lookAhead: 28,
    lookHeight: 1.7,
    followHeight: 5.8,
    followDistance: 15.2,
});

function sanitizeAspect(aspect) {
    return Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
}

/**
 * Blends rather than switches at aspect 1, preventing a visible camera jump while
 * a phone rotates. The wider portrait FOV and longer follow distance restore side
 * visibility without stretching the projection.
 */
function getViewportProfile(aspect) {
    const safeAspect = sanitizeAspect(aspect);
    const portraitAmount = THREE.MathUtils.smoothstep(1 - safeAspect, 0, 0.48);
    const profile = {};

    for (const key of Object.keys(LANDSCAPE_PROFILE)) {
        profile[key] = THREE.MathUtils.lerp(
            LANDSCAPE_PROFILE[key],
            PORTRAIT_PROFILE[key],
            portraitAmount,
        );
    }

    return profile;
}

export function createCamera(aspect) {
    const safeAspect = sanitizeAspect(aspect);
    const profile = getViewportProfile(safeAspect);
    const camera = new THREE.PerspectiveCamera(profile.baseFov, safeAspect, 0.1, 160);
    camera.position.set(0, profile.followHeight, profile.followDistance);
    camera.lookAt(0, profile.lookHeight, -profile.lookAhead);

    return camera;
}

export class CameraDynamics {
    constructor(camera) {
        this.camera = camera;
        this.viewportProfile = getViewportProfile(camera.aspect);
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
            craft.position.y + this.viewportProfile.lookHeight,
            craft.position.z - this.viewportProfile.lookAhead,
        );
    }

    /** Updates projection and composition as one atomic viewport operation. */
    resize(aspect, craft = null) {
        const safeAspect = sanitizeAspect(aspect);
        const previousProfile = this.viewportProfile;
        const nextProfile = getViewportProfile(safeAspect);
        const boostMix = THREE.MathUtils.clamp(
            (this.camera.fov - previousProfile.baseFov)
            / (previousProfile.boostFov - previousProfile.baseFov),
            0,
            1,
        );

        this.viewportProfile = nextProfile;
        this.camera.aspect = safeAspect;
        this.camera.fov = THREE.MathUtils.lerp(
            nextProfile.baseFov,
            nextProfile.boostFov,
            boostMix,
        );

        if (craft) {
            this.springPosition.y += nextProfile.followHeight - previousProfile.followHeight;
            this.springPosition.z += nextProfile.followDistance - previousProfile.followDistance;
            this.camera.position.copy(this.springPosition).add(this.impulse).add(this.shakeOffset);
            this.#setLookTarget(craft);
            this.camera.lookAt(this.lookTarget);
            this.camera.rotateZ(this.lean);
        }

        this.camera.updateProjectionMatrix();
    }

    snapTo(craft) {
        const { followHeight, followDistance, baseFov } = this.viewportProfile;
        this.springPosition.set(
            craft.position.x,
            craft.position.y + followHeight,
            craft.position.z + followDistance,
        );
        this.springVelocity.set(0, 0, 0);
        this.impulse.set(0, 0, 0);
        this.shakeOffset.set(0, 0, 0);
        this.shakeStrength = 0;
        this.lean = 0;
        this.previousForwardSpeed = 0;
        this.camera.position.copy(this.springPosition);
        this.camera.fov = baseFov;
        this.camera.updateProjectionMatrix();
        this.#setLookTarget(craft);
        this.camera.lookAt(this.lookTarget);
    }

    update(delta, craft, isBoosting, isSurging = false) {
        const dt = Math.min(delta, 0.05);
        const forwardSpeed = Math.max(0, -craft.velocity.z);
        const normalizedSpeed = THREE.MathUtils.clamp(forwardSpeed / craft.maxSpeed, 0, 1.6);
        const acceleration = Math.max(0, (forwardSpeed - this.previousForwardSpeed) / Math.max(dt, 0.001));
        const pullback = normalizedSpeed * 1.2
            + Math.min(acceleration * 0.025, 0.8)
            + (isBoosting ? 2.1 : 0)
            + (isSurging ? 1.25 : 0);

        const { followHeight, followDistance } = this.viewportProfile;
        this.desiredPosition.set(
            craft.position.x,
            craft.position.y + followHeight,
            craft.position.z + followDistance + pullback,
        );

        // Exponential smoothing is invariant to frame-rate changes. The previous
        // semi-implicit spring could overshoot when mobile frames alternated between
        // 16 ms and 30+ ms, making an otherwise stable craft appear to judder.
        const followResponse = 1 - Math.exp(-8.5 * dt);
        this.springPosition.lerp(this.desiredPosition, followResponse);
        this.springVelocity.set(0, 0, 0);

        this.#updateShake(dt);
        this.camera.position.copy(this.springPosition).add(this.impulse).add(this.shakeOffset);

        this.#setLookTarget(craft);
        this.camera.lookAt(this.lookTarget);

        const targetLean = THREE.MathUtils.clamp(-craft.velocity.x * 0.021, -0.14, 0.14);
        this.lean = THREE.MathUtils.lerp(this.lean, targetLean, 1 - Math.exp(-6 * dt));
        this.camera.rotateZ(this.lean);

        const targetFov = isSurging
            ? this.viewportProfile.boostFov + 5
            : (isBoosting ? this.viewportProfile.boostFov : this.viewportProfile.baseFov);
        const response = 1 - Math.exp(-5 * dt);
        const nextFov = THREE.MathUtils.lerp(this.camera.fov, targetFov, response);

        if (Math.abs(nextFov - this.camera.fov) > 0.02) {
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
    camera.aspect = sanitizeAspect(aspect);
    camera.updateProjectionMatrix();
}
