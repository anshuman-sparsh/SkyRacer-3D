import test from 'node:test';
import assert from 'node:assert/strict';
import { FlightFeedback } from '../src/ui/FlightFeedback.js';
import { scoreComparison, nextHangarGoal } from '../src/ui/ReplaySummary.js';
import { installScrollGuard } from '../src/platform/DeviceSupport.js';

test('pickup feedback distinguishes energy/surge and shows real bonus, deadline reset and earned speed change', () => {
    const feedback=new FlightFeedback();feedback.collection(1,0,0,50);
    assert.match(feedback.advance(.1),/BLUE RING · ENERGY BOOST · \+50 · TIMER RESET/);
    feedback.collection(0,2,1,50);assert.match(feedback.advance(.1),/PINK RING · SURGE · \+100.*CRUISE SPEED UP/);
    feedback.collection(1,1,0,50);assert.match(feedback.advance(.1),/BLUE \+ PINK RINGS.*\+100/);
});

test('near misses do not grant score, replace ring feedback, persist forever, or leak into replays', () => {
    const feedback=new FlightFeedback();feedback.collection(1,0,0,50);feedback.nearMiss(1);
    assert.match(feedback.advance(.1),/BLUE RING/);assert.equal(feedback.advance(3),'');
    feedback.nearMiss(1);assert.match(feedback.advance(.1),/BARRIER CLEARED/);
    feedback.beginFlight();assert.equal(feedback.advance(.1),'');assert.equal(feedback.nearMisses,0);
    feedback.collection(0,0,0,50);assert.equal(feedback.advance(NaN),'');
});

test('personal best near misses are exact, mode-aware, and never invent verified or global achievements', () => {
    assert.match(scoreComparison(950,1000),/^SO CLOSE.*50 from your local best/);
    assert.doesNotMatch(scoreComparison(949,1000),/SO CLOSE/);
    assert.match(scoreComparison(1000,1000),/^Matched/);
    assert.match(scoreComparison(1001,1000),/^\+1/);
    assert.doesNotMatch(scoreComparison(999,1000,'friend'),/SO CLOSE|best/);
    assert.match(scoreComparison(999,1000,'daily'),/known Daily best/);
    assert.doesNotMatch(scoreComparison(999,null,'daily'),/SO CLOSE|RECORD/);
});

test('Hangar remaining requirements are actionable, confirmed-only, and never offer offline Apex', () => {
    const snapshot={unlockedIds:['silver-arrow'],totalRings:450,totalDistance:10000};
    assert.match(nextHangarGoal(snapshot).text,/Still needed: 50 rings$/);
    const pending=nextHangarGoal({...snapshot,totalRings:500});assert.match(pending.text,/Awaiting unlock confirmation/);
    assert.doesNotMatch(pending.text,/Still needed/);assert.equal(snapshot.totalRings,450);
    const local=nextHangarGoal({unlockedIds:['silver-arrow','voidrunner','nova-vortex']},true);
    assert.match(local.text,/All aircraft available in this local edition/);assert.doesNotMatch(local.text,/Apex/);
});

test('results can scroll inside short screens while gameplay still blocks wheel scrolling', () => {
    let listener, removed=false, prevented=0;
    const dispose=installScrollGuard({addEventListener:(_,fn)=>listener=fn,removeEventListener:()=>removed=true});
    const event=selector=>({target:{closest:allowed=>allowed.split(', ').includes(selector)?{}:null},preventDefault(){prevented++;}});
    for(const target of ['dialog','[data-quick-menu]','.state-overlay__content']) listener(event(target));
    assert.equal(prevented,0);listener(event('canvas'));assert.equal(prevented,1);
    dispose();assert.equal(removed,true);
});
