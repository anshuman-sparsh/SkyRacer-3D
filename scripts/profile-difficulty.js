import * as THREE from 'three';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { TrackManager } from '../src/managers/TrackManager.js';
import { createDailyRandom } from '../src/utils/DailyChallenge.js';
import { disposeTrackSegmentResources } from '../src/entities/TrackSegment.js';

/** Ghost traversal at unchanged base cruise speed, not a human playthrough. */
export function traceCourse(Manager = TrackManager, date = '2026-11-11', observe = () => {}) {
    const previousDocument = globalThis.document;
    globalThis.document = { createElement: () => ({ getContext: () => ({ fillRect(){}, beginPath(){}, moveTo(){}, lineTo(){}, stroke(){} }) }) };
    let track;
    try {
        track = new Manager(new THREE.Scene(), { random: createDailyRandom(date), reducedScenery: true });
        const objects = new Map(), checkpoints = [];
        const craft = { position: new THREE.Vector3(1000,1000,0), isSpinningOut: true, refreshBounds: () => new THREE.Box3() };
        for (let seconds = 0; seconds <= 180; seconds++) {
            craft.position.z = -28 * seconds;
            track.update(1,craft);
            for (const [type, entries] of [['blue',track.energyRings],['hazard',track.blackRings],['barrier',track.obstacles]]) {
                for (const object of entries) {
                    const kind = type === 'blue' && object.isSurge ? 'pink' : type;
                    const row = [kind,...object.position.toArray().map(value => Number(value.toFixed(6)))];
                    objects.set(JSON.stringify(row),row);
                }
            }
            observe(seconds,track);
            if ([30,60,120,180].includes(seconds)) {
                const rows = [...objects.values()];
                checkpoints.push({ seconds, collectibles: rows.filter(row=>row[0]==='blue'||row[0]==='pink').length,
                    pink: rows.filter(row=>row[0]==='pink').length, hazards: rows.filter(row=>row[0]==='hazard').length,
                    barriers: rows.filter(row=>row[0]==='barrier').length });
            }
        }
        return { date, checkpoints, layoutHash: createHash('sha256').update(JSON.stringify([...objects.values()])).digest('hex') };
    } finally {
        track?.destroy();disposeTrackSegmentResources();globalThis.document = previousDocument;
    }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    let Manager = TrackManager;
    const reference = process.argv[2];
    if (reference) {
        const root = resolve(dirname(fileURLToPath(import.meta.url)),'..');
        let source = execFileSync('git',['show',`${reference}:src/managers/TrackManager.js`],{cwd:root,encoding:'utf8'});
        source = source.replace(/from '(\.\.?\/[^']+)'/g,(_,path)=>`from '${pathToFileURL(resolve(root,'src/managers',path)).href}'`)
            .replace("from 'three'",`from '${import.meta.resolve('three')}'`);
        ({TrackManager:Manager} = await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64')));
    }
    for (const date of ['2026-11-11','2026-11-12','2026-12-01']) console.log(JSON.stringify({ reference:reference??'working-tree',...traceCourse(Manager,date) }));
}
