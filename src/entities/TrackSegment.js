import * as THREE from 'three';
import { markShared } from '../utils/Memory.js';

const GRID_TEXTURE_SIZE = 256;

let sharedGridTexture = null;
let sharedMaterials = null;
const sharedGeometries = new Map();

/**
 * Draws the glowing course grid straight onto a canvas so no image file is ever
 * fetched. One 256x256 RGBA texture costs ~350KB of VRAM with mipmaps, and it is
 * uploaded a single time for the entire session regardless of segment count.
 */
function createGridTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = GRID_TEXTURE_SIZE;
    canvas.height = GRID_TEXTURE_SIZE;
    const context = canvas.getContext('2d');

    context.fillStyle = '#160b2e';
    context.fillRect(0, 0, GRID_TEXTURE_SIZE, GRID_TEXTURE_SIZE);

    context.lineWidth = 1;
    context.strokeStyle = 'rgba(94, 240, 255, 0.30)';
    for (let coordinate = 0; coordinate <= GRID_TEXTURE_SIZE; coordinate += 32) {
        context.beginPath();
        context.moveTo(coordinate, 0);
        context.lineTo(coordinate, GRID_TEXTURE_SIZE);
        context.stroke();

        context.beginPath();
        context.moveTo(0, coordinate);
        context.lineTo(GRID_TEXTURE_SIZE, coordinate);
        context.stroke();
    }

    // Hot magenta centre stripe against neon cyan grid lines.
    context.lineWidth = 3;
    context.strokeStyle = 'rgba(255, 63, 164, 0.85)';
    context.beginPath();
    context.moveTo(128, 0);
    context.lineTo(128, GRID_TEXTURE_SIZE);
    context.stroke();

    context.lineWidth = 2;
    context.strokeStyle = 'rgba(92, 255, 240, 0.55)';
    for (const x of [32, 224]) {
        context.beginPath();
        context.moveTo(x, 0);
        context.lineTo(x, GRID_TEXTURE_SIZE);
        context.stroke();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    return texture;
}

function getGridTexture() {
    if (!sharedGridTexture) sharedGridTexture = markShared(createGridTexture());
    return sharedGridTexture;
}

function getMaterials() {
    if (sharedMaterials) return sharedMaterials;

    const gridTexture = getGridTexture();
    sharedMaterials = {
        road: new THREE.MeshLambertMaterial({
            color: 0xffffff,
            map: gridTexture,
            emissive: 0x2a1150,
            emissiveMap: gridTexture,
            emissiveIntensity: 0.68,
        }),
        lane: new THREE.MeshBasicMaterial({ color: 0x53e7ff }),
        guide: new THREE.MeshBasicMaterial({ color: 0xff3fa4 }),
        pillar: new THREE.MeshBasicMaterial({ color: 0x4ff0e0 }),
    };

    Object.values(sharedMaterials).forEach(markShared);
    return sharedMaterials;
}

function getGeometries(width, length) {
    const key = `${width}x${length}`;
    const cached = sharedGeometries.get(key);
    if (cached) return cached;

    const geometries = {
        road: new THREE.BoxGeometry(width, 0.3, length),
        lane: new THREE.BoxGeometry(0.14, 0.025, length * 0.88),
        rail: new THREE.BoxGeometry(0.28, 0.28, length * 0.92),
        pillar: new THREE.BoxGeometry(0.42, 1.65, 0.42),
    };

    Object.values(geometries).forEach(markShared);
    sharedGeometries.set(key, geometries);
    return geometries;
}

/**
 * Releases every GPU resource shared by track segments. Call this only after all
 * segments have left the scene, during application teardown.
 */
export function disposeTrackSegmentResources() {
    sharedGeometries.forEach((geometries) => {
        Object.values(geometries).forEach((geometry) => geometry.dispose());
    });
    sharedGeometries.clear();

    if (sharedMaterials) {
        Object.values(sharedMaterials).forEach((material) => material.dispose());
        sharedMaterials = null;
    }

    if (sharedGridTexture) {
        sharedGridTexture.dispose();
        sharedGridTexture = null;
    }
}

export class TrackSegment extends THREE.Group {
    constructor({ length = 24, width = 32 } = {}) {
        super();

        this.length = length;
        this.width = width;
        this.name = 'TrackSegment';
        this.#buildSegment();
    }

    #buildSegment() {
        const materials = getMaterials();
        const geometries = getGeometries(this.width, this.length);

        const road = new THREE.Mesh(geometries.road, materials.road);
        road.position.y = -0.2;
        this.add(road);

        for (const x of [-5.4, 5.4]) {
            const laneGuide = new THREE.Mesh(geometries.lane, materials.lane);
            laneGuide.position.set(x, -0.035, 0);
            this.add(laneGuide);
        }

        for (const side of [-1, 1]) {
            const guideRail = new THREE.Mesh(geometries.rail, materials.guide);
            guideRail.position.set(side * (this.width * 0.5 + 0.35), 0.72, 0);
            this.add(guideRail);
        }

        for (const side of [-1, 1]) {
            for (const z of [-this.length * 0.32, this.length * 0.32]) {
                const pillar = new THREE.Mesh(geometries.pillar, materials.pillar);
                pillar.position.set(side * (this.width * 0.5 + 0.35), 0.05, z);
                this.add(pillar);
            }
        }
    }
}
