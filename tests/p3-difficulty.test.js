import test from 'node:test';
import assert from 'node:assert/strict';
import { traceCourse } from '../scripts/profile-difficulty.js';
import { FlightObjectives } from '../src/ui/FlightObjectives.js';
import { FlightFeedback } from '../src/ui/FlightFeedback.js';
import { ScoreManager } from '../src/managers/ScoreManager.js';
import { HoverCraft } from '../src/entities/HoverCraft.js';
import { RingCollectionDeadline } from '../src/managers/RingCollectionDeadline.js';
import { LocalProgress } from '../src/platform/LocalProgress.js';

test('the first 180 seconds of seeded layout generation are identical with retention observing events', () => {
    const baseline=traceCourse(), goals=new FlightObjectives(), feedback=new FlightFeedback();goals.beginFlight();
    const observed=traceCourse(undefined,'2026-11-11',(seconds,track)=>{
        goals.observe({seconds,rings:track.spawnedRingCount,score:seconds*280});
        feedback.advance(1);
    });
    assert.deepEqual(observed,baseline);
    assert.equal(baseline.layoutHash,'6aeed576e3efe06eb2eedea156e6d422a867c5d63cc28c65fc34fd575dac9e67', 'P2 layout fixture, including RNG consumption and ring types');
    assert.deepEqual(baseline.checkpoints.map(point=>point.seconds),[30,60,120,180]);
});

test('the opening stays hazard-free; every seventh spawned collectible remains pink', () => {
    const seen=new Map();
    traceCourse(undefined,'2026-11-12',(_,track)=>{
        for(const hazard of [...track.obstacles,...track.blackRings]) assert.ok(hazard.position.z<=-48);
        for(const ring of track.energyRings)seen.set(ring.position.z,{z:ring.position.z,pink:ring.isSurge});
    });
    const rings=[...seen.values()].sort((a,b)=>b.z-a.z);
    assert.ok(rings.length>100);
    rings.forEach((ring,index)=>assert.equal(ring.pink,(index+1)%7===0));
});

test('difficulty remains ring-driven rather than elapsed-time-driven; score and surge thresholds remain exact', () => {
    const score=new ScoreManager({recordsEnabled:false});
    const craft=Object.create(HoverCraft.prototype);craft.maxSpeed=28;
    for(let second=0;second<180;second++)score.update(1,{z:-28});
    assert.equal(score.speedProgressionLevel,0);assert.equal(score.currentScore,50400);
    for(let ring=1;ring<=36;ring++) {
        score.collectRings(1);craft.setSpeedProgressionLevel(score.speedProgressionLevel);
        assert.equal(craft.maxSpeed,28+Math.floor(ring/6)*2/3.6);
    }
    assert.equal(score.currentScore,50400+36*50);
    Object.assign(craft,{collectedSurgeRings:0,velocity:{z:-28},speedSurgeTimeRemaining:0});
    for(let pink=1;pink<=9;pink++) {
        craft.activateSpeedSurge(1);
        assert.equal(craft.speedSurgeTarget,(165+Math.floor((pink-1)/4)*5)/3.6);
    }
});

test('the deadline stays 30 active seconds, warns after twenty, and a valid collection wins at expiration', () => {
    const deadline=new RingCollectionDeadline();deadline.advance(19.99);assert.equal(deadline.countdownSeconds,null);
    deadline.advance(.01);assert.equal(deadline.countdownSeconds,10);
    assert.equal(deadline.advance(10,1),false);assert.equal(deadline.secondsWithoutRing,0);
    assert.equal(deadline.advance(29.99),false);assert.equal(deadline.advance(.01),true);
});

test('practice completion cannot satisfy Apex conditions or change local aircraft unlock totals', () => {
    const values=new Map(),storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)};
    const progress=new LocalProgress(storage), before=progress.snapshot(), goals=new FlightObjectives(storage);
    for(let run=0;run<12;run++){goals.beginFlight();goals.finish({rings:100,seconds:180,score:20000});}
    assert.deepEqual(progress.snapshot(),before);assert.equal(goals.completed,12);
    assert.equal(progress.snapshot().unlockedIds.includes('apex-overdrive'),false);
    assert.equal(new LocalProgress(storage).snapshot().unlockedIds.includes('apex-overdrive'),false);
});
