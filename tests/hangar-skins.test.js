import test from 'node:test';
import assert from 'node:assert/strict';
import { HoverCraft } from '../src/entities/HoverCraft.js';
import { AIRCRAFT_APPEARANCES } from '../src/hangar/AircraftAppearances.js';
import { AircraftSelection, FREE_AIRCRAFT, AIRCRAFT_PREFERENCE_KEY } from '../src/hangar/AircraftSelection.js';

test('starter skins share exactly the same physics, hitboxes and movement bounds', () => {
 const craft=new HoverCraft();
 const parts=craft.collisionParts.map(p=>[p.name,...p.centre.toArray(),...p.halfExtents.toArray()]);
 const bounds=JSON.stringify(craft.bounds);
 const maxSpeed=craft.maxSpeed;
 for(const id of Object.keys(AIRCRAFT_APPEARANCES)){
  craft.setAppearance(id);
  assert.equal(craft.appearanceId,id);
  assert.deepEqual(craft.collisionParts.map(p=>[p.name,...p.centre.toArray(),...p.halfExtents.toArray()]),parts);
  assert.equal(JSON.stringify(craft.bounds),bounds);
  assert.equal(craft.maxSpeed,maxSpeed);
  assert.equal(craft.paintMaterials.hullMaterial.color.getHex(),AIRCRAFT_APPEARANCES[id].hull);
  assert.equal(craft.engineTrails[0].material.color.getHex(),AIRCRAFT_APPEARANCES[id].trail);
 }
});
test('advanced aircraft have unique cosmetic modules but no new collision shapes',()=>{
 const craft=new HoverCraft();
 const parts=craft.collisionParts.length;
 for(const [id,paint] of Object.entries(AIRCRAFT_APPEARANCES)){
  craft.setAppearance(id);
  for(const [profile,detail] of craft.styleDetails) assert.equal(detail.group.visible,profile===paint.profile);
  assert.equal(craft.collisionParts.length,parts);
 }
});
test('Match Theme defaults, manual starter overrides, persistence, and blocked storage',()=>{
 const data=new Map(), storage={getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v)};
 const changes=[];
 const choice=new AircraftSelection({theme:'ember',storage,onChange:id=>changes.push(id)});
 assert.equal(choice.activeId,'ember-striker');
 choice.setTheme('neon');assert.equal(choice.activeId,'cyan-striker');
 assert.equal(choice.choose('ember-striker'),true);
 assert.equal(choice.activeId,'ember-striker');
 choice.setTheme('neon');assert.equal(choice.activeId,'ember-striker');
 assert.equal(data.get(AIRCRAFT_PREFERENCE_KEY),'ember-striker');
 assert.equal(choice.choose('apex-overdrive'),false);
 assert.equal(choice.activeId,'ember-striker');
 assert.equal(choice.choose('match-theme'),true);
 assert.equal(choice.activeId,'cyan-striker');
 assert.deepEqual(FREE_AIRCRAFT,['cyan-striker','ember-striker']);
 const restored=new AircraftSelection({storage,theme:'ember'});
 assert.equal(restored.activeId,'ember-striker');
 const blocked=new AircraftSelection({storage:{getItem(){throw Error()},setItem(){throw Error()}},theme:'neon'});
 assert.equal(blocked.choose('cyan-striker'),true);
});
