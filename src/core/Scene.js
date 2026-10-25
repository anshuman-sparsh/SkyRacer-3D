import * as THREE from 'three';
import { createPointTexture } from '../utils/PointTexture.js';

const SKY_COLOR = 0x0b0620;
// Let rings and obstacles remain readable a little earlier, while distant
// noninteractive silhouettes still blend softly into the dark horizon.
const FOG_DENSITY = 0.0128;

/**
 * A distant upper-sky dome, rendered in one draw call with a tiny procedural
 * soft-dot sprite. Static vertices follow the craft horizontally without ever
 * entering its flight corridor or needing per-frame buffer uploads.
 */
class StarField extends THREE.Points {
    constructor({ count = 2600, random = Math.random } = {}) {
        const positions = new Float32Array(count * 3);
        const geometry = new THREE.BufferGeometry();
        const material = new THREE.PointsMaterial({
            color: 0xd9c8ff,
            map: createPointTexture(),
            size: 0.36,
            sizeAttenuation: true,
            transparent: true,
            opacity: 0.68,
            depthWrite: false,
            alphaTest: 0.01,
            fog: false,
        });

        super(geometry, material);

        this.positions = positions;
        this.random = random;
        this.drift = 0;
        this.frustumCulled = false;
        this.name = 'StarField';

        for (let index = 0; index < count; index += 1) this.#placeStar(index);
        geometry.setAttribute(
            'position',
            new THREE.BufferAttribute(positions, 3).setUsage(THREE.StaticDrawUsage),
        );
    }

    #placeStar(index) {
        const offset = index * 3;
        const azimuth = this.random() * Math.PI * 2;
        // Uniform solid-angle sampling above ~15 degrees elevation. Even the
        // lowest star stays >28 units high, well above the 1–10 flight band.
        const elevationSin = THREE.MathUtils.lerp(0.26, 0.96, this.random());
        const radius = THREE.MathUtils.lerp(110, 135, this.random());
        const horizontalRadius = radius * Math.sqrt(1 - elevationSin * elevationSin);
        this.positions[offset] = Math.cos(azimuth) * horizontalRadius;
        this.positions[offset + 1] = elevationSin * radius;
        this.positions[offset + 2] = Math.sin(azimuth) * horizontalRadius;
    }

    /**
     * Recentres on the craft and adds a slow rotational drift. Keeping all local
     * vertices static avoids uploading the full point buffer on every mobile frame.
     */
    update(delta, craftPosition) {
        this.drift += delta * 0.6;
        this.position.set(craftPosition.x, 0, craftPosition.z);
        // Yaw preserves every star's height; rolling the cloud lowered stars
        // toward the course. Following Z continuously also avoids wrap pops.
        this.rotation.y = Math.sin(this.drift * 0.05) * 0.02;
    }

    dispose() {
        this.geometry.dispose();
        this.material.map.dispose();
        this.material.dispose();
    }
}

export function createScene({ reducedScenery = false } = {}) {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(SKY_COLOR);
    // Exponential falloff gives close course objects strong contrast while rings
    // and barriers merge progressively into the horizon instead of disappearing at
    // a hard linear-fog boundary.
    scene.fog = new THREE.FogExp2(SKY_COLOR, FOG_DENSITY);

    const ambientLight = new THREE.AmbientLight(0x9d8cd8, 1.05);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0x8bf7ff, 2.05);
    keyLight.position.set(8, 15, 9);
    scene.add(keyLight);

    // Magenta rim light opposite the key light gives the synthwave two-tone look.
    const rimLight = new THREE.DirectionalLight(0xff3fa4, 1.1);
    rimLight.position.set(-9, 6, -12);
    scene.add(rimLight);

    // Background-only detail reduction; rings, barriers and markers unchanged.
    const starField = new StarField({ count: reducedScenery ? 1600 : 2600 });
    scene.add(starField);

    return { scene, starField };
}
