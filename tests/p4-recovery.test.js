import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { WebGLRecovery } from '../src/core/WebGLRecovery.js';
import { PokiAdapter } from '../src/platform/PokiAdapter.js';
import { LocalProgress } from '../src/platform/LocalProgress.js';
const source=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');

test('GPU loss is cancellable, idempotent and restores only once; dispose removes both listeners',()=>{
    const canvas=new EventTarget();let losses=0,restores=0;
    const recovery=new WebGLRecovery(canvas,{onLost:()=>losses++,onRestored:()=>restores++});
    canvas.dispatchEvent(new Event('webglcontextrestored'));assert.equal(restores,0);
    const lost=new Event('webglcontextlost',{cancelable:true});canvas.dispatchEvent(lost);
    assert.equal(lost.defaultPrevented,true);assert.equal(recovery.lost,true);
    canvas.dispatchEvent(new Event('webglcontextlost',{cancelable:true}));assert.equal(losses,1);
    canvas.dispatchEvent(new Event('webglcontextrestored'));assert.equal(recovery.lost,false);assert.equal(restores,1);
    recovery.dispose();canvas.dispatchEvent(new Event('webglcontextlost',{cancelable:true}));assert.equal(losses,1);
});

test('real recovery wiring pauses/saves the flight and cancels pending launches; restoration never auto-starts SDK',async()=>{
    const events=[],canvas=new EventTarget(),status={hidden:true};let resets=0,saves=0,closed=0,resizes=0;
    const platform=new PokiAdapter({sdk:{init:async()=>{},gameLoadingFinished(){},gameplayStart:()=>events.push('start'),gameplayStop:()=>events.push('stop')}});
    await platform.init();platform.loadingFinished();platform.transition('running');
    const c={WebGLRecovery,renderer:{domElement:canvas},platform,gameState:'running',launchGeneration:0,
        document:{hidden:false,querySelector:()=>status},inputManager:{reset(){resets++;}},audioEngine:{setPaused:paused=>assert.equal(paused,true)},
        scoreManager:{persistRecords(){saves++;}},hangarPanel:{dialog:{open:false},viewer:{close(){closed++;}}},
        clock:{getDelta(){}},handleResize(){resizes++;},setGameState(state){c.gameState=state;platform.transition(state);}};
    const suspend=source.slice(source.indexOf('function suspendForBackground()'),source.indexOf('\nfunction handlePageHide('));
    const setup=source.slice(source.indexOf('const renderRecovery = new WebGLRecovery('),source.indexOf("\nsetGameState('start');",source.indexOf('const renderRecovery = new WebGLRecovery(')));
    vm.createContext(c);vm.runInContext(suspend+setup,c);
    canvas.dispatchEvent(new Event('webglcontextlost',{cancelable:true}));
    assert.equal(c.gameState,'paused');assert.equal(status.hidden,false);assert.equal(c.launchGeneration,1);
    assert.equal(resets,1);assert.equal(saves,1);assert.equal(closed,1);
    canvas.dispatchEvent(new Event('webglcontextrestored'));
    assert.deepEqual(events,['start','stop']);assert.equal(c.gameState,'paused');assert.equal(status.hidden,true);assert.equal(resizes,1);
    vm.runInContext('renderRecovery.dispose()',c);
});

test('actual frame loop does no physics or rendering while context is lost',()=>{
    let queued=0;
    const c={clock:{getDelta:()=>.016},appDisposed:false,document:{hidden:false},platform:{blocked:false},hangarPanel:{dialog:{open:false}},
        renderRecovery:{lost:true},requestAnimationFrame:()=>++queued,
        inputManager:{update(){throw Error('Updated while graphics lost');}},renderer:{render(){throw Error('Rendered while lost');}}};
    vm.createContext(c);vm.runInContext(source.slice(source.indexOf('function animate('),source.indexOf('\nfunction resizeViewport()')),c);
    c.animate(0);assert.equal(queued,1);
});

test('a corrupt array-shaped Daily map cannot silently discard future saves',()=>{
    const values=new Map([['local_progress_v1',JSON.stringify({daily:[],totalRings:100,totalDistance:200,verifiedRuns:2})]]);
    const storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)},progress=new LocalProgress(storage);
    progress.finishDaily(progress.beginDaily(),{score:500});
    const reloaded=new LocalProgress(storage);assert.equal(reloaded.today().me.score,500);
    assert.equal(reloaded.snapshot().totalRings,100);assert.equal(reloaded.snapshot().verifiedRuns,2);
    assert.equal(reloaded.snapshot().unlockedIds.includes('apex-overdrive'),false);
});

test('late Daily responses cannot replace a newer attempt best or error; accepted progression still refreshes',async()=>{
    const submit=source.slice(source.indexOf('async function submitDailyScore('),source.indexOf('\nfunction beginOnlineRun()'));
    for(const fail of [false,true]) {
        let settle,refreshes=0;
        const response=new Promise((resolve,reject)=>settle=fail?reject:resolve);
        const old={submitted:false,runId:'old'},next={submitted:false,runId:'next'};
        const c={dailySubmitting:false,gameMode:'daily',gameState:'terminated',activeDailyRun:old,dailyPersonalBest:50,dailyLastError:'',
            scoreManager:{currentScore:100,ringsCollected:2,distance:0},dailyService:{finish:()=>response},
            hangarPanel:{refreshProgress(){refreshes++;}},dailyPanel:{dialog:{open:false}},updateModeDisplays(){}};
        vm.createContext(c);vm.runInContext(submit,c);const pending=c.submitDailyScore('Pilot');
        c.activeDailyRun=next;c.dailyPersonalBest=200;c.dailyLastError='new attempt message';
        settle(fail?Error('old failure'):{personalBest:900});
        if(fail)await assert.rejects(pending,/old failure/);else await pending;
        assert.equal(c.dailyPersonalBest,200);assert.equal(c.dailyLastError,'new attempt message');
        assert.equal(refreshes,fail?0:1);assert.equal(c.dailySubmitting,false);
    }
});

test('Daily auto-submit error handler is also bound to the finished attempt',async()=>{
    const start=source.indexOf("    if (isTerminated && gameMode === 'daily' && activeDailyRun");
    const block=source.slice(start,source.indexOf('    if (!isRunning) {',start));
    let reject;const response=new Promise((_,failure)=>reject=failure);
    const old={nickname:'Pilot',submitted:false};
    const c={isTerminated:true,gameMode:'daily',activeDailyRun:old,scoreManager:{currentScore:100},
        submitDailyScore:()=>response,dailyLastError:'',updateModeDisplays(){throw Error('Stale UI updated');}};
    vm.createContext(c);vm.runInContext(block,c);c.activeDailyRun={nickname:'Pilot',submitted:false};
    reject(Error('old failure'));await response.catch(()=>{});await Promise.resolve();assert.equal(c.dailyLastError,'');
});
