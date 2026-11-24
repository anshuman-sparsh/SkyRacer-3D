import * as THREE from 'three';
import { readQualityProfile, sizeRenderer } from './QualityProfile.js';

export function createRenderer(container) {
    const renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: false,
        powerPreference: 'high-performance',
        // Browsers may place a desynchronised canvas closer to the display scanout,
        // reducing touch-to-photon latency without changing game-loop semantics.
        desynchronized: true,
    });

    resizeRenderer(renderer, container);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);

    return renderer;
}

export function resizeRenderer(renderer, container) {
    const { pixelRatio } = readQualityProfile(window, navigator, container.clientWidth, container.clientHeight);
    return sizeRenderer(renderer, container.clientWidth, container.clientHeight, pixelRatio);
}
