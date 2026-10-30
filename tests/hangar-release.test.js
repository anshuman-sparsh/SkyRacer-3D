import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read=(path)=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
test('Hangar hidden states override display styles',()=>{
 const css=read('src/styles/racing-ui.css');
 for(const selector of ['.hangar-entry[hidden]','.hangar-unlock[hidden]','.hangar-aircraft__default[hidden]','.hangar-shell [hidden]'])
  assert.ok(css.includes(selector));
 assert.match(css,/\.hangar-shell \[hidden\]\s*\{ display: none !important; \}/);
});
test('Hangar preview releases its extra renderer and does not dispose recursively',()=>{
 const src=read('src/hangar/HangarPreview.js');
 assert.match(src,/close\(\)\{this\.disposeRenderer\(\);\}/);
 assert.match(src,/disposeRenderer\(\)\{\s*this\.frame=0|disposeRenderer\(\)\{\s*cancelAnimationFrame/);
 assert.doesNotMatch(src,/disposeRenderer\(\)\{\s*this\.close\(\)/);
 assert.match(src,/this\.renderer\.forceContextLoss\(\)/);
});
test('Hangar serializes server progress refreshes instead of dropping concurrent updates',()=>{
 const src=read('src/ui/HangarPanel.js');
 assert.match(src,/this\.refreshAgain=true/);
 assert.match(src,/if \(this\.refreshAgain\)/);
 assert.match(src,/this\.refreshAgain=false;\s*void this\.refreshProgress\(\)/);
});
test('M5 remains scoped to existing modes and keeps Vercel auto-branch disabled',()=>{
 const config=JSON.parse(read('vercel.json'));
 assert.equal(config.git.deploymentEnabled['auto-branch'],false);
 assert.equal(config.git.deploymentEnabled.main,true);
 const main=read('src/main.js');
 assert.match(main,/eliteAbilityFor\(activeFlightAircraftId, aircraftSelection\.ownedIds\)/);
 assert.doesNotMatch(main,/gameMode = 'enhanced'/);
});
