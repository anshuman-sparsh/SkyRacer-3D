import test from 'node:test';
import assert from 'node:assert/strict';
import { FlightObjectives } from '../src/ui/FlightObjectives.js';
import { ObjectivePanel } from '../src/ui/ObjectivePanel.js';
import { createSafeStorage } from '../src/platform/SafeStorage.js';

const memory = () => { const values = new Map(); return { getItem: k => values.get(k) ?? null, setItem: (k,v) => values.set(k,String(v)) }; };
const metrics = (rings = 0, seconds = 0, score = 0) => ({ rings, seconds, score });

test('practice goals rotate deterministically and escalate to bounded targets only after completed flights', () => {
    const storage = memory(); let goals = new FlightObjectives(storage);
    const targets = [3,30,3000,6,60,6000,10,90,10000,10,90,10000];
    for (const target of targets) {
        goals.beginFlight(); assert.equal(goals.goal.target,target);
        const result = goals.finish(metrics(100,180,20000));
        assert.equal(result.complete,true);
        goals = new FlightObjectives(storage);
    }
    assert.equal(goals.completed,targets.length);
});

test('partial progress is per flight; failed flights and abandoning a flight do not advance or persist goals', () => {
    const storage = memory(), goals = new FlightObjectives(storage);
    goals.beginFlight(); goals.observe(metrics(2,20,500));
    assert.equal(goals.finish(metrics(2)).ratio,2/3);
    assert.equal(goals.completed,0);
    goals.beginFlight(); assert.equal(goals.value,0); assert.equal(goals.goal.metric,'rings');
    goals.observe(metrics(3)); goals.prepare(); // Back to menu, without finishing.
    assert.equal(goals.active,false);assert.equal(goals.finish(metrics(3)),null);
    assert.equal(new FlightObjectives(storage).completed,0);
});

test('terminal-frame metrics count; repeated termination cannot double-credit or overwrite the result', () => {
    let writes = 0;
    const goals = new FlightObjectives({getItem:()=>null,setItem(){writes++;}});
    goals.beginFlight();goals.observe(metrics(2));
    const result = goals.finish(metrics(3));
    assert.equal(result.complete,true);assert.equal(goals.completed,1);
    assert.equal(goals.finish(metrics(300)),result);assert.equal(writes,1);
    goals.observe(metrics(500));assert.equal(goals.value,3);
});

test('invalid observations cannot grant completion, decrease real progress, or overflow its display', () => {
    const goals = new FlightObjectives(memory()); goals.beginFlight();
    for (const rings of [NaN,Infinity,-1,'3',null]) goals.observe(metrics(rings));
    assert.equal(goals.value,0);goals.observe(metrics(2));goals.observe(metrics(1));assert.equal(goals.value,2);
    goals.observe(metrics(100000));assert.equal(goals.value,3);
    assert.equal(goals.finish(metrics()).ratio,1);
});

test('time goals observe active flight time, not hint exposure or time spent paused/in ads', () => {
    const storage = memory();storage.setItem('practice_objectives_v1',JSON.stringify({completed:1}));
    const goals = new FlightObjectives(storage);goals.beginFlight();
    goals.observe(metrics(1,29.99));for(let i=0;i<40;i++)goals.hint(.1);
    assert.equal(goals.complete,false);assert.equal(goals.value,29);
    // No active-flight observation occurs during a pause or advertisement.
    assert.equal(goals.finish(metrics(1,30)).complete,true);
});

test('goal hints are bounded, completion gets a fresh hint, and reload preserves only completion', () => {
    const storage = memory(), goals = new FlightObjectives(storage);goals.beginFlight();
    assert.match(goals.hint(.1),/Collect 3/);
    for(let i=0;i<45;i++)goals.hint(.1);
    assert.equal(goals.hint(.1),'');goals.observe(metrics(3));
    assert.match(goals.hint(.1),/GOAL COMPLETE/);
    assert.equal(new FlightObjectives(storage).completed,0,'uncompleted flight is never saved');
    goals.finish(metrics(3));const reloaded=new FlightObjectives(storage);
    assert.equal(reloaded.completed,1);assert.equal(reloaded.value,0);assert.equal(reloaded.result,null);
});

test('score/time progress does not cause rapidly changing live-region hints', () => {
    const goals=new FlightObjectives(memory());goals.completed=2;goals.beginFlight();
    const hint=goals.hint(.01);
    for(let score=1;score<100;score++) {
        goals.observe(metrics(0,0,score));assert.equal(goals.hint(.01),hint);
    }
});

test('corrupt, missing, and blocked storage preserve usable session-only objectives', () => {
    for(const raw of ['oops','null','{}','{"completed":-1}','{"completed":1.5}','{"completed":1000000}','{"completed":"1"}']) {
        const goals=new FlightObjectives({getItem:()=>raw,setItem(){throw Error('quota');}});
        assert.equal(goals.completed,0);goals.beginFlight();assert.equal(goals.finish(metrics(3)).complete,true);
        goals.beginFlight();assert.equal(goals.goal.metric,'seconds');
    }
    const goals=new FlightObjectives({getItem(){throw Error('blocked');},setItem(){throw Error('blocked');}});
    goals.beginFlight();assert.equal(goals.finish(metrics(3)).complete,true);
});

test('practice persistence is isolated between the website and Poki and never changes aircraft progress', () => {
    const backing=memory();backing.setItem('local_progress_v1','original');
    const web=createSafeStorage({getStorage:()=>backing,prefix:'skyracer_web_coach_v1:'});
    const poki=createSafeStorage({getStorage:()=>backing});
    const goals=new FlightObjectives(web);goals.beginFlight();goals.finish(metrics(3));
    assert.equal(new FlightObjectives(web).completed,1);assert.equal(new FlightObjectives(poki).completed,0);
    assert.equal(backing.getItem('local_progress_v1'),'original');
});

test('objective panel retains the result, previews the next goal on menu, and hides during pause/play', () => {
    const goals=new FlightObjectives(memory()), elements=new Map();
    const host={hidden:true,classList:{toggle(){}},querySelector(selector){if(!elements.has(selector))elements.set(selector,{});return elements.get(selector);}};
    const panel=new ObjectivePanel(host,goals);panel.render('start');
    assert.equal(host.hidden,false);assert.match(panel.text.textContent,/Collect 3/);assert.equal(panel.bar.hidden,true);
    goals.beginFlight();goals.observe(metrics(3));panel.render('paused');assert.equal(goals.active,true);
    const result=goals.finish(metrics(3));panel.render('terminated');assert.match(panel.title.textContent,/COMPLETE/);
    assert.equal(panel.bar.value,1);panel.render('terminated');assert.equal(goals.result,result);
    panel.render('start');assert.match(panel.text.textContent,/Fly for 30/);assert.equal(goals.active,false);
    panel.render('running');assert.equal(host.hidden,true);
});

test('near-goal language uses actual remaining units and only appears within twenty percent', () => {
    const goals=new FlightObjectives(memory());goals.beginFlight();
    assert.doesNotMatch(goals.finish(metrics(2)).text,/SO CLOSE/);
    goals.completed=2;goals.beginFlight();
    const result=goals.finish(metrics(0,0,2500));assert.match(result.text,/SO CLOSE.*500 points/);
});
