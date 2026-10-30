import test from 'node:test';
import assert from 'node:assert/strict';
import { FriendChallengeService } from '../src/services/FriendChallengeService.js';
import { FriendChallengePanel } from '../src/ui/FriendChallengePanel.js';

const ID = '0123456789abcdef0123456789abcdef';
class Element {
  constructor(){this.hidden=false;this.disabled=false;this.value='';this.textContent='';this.open=false;this.events=new Map();this.focused=false;}
  addEventListener(k,fn){this.events.set(k,fn)}
  removeEventListener(k){this.events.delete(k)}
  focus(){this.focused=true}
  select(){this.selected=true}
  showModal(){this.open=true}
  close(){this.open=false;this.events.get('close')?.()}
}
function createPanel(overrides={}) {
  const oldDocument=globalThis.document, oldWindow=globalThis.window;
  const keys=['friend-dialog','quick-friend','friend-result','friend-close','friend-status','friend-target','friend-creator','friend-expiry','friend-details','friend-create','friend-accept','friend-copy','friend-link','friend-outcome'];
  const elements=new Map(keys.map(key=>[key,new Element()]));
  globalThis.document={querySelector(selector){return elements.get(selector.match(/data-([\w-]+)/)?.[1])}};
  globalThis.window={location:{href:'https://www.skyracer.online/?challenge='+ID}};
  const info={id:ID,creatorNickname:'Pilot_1',targetScore:600,expiresAt:'2099-01-01T00:00:00Z'};
  const service={enabled:true,resolve:async()=>info,create:async()=>info,...overrides};
  const panel=new FriendChallengePanel({service,onOpen:()=>{},getResult:()=>null,canCreate:()=>false,onAccept:async()=>true});
  return {panel,service,get:key=>elements.get(key),restore(){panel.dispose();globalThis.document=oldDocument;globalThis.window=oldWindow;}};
}
test('friend service routes create, resolve, start and finish through authenticated transport',async()=>{
  const calls=[];
  const service=new FriendChallengeService({enabled:true,requestFriendChallenge:async(...args)=>{calls.push(args);if(args[1]?.action==='start')return {runId:'9d999e88-506e-43b6-87a6-72585f89bdb1'};return {accepted:true};}});
  await service.resolve(ID);
  await service.create({runId:'test-run'});
  await service.start(ID);
  await service.finish('test-run',{score:100,rings:0,distance:10});
  assert.deepEqual(calls.map(x=>x[0]),['GET','POST','POST','POST']);
  assert.equal(calls[0][2],ID);
  assert.deepEqual(calls.map(x=>x[1]?.action),[undefined,'create','start','finish']);
});
test('friend dialog shows server target and never automatically accepts challenge',async()=>{
  const f=createPanel();let accepted=0;f.panel.onAccept=async()=>{accepted++;return true};
  try{
    await f.panel.open({currentTarget:f.get('quick-friend')});
    assert.equal(f.get('friend-dialog').open,true);
    assert.equal(f.get('friend-target').textContent,'600');
    assert.equal(f.get('friend-creator').textContent,'Pilot_1');
    assert.equal(accepted,0);
    assert.equal(f.get('friend-accept').disabled,false);
    await f.panel.accept();
    assert.equal(accepted,1);
    assert.equal(f.get('friend-dialog').open,false);
  }finally{f.restore()}
});
test('verified friend results stay visible on modal reopen',async()=>{
  const f=createPanel();
  try{
    await f.panel.open();
    f.panel.setVerifiedResult({won:true});
    assert.match(f.get('friend-outcome').textContent,/verified by SkyRacer/);
    f.panel.dialog.close();
    await f.panel.open();
    assert.match(f.get('friend-outcome').textContent,/verified by SkyRacer/);
    f.panel.setVerifiedResult(null);
    assert.equal(f.get('friend-outcome').textContent,'');
  }finally{f.restore()}
});
test('expired challenges cannot be accepted',async()=>{
  const f=createPanel({resolve:async()=>({id:ID,creatorNickname:'Pilot_1',targetScore:600,expiresAt:'2020-01-01T00:00:00Z'})});
  try{await f.panel.open();assert.equal(f.get('friend-accept').disabled,true)}finally{f.restore()}
});
