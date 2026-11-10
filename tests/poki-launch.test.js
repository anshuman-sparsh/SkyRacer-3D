import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { PokiAdapter } from '../src/platform/PokiAdapter.js';
import { createDailyRandom } from '../src/utils/DailyChallenge.js';
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const source=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const start=source.slice(source.indexOf('async function startRunning()'),source.indexOf('\nfunction togglePause()'));
async function harness({ad=async()=>{},audio=async()=>true}={}) {
    const events=[];
    const platform=new PokiAdapter({sdk:{init:async()=>{},gameLoadingFinished:()=>events.push('loaded'),
        gameplayStart:()=>events.push('start'),gameplayStop:()=>events.push('stop'),commercialBreak:()=>{events.push('ad');return ad();}}});
    await platform.init(); platform.loadingFinished();
    const closed=()=>({dialog:{open:false}});
    const audioEngine={paused:true,start:audio,setPaused(value){this.paused=value;}};
    const c={platform,isPoki:true,document:{hidden:false,activeElement:null},startTransitionPending:false,
        gameState:'start',gameMode:'classic',appDisposed:false,friendStartPending:false,launchGeneration:0,
        helpDialog:{open:false},leaderboardDialog:{open:false},hangarPanel:closed(),quickMenu:{opened:false},
        dailyPanel:closed(),friendPanel:closed(),audioEngine,
        aircraftSelection:{activeId:'cyan-striker',ownedIds:['cyan-striker','ember-striker']},
        eliteAbilityFor:()=>({}),hovercraft:{setAppearance(){},reset(){}},clock:{getDelta(){}},
        analytics:{trackRunStart(){}},beginOnlineRun(){},updateModeDisplays(){},console,
        setLaunchPending(){},scoreManager:{getHighScore:()=>0,reset(){}},
        ringGuidance:{hide(){}},ringCollectionDeadline:{reset(){}},trackManager:{reset(){}},
        cameraDynamics:{snapTo(){}},updateHud(){},flightCoach:{beginFlight(){}},flightMilestones:{beginFlight(){}},
        setGameState(state){c.gameState=state;platform.transition(state);audioEngine.setPaused(state!=='running');},
    };
    vm.createContext(c); vm.runInContext(start,c);
    return {c,events};
}

test('real launch function serializes rapid restart/resume calls and waits for ad completion',async()=>{
    const ad=deferred(); const {c,events}=await harness({ad:()=>ad.promise});
    assert.equal(await c.startRunning(),true);
    c.setGameState('terminated'); const restart=c.startRunning();
    for(let i=0;i<15;i++) assert.equal(await c.startRunning(),false);
    assert.equal(c.gameState,'terminated'); assert.equal(c.platform.blocked,true);
    assert.equal(events.at(-1),'ad');
    ad.resolve(); assert.equal(await restart,true);
    assert.deepEqual(events,['loaded','start','stop','ad','start']);
});

test('real launch checks state and generation after late ads and audio initialization',async()=>{
    for(const kind of ['hidden','menu','replaced','disposed']) {
        const ad=deferred(); const {c,events}=await harness({ad:()=>ad.promise});
        await c.startRunning(); c.setGameState('paused'); const resume=c.startRunning();
        if(kind==='hidden') c.document.hidden=true;
        if(kind==='menu') {c.launchGeneration++; c.helpDialog.open=true;}
        if(kind==='replaced') c.gameMode='daily';
        if(kind==='disposed') c.appDisposed=true;
        ad.resolve(); assert.equal(await resume,false);
        assert.equal(c.gameState,'paused'); assert.equal(events.at(-1),'ad');
    }
    const audio=deferred(); const {c}=await harness({audio:()=>audio.promise});
    const pending=c.startRunning(); c.document.hidden=true; audio.resolve();
    assert.equal(await pending,false); assert.equal(c.audioEngine.paused,true);
});

test('no flight starts behind menus and audio initialization failure still permits play',async()=>{
    const {c}=await harness({audio:async()=>{throw Error('no audio device');}});
    c.quickMenu.opened=true; assert.equal(await c.startRunning(),false);
    c.quickMenu.opened=false; c.helpDialog.open=true; assert.equal(await c.startRunning(),false);
    c.helpDialog.open=false; assert.equal(await c.startRunning(),true);
});

test('a canceled ad retains launch ownership until delayed audio initialization settles',async()=>{
    const ad=deferred(),audio=deferred(); let starts=0;
    const {c}=await harness({ad:()=>ad.promise,audio:()=>++starts===1?Promise.resolve(true):audio.promise});
    await c.startRunning();c.setGameState('paused');
    const pending=c.startRunning();c.launchGeneration++;ad.resolve();
    await Promise.resolve();await Promise.resolve();
    assert.equal(c.startTransitionPending,true);
    assert.equal(await c.startRunning(),false);
    audio.resolve();assert.equal(await pending,false);
    assert.equal(c.audioEngine.paused,true);assert.equal(c.startTransitionPending,false);
});

test('actual frame loop cannot advance physics or render while an ad is pending or tab hidden',()=>{
    const animate=source.slice(source.indexOf('function animate('),source.indexOf('\nfunction resizeViewport()'));
    for(const flag of ['ad','hidden']) {
        let nextFrames=0;
        const c={clock:{getDelta:()=>.05},document:{hidden:flag==='hidden'},platform:{blocked:flag==='ad'},appDisposed:false,
            gameState:'terminated',isPoki:true,animationFrameId:0,
            requestAnimationFrame:()=>++nextFrames,
            inputManager:{update(){throw Error('Input advanced');}},
            hovercraft:{update(){throw Error('Physics advanced');}},renderer:{render(){throw Error('Rendered underneath ad');}}};
        vm.createContext(c);vm.runInContext(animate,c);c.animate(50);
        assert.equal(nextFrames,1);
    }
});

