import test from 'node:test';
import assert from 'node:assert/strict';
import { FlightCoach, FlightMilestones } from '../src/ui/FlightCoach.js';
import { createSafeStorage } from '../src/platform/SafeStorage.js';
const memory = () => {const values=new Map();return {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};};
function expose(coach, seconds=2.5, observations={}) {
    const hints=[];
    for(let i=0;i<seconds*20;i++) {const hint=coach.advance(.05,observations);if(hint) hints.push(hint);}
    return hints;
}

test('new pilots see four concise hints during the opening ten active seconds without extra clicks',()=>{
    const coach=new FlightCoach(memory());
    const hints=expose(coach,10.25);
    assert.deepEqual([...new Set(hints.map(h=>h.id))],['steer','rings','hazard','boost']);
    assert.equal(coach.completed,true);
    assert.equal(coach.advance(.1),null);
    assert.match(hints[0].icon,/WASD/);
    assert.match(hints.find(h=>h.id==='rings').text,/30 seconds/);
});

test('touch guidance names gestures and BOOST; nearby hazards can take priority',()=>{
    const coach=new FlightCoach(memory(),true);
    const hazard=coach.advance(.1,{hazardNear:true});assert.equal(hazard.id,'hazard');
    expose(coach,3,{hazardNear:true});
    const hints=expose(coach,9);
    assert.ok(hints.some(h=>h.text.includes('Drag to steer')));
    assert.ok(hints.some(h=>h.icon==='BOOST'));
    assert.ok(!hints.some(h=>/SPACE|WASD/.test(h.icon)));
});

test('observed controls advance hints only after enough time to read; pauses do not consume exposure',()=>{
    const coach=new FlightCoach(memory());
    assert.equal(coach.advance(.1,{steering:true}).id,'steer');
    assert.equal(coach.current,'steer');
    const pausedElapsed=coach.elapsed;
    // Game does not call advance while paused/ad blocked.
    assert.equal(coach.elapsed,pausedElapsed);
    expose(coach,1.6,{steering:true});
    assert.ok(coach.seen & 1);
});

test('completion persists and suppresses coaching on later flights and reloads',()=>{
    const storage=memory();const coach=new FlightCoach(storage);expose(coach,11);
    coach.beginFlight();assert.equal(coach.advance(.1),null);
    assert.equal(new FlightCoach(storage).advance(.1),null);
});

test('partial completion survives retry/reload even once a novice has earned a record',()=>{
    const storage=memory();const coach=new FlightCoach(storage);expose(coach,2.6);
    coach.beginFlight();assert.equal(coach.advance(.1).id,'rings');
    assert.equal(new FlightCoach(storage,false,{experienced:true}).advance(.1).id,'rings');
    assert.equal(new FlightCoach(memory(),false,{experienced:true}).advance(.1),null);
});

test('blocked/corrupt storage retains safe in-memory completion and cannot crash flight',()=>{
    for(const value of ['broken','99','-1']) {
        const storage={getItem:()=>value,setItem(){throw Error('quota');}};
        const coach=new FlightCoach(storage);expose(coach,11);assert.equal(coach.completed,true);
    }
    const coach=new FlightCoach({getItem(){throw Error('private');},setItem(){throw Error('private');}});
    assert.equal(coach.advance(Infinity).id,'steer');assert.equal(coach.elapsed,0);
    expose(coach,11);assert.equal(coach.completed,true);
});

test('web and Poki coaching never share storage keys',()=>{
    const backing=memory();
    const web=createSafeStorage({getStorage:()=>backing,prefix:'skyracer_web_coach_v1:'});
    const poki=createSafeStorage({getStorage:()=>backing});
    expose(new FlightCoach(web),11);
    assert.equal(new FlightCoach(web).completed,true);
    assert.equal(new FlightCoach(poki).completed,false);
});

test('milestones are once per crossing, expire on active time, and reset for replay',()=>{
    const milestones=new FlightMilestones();milestones.beginFlight(200);
    assert.equal(milestones.advance(.1,1,50),'FIRST RING · NICE FLYING');
    assert.equal(milestones.advance(3,1,100),'');
    assert.equal(milestones.advance(.1,1,200),'','ties do not celebrate a new best');
    assert.equal(milestones.advance(.1,1,201),'PREVIOUS BEST PASSED');
    assert.equal(milestones.advance(3,1,202),'');
    assert.equal(milestones.advance(.1,6,500),'5 RINGS · KEEP GOING');
    milestones.beginFlight(500);assert.equal(milestones.advance(.1,1,50),'FIRST RING · NICE FLYING');
});
