// CPU scene-graph inventory, not GPU draw-call/FPS measurement. No browser used.
import { execFileSync } from 'node:child_process';
import { disposeObject3D } from '../src/utils/Memory.js';

const reference = process.argv[2];
let trackModule;
if (reference) {
    let source = execFileSync('git', ['show', `${reference}:src/entities/TrackSegment.js`], { encoding: 'utf8' });
    source = source.replace("'three'", JSON.stringify(import.meta.resolve('three')))
        .replace("'../utils/Memory.js'", JSON.stringify(new URL('../src/utils/Memory.js', import.meta.url).href))
        .replace("'../utils/SceneryLayout.js'", JSON.stringify(new URL('../src/utils/SceneryLayout.js', import.meta.url).href));
    trackModule = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
} else trackModule = await import('../src/entities/TrackSegment.js');
const previousDocument = globalThis.document;
globalThis.document = { createElement: () => ({ getContext: () => ({
    fillRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {},
}) }) };
try {
    for (const reducedScenery of [false, true]) {
        const segment = new trackModule.TrackSegment({ reducedScenery });
        let batches = 0, triangles = 0;
        const geometries = new Set(), materials = new Set();
        segment.traverse(object => {
            if (!object.isMesh) return;
            batches++;
            geometries.add(object.geometry); materials.add(object.material);
            triangles += ((object.geometry.index?.count ?? object.geometry.attributes.position.count) / 3)
                * (object.isInstancedMesh ? object.count : 1);
        });
        console.log(JSON.stringify({ reference: reference ?? 'working-tree', reducedScenery,
            batches, triangles, geometries: geometries.size, materials: materials.size }));
        disposeObject3D(segment);
    }
} finally {
    trackModule.disposeTrackSegmentResources();
    globalThis.document = previousDocument;
}
