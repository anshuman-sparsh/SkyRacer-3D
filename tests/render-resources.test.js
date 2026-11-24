import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { TrackSegment, disposeTrackSegmentResources } from '../src/entities/TrackSegment.js';
import { TrackManager } from '../src/managers/TrackManager.js';
import { createDailyRandom } from '../src/utils/DailyChallenge.js';
import { disposeObject3D, markShared } from '../src/utils/Memory.js';

function canvasStub(t) {
    const before=globalThis.document;
    globalThis.document={createElement:()=>({getContext:()=>({fillRect(){},beginPath(){},moveTo(){},lineTo(){},stroke(){}})})};
    t.after(()=>{disposeTrackSegmentResources();globalThis.document=before;});
}

test('track furniture uses seven batches with original transforms, shapes and triangle count',t=>{
    canvasStub(t);const segment=new TrackSegment();t.after(()=>disposeObject3D(segment));
    const meshes=[];segment.traverse(object=>{if(object.isMesh)meshes.push(object);});
    assert.equal(meshes.length,7);
    const triangles=meshes.reduce((sum,m)=>sum+m.geometry.index.count/3*(m.isInstancedMesh?m.count:1),0);
    assert.equal(triangles,396);
    const expected={LaneGuides:[[-5.4,-.035,0],[5.4,-.035,0]],GuideRails:[[-16.35,.72,0],[16.35,.72,0]],
        RailPillars:[[-16.35,.05,-7.68],[-16.35,.05,7.68],[16.35,.05,-7.68],[16.35,.05,7.68]]};
    for(const [name,positions] of Object.entries(expected)) {
        const mesh=segment.getObjectByName(name);assert.equal(mesh.count,positions.length);
        positions.forEach((values,index)=>{
            const matrix=new THREE.Matrix4();mesh.getMatrixAt(index,matrix);
            const pos=new THREE.Vector3().setFromMatrixPosition(matrix);
            values.forEach((v,axis)=>assert.ok(Math.abs(pos.getComponent(axis)-v)<1e-5));
        });
        assert.ok(mesh.boundingSphere.radius>0);
    }
});

test('teardown releases instance buffers while leaving shared geometry/material ownership intact',()=>{
    const geometry=markShared(new THREE.BoxGeometry()),material=markShared(new THREE.MeshBasicMaterial());
    const mesh=new THREE.InstancedMesh(geometry,material,2);let instance=0,geometries=0,materials=0;
    mesh.addEventListener('dispose',()=>instance++);geometry.addEventListener('dispose',()=>geometries++);material.addEventListener('dispose',()=>materials++);
    disposeObject3D(mesh);assert.equal(instance,1);assert.equal(geometries,0);assert.equal(materials,0);
    geometry.dispose();material.dispose();
});

test('repeated seeded restarts reuse bounded pools and GPU resource identities',t=>{
    canvasStub(t);const track=new TrackManager(new THREE.Scene(),{random:createDailyRandom('2026-11-10',3)});
    t.after(()=>track.destroy());
    function inventory() {
        const objects=new Set([...track.segments,...track.segmentPool,...track.energyRings,...track.energyRingPool,
            ...track.surgeRingPool,...track.blackRings,...track.blackRingPool,...track.obstacles,...track.obstaclePool]);
        const geometries=new Set(),materials=new Set();
        for(const object of objects)object.traverse(child=>{if(child.geometry)geometries.add(child.geometry);if(child.material)materials.add(child.material);});
        return {objects,geometries,materials};
    }
    track.reset({random:createDailyRandom('2026-11-10',3)});const baseline=inventory();
    for(let i=0;i<30;i++)track.reset({random:createDailyRandom('2026-11-10',3)});
    const after=inventory();assert.deepEqual(after,baseline);
});
