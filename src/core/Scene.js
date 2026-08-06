import * as THREE from 'three';

const SKY_COLOR = 0x0b0620;
const FOG_DENSITY = 0.0145;

/**
 * Procedural starfield built from a single BufferGeometry point cloud. No texture
 * is allocated at all, so the GPU cost is just the position buffer: 2600 vertices
 * x 3 floats x 4 bytes is roughly 31KB. Stars wrap around the craft as it travels,
 * so the volume never runs dry.
 */
class StarField extends THREE.Points {
    constructor({ count = 2600, random = Math.random } = {}) {
        const positions = new Float32Array(count * 3);
        const geometry = new THREE.BufferGeometry();
        const material = new THREE.PointsMaterial({
            color: 0xd9c8ff,
            size: 0.5,
            sizeAttenuation: true,
            transparent: true,
            opacity: 0.85,
            depthWrite: false,
        });

        super(geometry, material);

        this.count = count;
        this.positions = positions;
        this.random = random;
        this.volume = { width: 150, height: 90, depth: 260 };
        this.drift = 0;
        this.frustumCulled = false;
        this.name = 'StarField';

        for (let index = 0; index < count; index += 1) this.#placeStar(index);
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    }

    #placeStar(index) {
        const offset = index * 3;
        this.positions[offset] = (this.random() * 2 - 1) * this.volume.width;
        this.positions[offset + 1] = (this.random() * 2 - 1) * this.volume.height;
        this.positions[offset + 2] = (this.random() * 2 - 1) * this.volume.depth;
    }

    /**
     * Recentres on the craft and adds slow parallax drift. Stars that fall behind
     * the volume are wrapped to the front rather than reallocated.
     */
    update(delta, craftPosition) {
        this.drift += delta * 0.6;
        this.position.set(craftPosition.x * 0.35, craftPosition.y * 0.2, craftPosition.z);
        this.rotation.z = Math.sin(this.drift * 0.05) * 0.02;

        const positionAttribute = this.geometry.getAttribute('position');
        const halfDepth = this.volume.depth;
        for (let index = 0; index < this.count; index += 1) {
            const offset = index * 3 + 2;
            this.positions[offset] += delta * 3.2;
            if (this.positions[offset] > halfDepth) this.positions[offset] -= halfDepth * 2;
        }
        positionAttribute.needsUpdate = true;
    }

    dispose() {
        this.geometry.dispose();
        this.material.dispose();
    }
}

export function createScene() {
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

    const starField = new StarField();
    scene.add(starField);

    return { scene, starField };
}
