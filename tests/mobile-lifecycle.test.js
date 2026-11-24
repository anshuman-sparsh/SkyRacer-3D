import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { PokiAdapter } from '../src/platform/PokiAdapter.js';
const source=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const frame=source.slice(source.indexOf('function animate('),source.indexOf('\nfunction resizeViewport()'));

test('fullscreen Hangar skips background rendering; standard paused scene renders at most 10 Hz',()=>{
    let renders=0,input=0,scheduled=0;
    const c={clock:{getDelta:()=>.016},document:{hidden:false},platform:{blocked:false},appDisposed:false,
        gameState:'paused',hangarPanel:{dialog:{open:true}},renderRecovery:{lost:false},lastIdleFrameAt:-Infinity,
        requestAnimationFrame:()=>++scheduled,inputManager:{update(){input++;}},scene:{},camera:{},
        renderer:{render(){renders++;}},updateTrackLightResponse(){},collisionDebug:null};
    vm.createContext(c);vm.runInContext(frame,c);c.animate(0);assert.equal(renders,0);assert.equal(input,0);
    c.hangarPanel.dialog.open=false;c.animate(0);c.animate(16);c.animate(99);c.animate(100);
    assert.equal(renders,2);assert.equal(input,2);assert.equal(scheduled,5);
    c.appDisposed=true;c.animate(116);assert.equal(scheduled,5,'disposed app queues no further work');
});

test('BFCache background/restoration keeps the app alive and paused with one SDK stop',async()=>{
    const events=[];const platform=new PokiAdapter({sdk:{init:async()=>{},gameLoadingFinished(){},
        gameplayStart:()=>events.push('start'),gameplayStop:()=>events.push('stop')}});
    await platform.init();platform.loadingFinished();platform.transition('running');
    let disposed=0,reset=0,persisted=0,closed=0;
    const c={document:{hidden:false},gameState:'running',launchGeneration:0,appDisposed:false,platform,
        inputManager:{reset(){reset++;}},audioEngine:{setPaused(){}},scoreManager:{persistRecords(){persisted++;}},
        hangarPanel:{dialog:{open:false},viewer:{close(){closed++;},open(){}}},clock:{getDelta(){}},handleResize(){},
        setGameState(state){c.gameState=state;platform.transition(state);},disposeApp(){disposed++;c.appDisposed=true;}};
    const lifecycle=source.slice(source.indexOf('function handleVisibilityChange()'),source.indexOf('\nfunction pauseForMenu()'));
    vm.createContext(c);vm.runInContext(lifecycle,c);
    c.handlePageHide({persisted:true});assert.equal(disposed,0);assert.equal(c.gameState,'paused');
    c.handlePageShow({persisted:true});assert.deepEqual(events,['start','stop']);
    assert.equal(reset,1);assert.equal(persisted,1);assert.equal(closed,1);
    c.handlePageHide({persisted:false});assert.equal(disposed,1);
});

test('viewport resize uses actual container aspect and cancels fingers only on orientation flips',()=>{
    const aspects=[];let cancel=0,previews=0;
    const c={container:{clientWidth:390,clientHeight:844},lastViewportAspect:390/844,
        inputManager:{cancelPointers(){cancel++;}},cameraDynamics:{resize:a=>aspects.push(a)},hovercraft:{},
        renderer:{},resizeRenderer(){},hangarPanel:{viewer:{resize(){previews++;}}}};
    const resize=source.slice(source.indexOf('function resizeViewport()'),source.indexOf('/** Coalesces mobile'));
    vm.createContext(c);vm.runInContext(resize,c);c.resizeViewport();
    c.container.clientHeight=800;c.resizeViewport();assert.equal(cancel,0);
    c.container.clientWidth=844;c.container.clientHeight=390;c.resizeViewport();assert.equal(cancel,1);
    assert.equal(aspects.at(-1),844/390);assert.equal(previews,3);assert.equal(c.terminalFrameDirty,true);
});

test('responsive controls preserve safe areas, large targets and native editable-field gestures',()=>{
    const css=readFileSync(new URL('../src/styles/racing-ui.css',import.meta.url),'utf8');
    assert.match(css,/\.help-close \{ min-width: 44px/);
    assert.match(css,/safe-area-inset-bottom/);assert.match(css,/safe-area-inset-left/);
    assert.match(css,/input, textarea, \[contenteditable="true"\].*user-select: text/);
    assert.match(css,/\.hangar-preview__canvas canvas \{ touch-action: pan-y/);
    assert.match(source,/viewportObserver\?\.observe\(container\)/);
    assert.match(source,/viewportObserver\?\.disconnect\(\)/);
    const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
    assert.doesNotMatch(html,/user-scalable=no|maximum-scale=1/);
});
