import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { FlightObjectives } from '../src/ui/FlightObjectives.js';
import { FlightFeedback } from '../src/ui/FlightFeedback.js';
import { FlightMilestones } from '../src/ui/FlightCoach.js';
import { ScoreManager } from '../src/managers/ScoreManager.js';
import { RingCollectionDeadline } from '../src/managers/RingCollectionDeadline.js';
const source=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');

test('real feedback wiring prioritizes onboarding and timer warnings, preserves milestones and bounds goal exposure',()=>{
    let coaching=true;
    const c={flightObjectives:new FlightObjectives(),objectiveMetrics:{},flightFeedback:new FlightFeedback(),
        flightMilestones:new FlightMilestones(),flightCoach:{completed:true,advance:()=>coaching?{id:'steer',icon:'WASD',text:'Steer'}:null},
        scoreManager:{ringsCollected:0,currentScore:0},activeRunSeconds:0,inputManager:{state:{}},
        ringCollectionDeadline:{countdownSeconds:null},trackManager:{blackRings:[]},hovercraft:{position:{z:0,x:0}},
        coachElement:{hidden:true},coachIcon:{},coachText:{textContent:''},milestoneElement:{hidden:true},lastCoachId:'',lastMilestone:''};
    c.flightObjectives.beginFlight();
    const update=source.slice(source.indexOf('function updateFlightExperience('),source.indexOf('\nfunction updateRingDeadlineDisplay()'));
    vm.createContext(c);vm.runInContext(update,c);c.updateFlightExperience(.1);
    assert.equal(c.coachText.textContent,'Steer');assert.equal(c.flightObjectives.hintRemaining,4);
    coaching=false;c.updateFlightExperience(.1);assert.match(c.coachText.textContent,/Collect 3/);
    const exposure=c.flightObjectives.hintRemaining;
    c.ringCollectionDeadline.countdownSeconds=8;c.updateFlightExperience(.1);
    assert.equal(c.coachElement.hidden,true);assert.equal(c.milestoneElement.hidden,true);
    assert.equal(c.flightObjectives.hintRemaining,exposure);
    c.ringCollectionDeadline.countdownSeconds=null;c.scoreManager.ringsCollected=1;
    c.flightFeedback.collection(1,0,0,50);c.updateFlightExperience(.1);
    assert.match(c.milestoneElement.textContent,/FIRST RING/,'P1 milestone takes priority over pickup text');
    c.scoreManager.ringsCollected=3;c.updateFlightExperience(.1);
    assert.match(c.coachText.textContent,/GOAL COMPLETE/);
});

test('actual terminal frame credits final rings/time exactly once without changing competitive score semantics',()=>{
    const frame=source.slice(source.indexOf('function animate('),source.indexOf('\nfunction resizeViewport()'));
    const transitionPrefix=source.slice(source.indexOf('function setGameState('),source.indexOf("    if (nextState !== 'running')",source.indexOf('function setGameState(')))+'\n}';
    for(const collision of [true,false]) {
        const objectives=new FlightObjectives();if(!collision)objectives.completed=1;objectives.beginFlight();
        const score=new ScoreManager({recordsEnabled:false}),deadline=new RingCollectionDeadline();deadline.advance(29);
        const c={clock:{getDelta:()=>1},document:{hidden:false},platform:{blocked:false},appDisposed:false,
            hangarPanel:{dialog:{open:false}},renderRecovery:{lost:false},gameState:'running',activeRunSeconds:29,
            inputManager:{state:{},update(){}},hovercraft:{position:{},velocity:{z:-28},update(){},
                activateEnergyBoost(){},setSpeedProgressionLevel(){},activateSpeedSurge(){},spinOut(){}},
            starField:{update(){}},activeFlightAbility:{ringCaptureRadius:.7,energyBoostDuration:4.5},
            trackManager:{update:()=>({collectedRings:collision?3:0,collectedEnergyRings:collision?3:0,collectedSurgeRings:0,
                nearMisses:0,collided:collision,collisionType:'barrier'})},
            scoreManager:score,ringCollectionDeadline:deadline,updateRingDeadlineDisplay(){},
            cameraDynamics:{addRingImpulse(){},addShake(){},update(){}},audioEngine:{playRingChime(){},update(){}},
            flightFeedback:new FlightFeedback(),flightObjectives:objectives,objectivePanel:{render(){}},
            ringsElement:{classList:{toggle(){},contains:()=>false}},updateHud(){},hudElapsed:0,HUD_UPDATE_INTERVAL:.05,
            updateTrackLightResponse(){},collisionDebug:null,renderer:{render(){}},scene:{},camera:{},
            requestAnimationFrame:()=>1};
        vm.createContext(c);vm.runInContext(transitionPrefix+frame,c);c.animate(1);
        assert.equal(c.gameState,'terminated');assert.equal(objectives.result.complete,true);
        assert.equal(objectives.completed,collision?1:2);
        assert.equal(score.currentScore,collision?150:14,'collision preserves ring bonus; timeout preserves capped distance step');
        const result=objectives.result;c.setGameState('terminated');assert.equal(objectives.result,result);
    }
});
