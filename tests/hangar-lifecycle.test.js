import test from 'node:test';
import assert from 'node:assert/strict';
import { LazyHangarPreview } from '../src/hangar/LazyHangarPreview.js';
import { HangarPreview } from '../src/hangar/HangarPreview.js';
import { isShared } from '../src/utils/Memory.js';
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
function host() {
    const listeners=new Map(),classes=new Set();return {listeners,clientWidth:400,clientHeight:240,
        classList:{add:x=>classes.add(x),remove:x=>classes.delete(x)},appendChild(){},
        addEventListener:(n,fn)=>listeners.set(n,fn),removeEventListener:n=>listeners.delete(n),
        setPointerCapture(){},hasPointerCapture:()=>false};
}

test('closing/disposal before lazy import settles never creates a WebGL preview',async()=>{
    for(const disposed of [false,true]) {
        const loading=deferred();let creations=0;
        const preview=new LazyHangarPreview(host(),()=>loading.promise);
        const pending=preview.open('silver-arrow');if(disposed)preview.dispose();else preview.close();
        loading.resolve({HangarPreview:class{constructor(){creations++;}open(){}}});await pending;
        assert.equal(creations,0);
    }
});

test('rapid lazy opens create one viewer with latest selection and recover from failed chunks',async()=>{
    const loading=deferred();let loads=0,creations=0;const selected=[];
    const preview=new LazyHangarPreview(host(),()=>{loads++;return loading.promise;});
    const first=preview.open('cyan-striker'),second=preview.open('ember-striker');preview.setAircraft('silver-arrow');
    loading.resolve({HangarPreview:class{constructor(){creations++;}open(id){selected.push(id);}setAircraft(){}close(){}dispose(){}}});
    await Promise.all([first,second]);assert.equal(loads,1);assert.equal(creations,1);assert.deepEqual(selected,['silver-arrow']);
    preview.dispose();
    let attempts=0;const retry=new LazyHangarPreview(host(),async()=>{if(++attempts===1)throw Error('offline');return {HangarPreview:class{open(){}close(){}}};});
    await retry.open('cyan-striker');await retry.open('cyan-striker');assert.equal(attempts,2);retry.close();
});

test('preview caps idle rendering, updates drag promptly, resizes once and disposes every context/resource',t=>{
    const before={window:globalThis.window,document:globalThis.document,raf:globalThis.requestAnimationFrame,cancel:globalThis.cancelAnimationFrame};
    const globalListeners=new Map(),queue=new Map();let frameId=0,active=0,rendered=0,buffers=0,createdGeometry=0,disposedGeometry=0,disconnects=0;
    globalThis.window={devicePixelRatio:2,addEventListener:(n,f)=>globalListeners.set(n,f),removeEventListener:n=>globalListeners.delete(n)};
    globalThis.document={hidden:false};
    globalThis.requestAnimationFrame=fn=>{queue.set(++frameId,fn);return frameId;};globalThis.cancelAnimationFrame=id=>queue.delete(id);
    const surface=host();
    const preview=new HangarPreview(surface,{getQuality:()=>({maxPixelRatio:1.5}),
        observe:class{observe(){}disconnect(){disconnects++;}},createRenderer:()=>{
            active++;assert.equal(active,1);
            return {domElement:{remove(){}},setDrawingBufferSize(){buffers++;},render(){rendered++;},dispose(){active--;},forceContextLoss(){}};
        }});
    t.after(()=>{preview.dispose();Object.assign(globalThis,{window:before.window,document:before.document,
        requestAnimationFrame:before.raf,cancelAnimationFrame:before.cancel});});
    const tick=time=>{const [id,fn]=queue.entries().next().value;queue.delete(id);fn(time);};
    for(let cycle=0;cycle<8;cycle++) {
        preview.open('cyan-striker');const unique=new Set();
        preview.craft.traverse(object=>{if(object.geometry&&!isShared(object.geometry))unique.add(object.geometry);});
        for(const geometry of unique){createdGeometry++;geometry.addEventListener('dispose',()=>disposedGeometry++);}
        preview.resize();assert.equal(buffers,cycle+1,'unchanged sizes do not reallocate');
        if(cycle===0) {
            tick(100);tick(116);tick(134);assert.equal(rendered,2);
            surface.listeners.get('pointerdown')({pointerId:1,pointerType:'touch',clientX:20});
            tick(140);assert.equal(rendered,3);
            surface.listeners.get('lostpointercapture')({pointerId:1});assert.equal(preview.dragging,false);
        }
        preview.close();assert.equal(active,0);assert.equal(queue.size,0);assert.equal(preview.scene,null);assert.equal(preview.craft,null);
    }
    assert.equal(createdGeometry,disposedGeometry);
    preview.dispose();assert.equal(globalListeners.size,0);assert.equal(surface.listeners.size,0);assert.equal(disconnects,1);
});
