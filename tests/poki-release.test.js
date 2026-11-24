import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { inflateRawSync } from 'node:zlib';
import { inspectPokiBuild } from '../scripts/check-poki-build.js';
import { packagePokiBuild, createReleaseArchive, crc32 } from '../scripts/package-poki.js';
import { runtimeNotices } from '../scripts/third-party-notices.js';
function fixture(t) {
    const folder=mkdtempSync(join(tmpdir(),'skyracer-p4-')),root=join(folder,'game');mkdirSync(join(root,'assets'),{recursive:true});
    t.after(()=>rmSync(folder,{recursive:true,force:true}));
    writeFileSync(join(root,'index.html'),'<html data-platform="poki"><head><script src="https://game-cdn.poki.com/scripts/v2/poki-sdk.js" data-poki-sdk></script><link href="./assets/style.css" rel="stylesheet"></head><script type="module" src="./assets/main.js"></script></html>');
    writeFileSync(join(root,'assets/main.js'),'import "./three.js"; export const preview=()=>import("./preview.js");');
    writeFileSync(join(root,'assets/three.js'),'export const bundled=true;');
    writeFileSync(join(root,'assets/preview.js'),'export const optional=true;');
    writeFileSync(join(root,'assets/style.css'),'body { color: cyan; }');
    writeFileSync(join(root,'THIRD_PARTY_NOTICES.txt'),runtimeNotices());
    return {root,folder};
}
test('release audit validates portable HTML plus static and deferred module references',t=>{
    const {root}=fixture(t);assert.equal(inspectPokiBuild(root).files,6);
    unlinkSync(join(root,'assets/preview.js'));assert.throws(()=>inspectPokiBuild(root),/Missing bundled asset/);
});
test('release audit validates Vite preload maps independently of direct imports',t=>{
    const {root}=fixture(t);writeFileSync(join(root,'assets/main.js'),'const preload=["assets/absent.js"];');
    assert.throws(()=>inspectPokiBuild(root),/Missing bundled asset/);
});
test('remote CSS, module URLs, absolute paths and traversal are rejected',t=>{
    const {root}=fixture(t);
    for(const url of ['https://example.org/lib.js','//example.org/lib.js','/assets/three.js','../../outside.js']) {
        writeFileSync(join(root,'assets/main.js'),`import "${url}";`);
        assert.throws(()=>inspectPokiBuild(root),/Unapproved|escapes/);
    }
    writeFileSync(join(root,'assets/main.js'),'export const ok=true;');
    writeFileSync(join(root,'assets/style.css'),'@import "https://example.org/font.css";');
    assert.throws(()=>inspectPokiBuild(root),/Unapproved/);
});
test('development/config files and leaked keys are rejected without printing their contents',t=>{
    const {root}=fixture(t);
    for(const file of ['.env','README.md','package.json','assets/main.js.map','assets/example.test.js']) {
        writeFileSync(join(root,file),'not for publication');assert.throws(()=>inspectPokiBuild(root),/Unexpected publication file/);unlinkSync(join(root,file));
    }
    const secret='sb_secret_FAKE_TEST_VALUE';writeFileSync(join(root,'assets/main.js'),`const key="${secret}";`);
    assert.throws(()=>inspectPokiBuild(root),error=>/Forbidden/.test(error.message)&&!error.message.includes(secret));
});
test('packaging enforces default offline policy even when an online build could pass its separate audit',t=>{
    const {root,folder}=fixture(t);writeFileSync(join(root,'assets/main.js'),'const backend="https://example.supabase.co";');
    assert.equal(inspectPokiBuild(root,{online:true}).files,6);
    assert.throws(()=>packagePokiBuild(root,join(folder,'online.zip')),/Online service/);
});
test('ZIP checksum has the standard known answer and ZIP entries cannot traverse or duplicate',()=>{
    assert.equal(crc32(Buffer.from('123456789')),0xcbf43926);
    for(const name of ['../secret','/absolute','C:/secret','assets/../secret','assets\\secret']) {
        assert.throws(()=>createReleaseArchive([{name,data:Buffer.from('x')}]),/Unsafe/);
    }
    assert.throws(()=>createReleaseArchive([{name:'index.html',data:Buffer.alloc(0)},{name:'index.html',data:Buffer.alloc(0)}]),/duplicate/);
});
test('release ZIP is deterministic, rooted at index.html, and every extracted byte matches its hash manifest',t=>{
    const {root,folder}=fixture(t),output=join(folder,'release.zip');
    const first=packagePokiBuild(root,output),zip=readFileSync(output);
    assert.deepEqual(packagePokiBuild(root,output),first);assert.ok(readFileSync(output).equals(zip));
    const extracted=new Map();let offset=0;
    while(zip.readUInt32LE(offset)===0x04034b50) {
        const compressed=zip.readUInt32LE(offset+18),size=zip.readUInt32LE(offset+22),length=zip.readUInt16LE(offset+26);
        const name=zip.subarray(offset+30,offset+30+length).toString();
        const data=inflateRawSync(zip.subarray(offset+30+length,offset+30+length+compressed));
        assert.equal(data.length,size);assert.equal(crc32(data),zip.readUInt32LE(offset+14));
        extracted.set(name,data);offset+=30+length+compressed;
    }
    assert.equal(zip.readUInt32LE(offset),0x02014b50);assert.ok(extracted.has('index.html'));
    assert.equal(extracted.size,6);assert.equal(zip.readUInt16LE(zip.length-12),6);
    for(const entry of first.entries) {
        assert.ok(extracted.get(entry.path).equals(readFileSync(join(root,entry.path))));
        assert.equal(createHash('sha256').update(extracted.get(entry.path)).digest('hex'),entry.sha256);
    }
    assert.equal(readFileSync(output.replace('.zip','.manifest.json'),'utf8'),JSON.stringify(first,null,2)+'\n');
    assert.throws(()=>packagePokiBuild(root,join(root,'bad.zip')),/outside/);
});

test('runtime notices accompany both builds and no missing notice file can ship',t=>{
    const {root}=fixture(t);
    assert.match(runtimeNotices(),/Copyright.*three\.js authors/);
    assert.match(runtimeNotices(),/Vite runtime helpers/);
    assert.doesNotMatch(runtimeNotices(),/Vercel Analytics/);
    assert.match(runtimeNotices({poki:false}),/Vercel Analytics/);
    unlinkSync(join(root,'THIRD_PARTY_NOTICES.txt'));assert.throws(()=>inspectPokiBuild(root),/Missing runtime license/);
});
