import test from 'node:test';
import assert from 'node:assert/strict';
import { createSafeStorage } from '../src/platform/SafeStorage.js';
import { LocalProgress } from '../src/platform/LocalProgress.js';
import { ScoreManager } from '../src/managers/ScoreManager.js';
import { DAILY_COURSE_VERSION, createDailyRandom } from '../src/utils/DailyChallenge.js';
import { AircraftSelection } from '../src/hangar/AircraftSelection.js';
import { THEME_STORAGE_KEY } from '../src/ui/ThemeController.js';
const memory = () => {const data=new Map();return {data,getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};};

test('Poki storage namespace isolates web identity, records, themes, and equipment', () => {
    const backing=memory(); backing.setItem('skyracer_highscore_v2','999999');
    backing.setItem('skyracer_lb_session_v1','private-identity');
    backing.setItem(THEME_STORAGE_KEY,'ember');
    const storage=createSafeStorage({getStorage:()=>backing});
    const score=new ScoreManager({storage}); assert.equal(score.getHighScore(),0);
    score.collectRings(3); score.persistRecords();
    assert.equal(backing.getItem('skyracer_highscore_v2'),'999999');
    assert.equal(backing.getItem('skyracer_poki_v1:skyracer_highscore_v2'),'150');
    assert.equal(backing.getItem('skyracer_lb_session_v1'),'private-identity');
    assert.equal(storage.getItem(THEME_STORAGE_KEY),null);
    const selection=new AircraftSelection({storage}); selection.choose('cyan-striker');
    assert.ok([...backing.data.keys()].some(k=>k.startsWith('skyracer_poki_v1:skyracer_aircraft')));
});

test('storage getter, read, and write failures retain memory records and remain playable', () => {
    for (const backing of [()=>{throw Error('denied');},()=>({getItem(){throw Error();}}),
        ()=>({getItem:()=>null,setItem(){throw Error();}})]) {
        const storage=createSafeStorage({getStorage:backing});
        const score=new ScoreManager({storage}); score.collectRings(2); score.persistRecords();
        assert.equal(score.getHighScore(),100);
        assert.equal(new ScoreManager({storage}).getHighScore(),100);
        storage.removeItem('skyracer_highscore_v2');
        assert.equal(storage.getItem('skyracer_highscore_v2'),null);
        assert.equal(storage.persistent,false);
    }
});

test('local milestones unlock Silver/ Void/ Nova at unchanged thresholds, never online-only Apex', () => {
    const storage=createSafeStorage({getStorage:memory});
    const p=new LocalProgress(storage);
    p.recordFlight({rings:99,distance:9999}); assert.equal(p.snapshot().unlockedIds.length,2);
    p.recordFlight({rings:1,distance:1}); assert.ok(p.snapshot().unlockedIds.includes('silver-arrow'));
    p.recordFlight({rings:400,distance:0}); assert.ok(p.snapshot().unlockedIds.includes('voidrunner'));
    p.recordFlight({rings:1000,distance:15000}); assert.ok(p.snapshot().unlockedIds.includes('nova-vortex'));
    assert.equal(p.snapshot().unlockedIds.includes('apex-overdrive'),false);
    assert.equal(p.snapshot().local,true);
    assert.equal(new LocalProgress(storage).snapshot().totalRings,1500);
});

test('Daily keeps UTC date/version, best-only updates and original date across midnight', () => {
    const storage=createSafeStorage({getStorage:memory}); let now=new Date('2026-11-10T23:59:59Z');
    const p=new LocalProgress(storage,()=>now); const old=p.beginDaily();
    assert.equal(old.date,'2026-11-10'); assert.equal(old.courseVersion,DAILY_COURSE_VERSION);
    now=new Date('2026-11-11T00:00:01Z');
    assert.equal(p.finishDaily(old,{score:100}).personalBest,100);
    assert.throws(()=>p.finishDaily(old,{score:200}));
    assert.equal(p.today().me,null); assert.equal(p.today().date,'2026-11-11');
    assert.equal(p.today().entries.length,0); assert.equal(p.today().local,true);
    const run=p.beginDaily(); p.finishDaily(run,{score:300});
    assert.equal(p.finishDaily(p.beginDaily(),{score:150}).personalBest,300);
    assert.equal(p.snapshot().dailyCompletions,2);
    assert.throws(()=>p.finishDaily({...p.beginDaily()},{score:999}));
    const first=createDailyRandom(run.date,run.courseVersion), second=createDailyRandom(run.date,run.courseVersion);
    for(let i=0;i<50;i++) assert.equal(first(),second());
});

test('corrupt local data and unwritable progression storage never crash', () => {
    const p=new LocalProgress({getItem:()=>'{broken',setItem(){throw Error('full');}});
    p.recordFlight({rings:100,distance:20});
    assert.ok(p.snapshot().unlockedIds.includes('silver-arrow'));
    p.finishDaily(p.beginDaily(),{score:200}); assert.equal(p.today().me.score,200);
});

test('Poki records and progression survive reloads without importing website data', () => {
    const backing=memory();
    const first=createSafeStorage({getStorage:()=>backing});
    const score=new ScoreManager({storage:first});score.collectRings(4);score.persistRecords();
    const progress=new LocalProgress(first);progress.recordFlight({rings:100,distance:300});
    progress.finishDaily(progress.beginDaily(),{score:900});
    const reloaded=createSafeStorage({getStorage:()=>backing});
    assert.equal(new ScoreManager({storage:reloaded}).getHighScore(),200);
    assert.ok(new LocalProgress(reloaded).snapshot().unlockedIds.includes('silver-arrow'));
    assert.equal(new LocalProgress(reloaded).today().me.score,900);
});

test('offline services and analytics perform no requests even with network APIs blocked', async () => {
    const prior=globalThis.fetch; let requests=0;
    globalThis.fetch=()=>{requests++;throw Error('Forbidden request');};
    try {
        const m=await import('../src/platform/local-services.js');
        const lb=new m.LeaderboardService(); assert.equal(lb.enabled,false);
        assert.equal((await lb.getHangarProgress()).local,true);
        const daily=new m.DailyChallengeService(lb);
        const run=await daily.begin(); assert.equal((await daily.finish(run,{score:100})).local,true);
        assert.equal((await daily.getToday()).local,true);
        assert.equal(new m.FriendChallengeService().enabled,false);
        await new m.ClassicAutoSubmit().completedRun({score:300});
        const analytics=new m.GameplayAnalyticsService();
        analytics.trackRunStart('classic'); analytics.trackRunEnd({score:100}); m.inject(); analytics.dispose();
        assert.equal(requests,0);
    } finally { globalThis.fetch=prior; }
});
