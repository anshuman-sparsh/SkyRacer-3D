import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, relative, dirname, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { deflateRawSync, inflateRawSync } from 'node:zlib';
import assert from 'node:assert/strict';
import { inspectPokiBuild, releaseFiles } from './check-poki-build.js';

const hash = buffer => createHash('sha256').update(buffer).digest('hex');
export function crc32(bytes) {
    let crc = 0xffffffff;
    for (const byte of bytes) {
        crc ^= byte;
        for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    return (crc ^ 0xffffffff) >>> 0;
}

/** Minimal ZIP32: UTF-8 names, deflate, fixed 1980 timestamps, no extra files. */
export function createReleaseArchive(entries) {
    assert.ok(entries.length > 0 && entries.length < 65536);
    const local = [], central = [], seen = new Set();
    let offset = 0;
    for (const { name, data } of entries) {
        assert.ok(!seen.has(name) && !name.startsWith('/') && !name.includes('\\')
            && name.split('/').every(part => part && part !== '.' && part !== '..') && !name.includes(':'), 'Unsafe or duplicate ZIP entry');
        seen.add(name);
        const filename = Buffer.from(name), compressed = deflateRawSync(data,{level:9}), checksum = crc32(data);
        assert.ok(filename.length < 65536 && data.length < 0xffffffff && offset + compressed.length + 30 + filename.length < 0xffffffff);
        assert.ok(inflateRawSync(compressed).equals(data), 'Compression round-trip failed');
        const header = Buffer.alloc(30);
        header.writeUInt32LE(0x04034b50);header.writeUInt16LE(20,4);header.writeUInt16LE(0x800,6);
        header.writeUInt16LE(8,8);header.writeUInt16LE(0x21,12);header.writeUInt32LE(checksum,14);
        header.writeUInt32LE(compressed.length,18);header.writeUInt32LE(data.length,22);header.writeUInt16LE(filename.length,26);
        local.push(header,filename,compressed);
        const record = Buffer.alloc(46);
        record.writeUInt32LE(0x02014b50);record.writeUInt16LE(20,4);record.writeUInt16LE(20,6);
        record.writeUInt16LE(0x800,8);record.writeUInt16LE(8,10);record.writeUInt16LE(0x21,14);
        record.writeUInt32LE(checksum,16);record.writeUInt32LE(compressed.length,20);record.writeUInt32LE(data.length,24);
        record.writeUInt16LE(filename.length,28);record.writeUInt32LE(offset,42);
        central.push(record,filename);offset += header.length + filename.length + compressed.length;
    }
    const directory = Buffer.concat(central), end = Buffer.alloc(22);
    assert.ok(offset + directory.length < 0xffffffff);
    end.writeUInt32LE(0x06054b50);end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);
    end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);
    return Buffer.concat([...local,directory,end]);
}

export function packagePokiBuild(directory = 'dist-poki', output = 'artifacts/poki-release/skyracer-poki-rc.zip') {
    const summary = inspectPokiBuild(directory); // Default offline policy; no approval inferred from environment.
    const root = resolve(directory), destination = resolve(output), inside = relative(root,destination);
    assert.ok((inside.startsWith('..') || isAbsolute(inside)) && destination.endsWith('.zip'), 'ZIP must be outside the release folder');
    const entries = releaseFiles(root).map(file => ({name:relative(root,file).replaceAll('\\','/'),data:readFileSync(file)}));
    const archive = createReleaseArchive(entries);
    mkdirSync(dirname(destination),{recursive:true});writeFileSync(destination,archive);
    assert.equal(hash(readFileSync(destination)),hash(archive), 'Archive write integrity failed');
    const manifest = { ...summary, archiveBytes:archive.length, archiveSha256:hash(archive),
        entries:entries.map(({name,data})=>({path:name,bytes:data.length,sha256:hash(data)})) };
    writeFileSync(destination.replace(/\.zip$/,'.manifest.json'),JSON.stringify(manifest,null,2)+'\n');
    return manifest;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const { entries, ...summary } = packagePokiBuild();console.log('Poki release package:',summary);
}
