import test from 'node:test';
import assert from 'node:assert/strict';
import { PokiAdapter, initializeSdk } from '../src/platform/PokiAdapter.js';
const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => {resolve=a;reject=b;}); return {promise,resolve,reject}; };
function fixture(commercial = async () => {}) {
    const events = [], locks = [];
    const sdk = { init: async () => events.push('init'),
        gameLoadingFinished: () => events.push('loaded'), gameplayStart: () => events.push('start'),
        gameplayStop: () => events.push('stop'), commercialBreak: callback => { events.push('ad'); callback?.(); return commercial(); } };
    return { events, locks, sdk, adapter: new PokiAdapter({ sdk, onBlocked: value => locks.push(value) }) };
}

test('SDK exact lifecycle: loading, first flight, death/ad/restart, pause/ad/resume, death', async () => {
    const {adapter:a,events,locks} = fixture();
    await a.init(); a.loadingFinished(); a.loadingFinished(); a.transition('start');
    assert.deepEqual(events, ['init','loaded']);
    assert.equal(await a.beforeGameplay(), true); a.transition('running'); a.transition('running');
    a.transition('terminated'); a.transition('terminated');
    assert.equal(await a.beforeGameplay(), true); a.transition('running');
    a.transition('paused'); a.transition('paused');
    assert.equal(await a.beforeGameplay(), true); a.transition('running'); a.transition('terminated');
    assert.deepEqual(events, ['init','loaded','start','stop','ad','start','stop','ad','start','stop']);
    assert.deepEqual(locks, [true,false,true,false]);
});

test('rapid resumes request one ad and emit no SDK events until completion', async () => {
    const ad = deferred();
    const {adapter:a,events} = fixture(() => ad.promise);
    await a.init(); a.loadingFinished(); a.transition('running'); a.transition('paused');
    const first = a.beforeGameplay();
    for (let i=0;i<20;i++) assert.equal(await a.beforeGameplay(), false);
    a.transition('running'); a.transition('paused'); a.loadingFinished();
    assert.equal(a.playing, false);
    assert.deepEqual(events, ['init','loaded','start','stop','ad']);
    ad.resolve(); assert.equal(await first, true);
    a.transition('running'); assert.equal(events.at(-1),'start');
});

test('ad rejection or synchronous throw releases lock and permits play', async () => {
    for (const commercial of [async () => { throw Error('blocked'); }, () => { throw Error('unavailable'); }]) {
        const {adapter:a,locks} = fixture(commercial);
        await a.init(); a.loadingFinished(); a.transition('running'); a.transition('paused');
        assert.equal(await a.beforeGameplay(), true);
        assert.equal(a.blocked, false); assert.deepEqual(locks,[true,false]);
        a.transition('running'); assert.equal(a.playing,true);
    }
});

test('tab hide, menu changes, replaced runs, and disposal invalidate late ad callbacks', async () => {
    for (const invalidation of ['cancel','dispose','state']) {
        const ad = deferred(); const {adapter:a,events} = fixture(() => ad.promise);
        await a.init(); a.loadingFinished(); a.transition('running'); a.transition('paused');
        let valid=true;
        const pending=a.beforeGameplay(() => valid);
        if (invalidation==='cancel') a.cancelPending();
        if (invalidation==='dispose') a.dispose();
        if (invalidation==='state') valid=false;
        ad.resolve(); assert.equal(await pending,false);
        assert.equal(a.playing,false); assert.equal(events.at(-1),'ad');
    }
});

test('initialization rejection still permits flights with no ad or event dependency', async () => {
    const a = new PokiAdapter({ sdk: { init: async () => {throw Error('offline');} } });
    await a.init(); a.loadingFinished();
    assert.equal(await a.beforeGameplay(),true); a.transition('running'); a.transition('terminated');
    assert.equal(await a.beforeGameplay(),true);
});

test('missing script, blocked SDK script and hanging init have a bounded playable fallback', async () => {
    for (const kind of ['missing','script','init']) {
        const listeners=new Map(); const init=deferred();
        const script={ addEventListener:(key,fn)=>listeners.set(key,fn),removeEventListener:key=>listeners.delete(key) };
        const a=new PokiAdapter();
        const win=kind==='init'?{PokiSDK:{init:()=>init.promise}}:{};
        await initializeSdk(a,{doc:{querySelector:()=>kind==='missing'?null:script},win,timeoutMs:5});
        assert.equal(a.ready,false); assert.equal(await a.beforeGameplay(),true);
        init.resolve(); await Promise.resolve(); await Promise.resolve();
        assert.equal(a.ready,false, 'Late init must not activate telemetry in a running session');
        assert.equal(listeners.size,0);
    }
});

test('SDK script load success initializes once before loadingFinished', async () => {
    const {sdk,events,adapter:a}=fixture(); const win={}; const listeners=new Map();
    const pending=initializeSdk(a,{win,doc:{querySelector:()=>({
        addEventListener:(key,fn)=>listeners.set(key,fn),removeEventListener:key=>listeners.delete(key),
    })},timeoutMs:100});
    win.PokiSDK=sdk; listeners.get('load')(); await pending;
    a.loadingFinished(); assert.deepEqual(events,['init','loaded']);
});
