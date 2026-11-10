import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { scoreComparison, nextHangarGoal } from '../src/ui/ReplaySummary.js';
import { HangarPanel } from '../src/ui/HangarPanel.js';

test('score compares the completed run with the previous record, including exact ties and zero',()=>{
    assert.match(scoreComparison(1200,1000),/\+200.*previous local best/);
    assert.match(scoreComparison(1000,1000),/^Matched/);
    assert.match(scoreComparison(850,1000),/^150 from/);
    assert.match(scoreComparison(50,0),/^FIRST RECORD/);
    assert.doesNotMatch(scoreComparison(0,0),/FIRST RECORD/);
});

test('Daily and Friend copy never compares against Classic or claims a verified new record',()=>{
    assert.match(scoreComparison(600,500,'daily',true),/local Daily best/);
    assert.match(scoreComparison(600,500,'daily',false),/known Daily best/);
    assert.doesNotMatch(scoreComparison(600,null,'daily'),/FIRST RECORD|NEW|verified/);
    assert.match(scoreComparison(600,500,'friend'),/separately/);
});

test('next aircraft progress uses supplied confirmed totals and the limiting requirement',()=>{
    const progress={unlockedIds:['silver-arrow'],totalRings:250,totalDistance:9000};
    const next=nextHangarGoal(progress);
    assert.equal(next.ratio,.5);assert.match(next.text,/Verified.*Voidrunner/);
    assert.match(next.text,/250 \/ 500 rings/);assert.match(next.text,/9,000 \/ 10,000 distance/);
    assert.equal(progress.totalRings,250,'display never mutates or credits unverified statistics');
});

test('local goals stay separate and do not suggest unavailable Apex as the next reward',()=>{
    const progress={unlockedIds:['silver-arrow','voidrunner','nova-vortex'],totalRings:1500,totalDistance:25000};
    assert.match(nextHangarGoal(progress,true).text,/All aircraft available in this local edition/);
    assert.match(nextHangarGoal(progress,false).text,/Verified.*Apex Overdrive/);
    assert.match(nextHangarGoal(null,true).text,/local/);
    assert.match(nextHangarGoal(null,false).text,/verified/);
});

test('completed thresholds do not fabricate ownership and corrupt counters stay bounded',()=>{
    const result=nextHangarGoal({unlockedIds:[],totalRings:100000},true);
    assert.equal(result.ratio,1);assert.match(result.text,/Awaiting unlock confirmation/);
    assert.match(result.text,/100 \/ 100/);
    const corrupt=nextHangarGoal({unlockedIds:[],totalRings:NaN});
    assert.equal(corrupt.ratio,0);assert.match(corrupt.text,/0 \/ 100/);
});

test('replay is ahead of optional forms and feedback respects hidden states/reduced motion',()=>{
    const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
    assert.ok(html.indexOf('data-restart hidden') < html.indexOf('data-classic-name-form'));
    assert.equal((html.match(/data-restart\b/g)??[]).length,1);
    const source=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
    assert.doesNotMatch(source,/ringsElement\.offsetWidth/);
    assert.match(source,/if \(gameState === 'running'\) updateFlightExperience/);
    const css=readFileSync(new URL('../src/styles/racing-ui.css',import.meta.url),'utf8');
    assert.match(css,/prefers-reduced-motion: reduce/);
    assert.match(css,/\.flight-coach[\s\S]*pointer-events: none/);
});

test('replay progress is notified only after a valid Hangar snapshot, not a failed response',async()=>{
    const snapshots=[];
    const panel=Object.create(HangarPanel.prototype);
    Object.assign(panel,{loading:false,refreshAgain:false,progress:null,local:false,status:{},
        selection:{setUnlocked(){}},refresh(){},renderProgress(){},onProgress:data=>snapshots.push(data)});
    const confirmed={unlockedIds:[],verifiedRuns:1,totalRings:5,totalDistance:200};
    panel.loadProgress=async()=>confirmed;await panel.refreshProgress();
    assert.deepEqual(snapshots,[confirmed]);
    panel.loadProgress=async()=>({totalRings:100});await panel.refreshProgress();
    assert.deepEqual(snapshots,[confirmed]);assert.equal(panel.progress,confirmed);
});