test('actual ad interaction lock targets game UI without touching SDK-owned overlays',()=>{
    const begin=source.indexOf('const gameUi =');
    const end=source.indexOf('\nif (isPoki)',begin);
    const gameRoot={inert:false},sdkOverlay={inert:false},input=[],audio=[];
    const c={isPoki:true,platform:{},document:{querySelector:selector=>{
        assert.equal(selector,'[data-game-ui]');return gameRoot;
    }},inputManager:{setEnabled:value=>input.push(value)},audioEngine:{setAdMuted:value=>audio.push(value)}};
    vm.createContext(c);vm.runInContext(source.slice(begin,end),c);
    c.platform.onBlocked(true);assert.equal(gameRoot.inert,true);assert.equal(sdkOverlay.inert,false);
    c.platform.onBlocked(false);assert.equal(gameRoot.inert,false);
    assert.deepEqual(input,[false,true]);assert.deepEqual(audio,[true,false]);
});

test('Fly Again keeps the completed result during an ad, then resets/registers once despite rapid taps',async()=>{
    const ad=deferred();const {c,events}=await harness({ad:()=>ad.promise});
    let resets=0,registrations=0;
    c.scoreManager={currentScore:400,getHighScore:()=>600,reset(){resets++;this.currentScore=0;}};
    c.beginOnlineRun=()=>registrations++;
    await c.startRunning();c.setGameState('terminated');
    vm.runInContext(source.slice(source.indexOf('function restartRun()'),source.indexOf('\nfunction handleGameKey')),c);
    const start=c.startRunning;let pending;c.startRunning=()=>pending=start();
    c.restartRun();for(let i=0;i<10;i++)c.restartRun();
    assert.equal(c.scoreManager.currentScore,400);assert.equal(resets,0);assert.equal(registrations,1);
    ad.resolve();assert.equal(await pending,true);
    assert.equal(resets,1);assert.equal(registrations,2);assert.equal(c.runBestBefore,600);
    assert.deepEqual(events,['loaded','start','stop','ad','start']);
});

test('a canceled replay cannot discard the completed score or rebuild its course',async()=>{
    const ad=deferred();const {c}=await harness({ad:()=>ad.promise});
    await c.startRunning();c.setGameState('terminated');
    c.scoreManager.currentScore=450;
    c.scoreManager.reset=()=>{throw Error('Canceled result reset');};
    c.trackManager.reset=()=>{throw Error('Canceled course rebuilt');};
    const pending=c.startRunning();c.launchGeneration++;ad.resolve();
    assert.equal(await pending,false);assert.equal(c.scoreManager.currentScore,450);
});

test('Daily retry resets once with the issued date/version and no intermediate random course',async()=>{
    const {c}=await harness();await c.startRunning();c.setGameState('terminated');
    c.gameMode='daily';c.activeDailyRun={runId:'old',date:'2026-11-10',courseVersion:3,submitted:true};
    c.dailyPersonalBest=600;c.dailyPanel.today={date:'2026-11-10'};
    c.wasBoosting=true;
    c.dailyService={begin:async()=>({runId:'fresh',date:'2026-11-10',courseVersion:3,submitted:false})};
    c.createDailyRandom=createDailyRandom;
    let layouts=0;
    c.trackManager.reset=({random})=>{
        layouts++;const expected=createDailyRandom('2026-11-10',3);
        for(let i=0;i<12;i++)assert.equal(random(),expected());
    };
    assert.equal(await c.startRunning(),true);assert.equal(layouts,1);
    assert.equal(c.activeDailyRun.runId,'fresh');assert.equal(c.runBestBefore,600);
    assert.equal(c.wasBoosting,false,'a new Daily flight resets the previous boost feedback state');
});

test('pending button presentation restores replay/resume labels after failed or canceled starts',()=>{
    const c={stateOverlay:{setAttribute(){}},startFlightButton:{},restartButton:{},gameState:'terminated'};
    const helper=source.slice(source.indexOf('function setLaunchPending('),source.indexOf('\nfunction updateFlightExperience('));
    vm.createContext(c);vm.runInContext(helper,c);
    c.setLaunchPending(true);assert.equal(c.restartButton.disabled,true);assert.match(c.restartButton.textContent,/PREPARING/);
    c.setLaunchPending(false);assert.equal(c.restartButton.disabled,false);assert.equal(c.restartButton.textContent,'FLY AGAIN');
    c.gameState='paused';c.setLaunchPending(false);assert.equal(c.startFlightButton.textContent,'RESUME FLIGHT');
});

test('settled game-over frames stop render/physics work but a resize can redraw once',()=>{
    const animate=source.slice(source.indexOf('function animate('),source.indexOf('\nfunction resizeViewport()'));
    let renders=0;
    const c={clock:{getDelta:()=>.016},document:{hidden:false},platform:{blocked:false},appDisposed:false,
        gameState:'terminated',isPoki:true,scene:{},camera:{},terminalAnimationSeconds:3,terminalFrameDirty:false,
        animationFrameId:0,requestAnimationFrame:()=>1,
        inputManager:{update(){throw Error('Idle input work');}},renderer:{render(){renders++;}}};
    vm.createContext(c);vm.runInContext(animate,c);c.animate(5000);assert.equal(renders,0);
    c.terminalFrameDirty=true;c.animate(5016);c.animate(5032);assert.equal(renders,1);
});
