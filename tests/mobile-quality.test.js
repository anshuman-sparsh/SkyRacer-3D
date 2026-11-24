import test from 'node:test';
import assert from 'node:assert/strict';
import { qualityProfile, sizeRenderer } from '../src/core/QualityProfile.js';
import { CameraDynamics, createCamera } from '../src/core/Camera.js';

test('quality defaults are bounded and missing capability hints never imply a weak desktop',()=>{
    const q=qualityProfile({width:1920,height:1080,dpr:3});
    assert.equal(q.maxPixelRatio,1.5);assert.equal(q.pixelRatio,1.5);assert.equal(q.speedParticles,180);
    assert.equal(q.reducedScenery,false);
    assert.equal(qualityProfile({width:1920,height:1080,dpr:NaN}).pixelRatio,1);
});

test('touch/tablet and constrained devices limit decorative work without gameplay parameters',()=>{
    for(const hints of [{touch:true},{deviceMemory:4},{hardwareConcurrency:4}]) {
        const q=qualityProfile({width:1024,height:1366,dpr:3,...hints});
        assert.equal(q.maxPixelRatio,1);assert.equal(q.reducedScenery,true);
        assert.ok(q.speedParticles>=120 && q.speedParticles<=150);
        assert.doesNotMatch(Object.keys(q).join(','),/physics|speedLimit|collision|course/);
    }
});

test('large viewport budgets bound buffer pixels and remain stable across orientation',()=>{
    for(const touch of [true,false]) {
        const a=qualityProfile({width:3840,height:2160,dpr:4,touch});
        const b=qualityProfile({width:2160,height:3840,dpr:4,touch});
        assert.equal(a.pixelRatio,b.pixelRatio);
        assert.ok(3840*2160*a.pixelRatio**2<=a.pixelBudget+1);
        assert.ok(a.pixelRatio>0 && a.pixelRatio<=1.5);
    }
});

test('duplicate resize events cause no buffer allocation and DPR changes resize atomically once',()=>{
    const calls=[];const renderer={setDrawingBufferSize:(...args)=>calls.push(args)};
    assert.equal(sizeRenderer(renderer,640,360,1),true);
    assert.equal(sizeRenderer(renderer,640,360,1),false);
    assert.equal(sizeRenderer(renderer,360,640,1),true);
    assert.equal(sizeRenderer(renderer,360,640,.8),true);
    assert.deepEqual(calls,[[640,360,1],[360,640,1],[360,640,.8]]);
    sizeRenderer(renderer,0,NaN,1);assert.deepEqual(calls.at(-1),[1,1,1]);
});

test('reference sizes and orientation retain finite camera projection and expected aspect',()=>{
    const camera=createCamera(16/9),dynamics=new CameraDynamics(camera);
    for(const [width,height] of [[640,360],[836,470],[1031,580],[390,844],[844,390],[1024,1366]]) {
        dynamics.resize(width/height);assert.equal(camera.aspect,width/height);
        assert.ok(camera.projectionMatrix.elements.every(Number.isFinite));
    }
});
