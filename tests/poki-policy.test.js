import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildPolicy, pokiHtml } from '../src/platform/BuildPolicy.js';
import { usesTouchControls, installScrollGuard } from '../src/platform/DeviceSupport.js';
import { InputManager } from '../src/managers/InputManager.js';
import { AudioEngine } from '../src/utils/AudioEngine.js';
import { LeaderboardService } from '../src/services/LeaderboardService.js';

test('build policy defaults to offline Poki despite web credentials and runtime URL flags',()=>{
    const credentials={VITE_SUPABASE_URL:'https://example.supabase.co',VITE_SUPABASE_PUBLISHABLE_KEY:'public'};
    assert.equal(buildPolicy('poki',credentials).localOnly,true);
    assert.equal(buildPolicy('production',{...credentials,POKI_ONLINE_APPROVED:'true'}).poki,false);
    assert.throws(()=>buildPolicy('poki',{...credentials,POKI_ONLINE_APPROVED:'true'}));
    assert.equal(buildPolicy('poki',{...credentials,POKI_ONLINE_APPROVED:'true',
        POKI_PRIVACY_POLICY_URL:'https://example.org/privacy',POKI_CSP_APPROVAL_REFERENCE:'owner-reference'}).online,true);
});

test('only Poki HTML loads SDK, removes font requests, and namespaces initial theme read',()=>{
    const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
    assert.equal(pokiHtml(html,buildPolicy('production')),html);
    assert.doesNotMatch(html,/game-cdn\.poki\.com/);
    const transformed=pokiHtml(html,buildPolicy('poki'));
    assert.match(transformed,/data-platform="poki"/);
    assert.match(transformed,/scripts\/v2\/poki-sdk\.js/);
    assert.doesNotMatch(transformed,/fonts\.google|fonts\.gstatic/);
    assert.match(transformed,/skyracer_poki_v1:skyracer_theme_v2/);
    assert.doesNotMatch(transformed,/href="\/Skyracer/);
});

test('tablets and hybrid touch devices get mobile controls, desktop retains keyboard',()=>{
    const win=matches=>({matchMedia:q=>({matches:matches.includes(q)})});
    assert.equal(usesTouchControls(win([]),{maxTouchPoints:0}),false);
    assert.equal(usesTouchControls(win(['(pointer: coarse)'])),true);
    assert.equal(usesTouchControls(win([]),{platform:'MacIntel',maxTouchPoints:5}),true);
    assert.equal(usesTouchControls(win([]),{userAgent:'Android Tablet',maxTouchPoints:5}),true);
    assert.equal(usesTouchControls(win(['(any-pointer: coarse)']),{maxTouchPoints:2}),true);
});

test('Poki wheel guard prevents parent scroll while native dialog scrolling remains possible',()=>{
    const listeners=new Map();const win={addEventListener:(n,fn)=>listeners.set(n,fn),removeEventListener:n=>listeners.delete(n)};
    const dispose=installScrollGuard(win);let canceled=0;
    listeners.get('wheel')({target:{closest:()=>null},preventDefault(){canceled++;}});
    listeners.get('wheel')({target:{closest:()=>({})},preventDefault(){canceled++;}});
    assert.equal(canceled,1);dispose();assert.equal(listeners.size,0);
});

test('ad input lock resets held keys/touch and ignores new keyboard and boost pointers',()=>{
    const prior=globalThis.window;const events=new Map(),boostEvents=new Map(),touchEvents=new Map();
    const win={addEventListener:(n,fn)=>events.set(n,fn),removeEventListener:n=>events.delete(n)};
    const surface={addEventListener:(n,fn)=>touchEvents.set(n,fn),removeEventListener:n=>touchEvents.delete(n)};
    const boost={addEventListener:(n,fn)=>boostEvents.set(n,fn),removeEventListener:n=>boostEvents.delete(n),
        classList:{add(){},remove(){}}};
    globalThis.window=win;let input;
    try {
        input=new InputManager(win,{touchSurface:surface,boostButton:boost});
        events.get('keydown')({code:'KeyW',target:{closest:()=>null},preventDefault(){}});
        assert.equal(input.state.moveUp,true);input.setEnabled(false);
        events.get('keydown')({code:'Space',preventDefault(){throw Error('Ad intercepted');}});
        boostEvents.get('pointerdown')({pointerType:'touch',pointerId:3});
        touchEvents.get('pointerdown')({pointerType:'touch',pointerId:4});
        assert.equal(input.state.moveUp,false);assert.equal(input.state.boost,false);assert.equal(input.controlPointerId,null);
        input.setEnabled(true);
        events.get('keydown')({code:'Space',target:{closest:()=>null},preventDefault(){}});
        assert.equal(input.state.boost,true);
    } finally {input?.destroy();globalThis.window=prior;}
});

test('ad audio lock silences all sources immediately without changing Audio On/Off preference',()=>{
    const values=[];const audio=new AudioEngine();
    audio.context={currentTime:2};audio.masterGain={gain:{cancelScheduledValues(){},
        setValueAtTime:v=>values.push(v),setTargetAtTime:v=>values.push(v)}};
    audio.setAdMuted(true);assert.equal(audio.muted,false);assert.equal(values.at(-1),0);
    audio.playRingChime();audio.playBoost(); // No source creation during ads.
    audio.setAdMuted(false);assert.equal(values.at(-1),.75);
    audio.setMuted(true);audio.setAdMuted(true);audio.setAdMuted(false);
    assert.equal(audio.muted,true);assert.equal(values.at(-1),0);
});

test('approved online transport can explicitly disable same-origin country attribution',async()=>{
    const calls=[];
    const session={access_token:'test',refresh_token:'test',expires_at:Date.now()/1000+3600};
    const service=new LeaderboardService({url:'https://example.supabase.co',publishableKey:'public',
        countryEnabled:false,storage:{getItem:key=>key.includes('session')?JSON.stringify(session):null,setItem(){}},
        fetchImpl:async(url)=>{calls.push(url);return {ok:true,status:200,json:async()=>({accepted:true})};}});
    await service.finishRun({runId:'test',nickname:'Pilot',score:100,rings:0,distance:10});
    assert.equal(calls.length,1);assert.ok(calls[0].endsWith('/functions/v1/leaderboard'));
});
