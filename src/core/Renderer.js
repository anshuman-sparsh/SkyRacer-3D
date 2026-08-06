import * as THREE from 'three';

const MAX_DEVICE_PIXEL_RATIO = 1.5;
const MOBILE_MAX_DEVICE_PIXEL_RATIO = 1;

function isMobileViewport() {
    return window.matchMedia('(pointer: coarse)').matches
        || Math.min(window.innerWidth, window.innerHeight) < 600;
}

function getTargetPixelRatio() {
    const limit = isMobileViewport()
        ? MOBILE_MAX_DEVICE_PIXEL_RATIO
        : MAX_DEVICE_PIXEL_RATIO;
    return Math.min(window.devicePixelRatio || 1, limit);
}

function updatePixelRatio(renderer) {
    const nextPixelRatio = getTargetPixelRatio();
    if (renderer.getPixelRatio() !== nextPixelRatio) renderer.setPixelRatio(nextPixelRatio);
}

export function createRenderer(container) {
    const renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: false,
        powerPreference: 'high-performance',
        // Browsers may place a desynchronised canvas closer to the display scanout,
        // reducing touch-to-photon latency without changing game-loop semantics.
        desynchronized: true,
    });

    updatePixelRatio(renderer);
    renderer.setSize(container.clientWidth, container.clientHeight, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);

    return renderer;
}

export function resizeRenderer(renderer, container) {
    updatePixelRatio(renderer);
    renderer.setSize(
        Math.max(container.clientWidth, 1),
        Math.max(container.clientHeight, 1),
        false,
    );
}