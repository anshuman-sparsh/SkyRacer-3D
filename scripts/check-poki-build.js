import { readFileSync, readdirSync, lstatSync } from 'node:fs';
import { resolve, join, relative, dirname, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const SDK = 'https://game-cdn.poki.com/scripts/v2/poki-sdk.js';
export function releaseFiles(directory) {
    const root = resolve(directory);
    const walk = dir => readdirSync(dir).sort().flatMap(name => {
        const path = join(dir,name), info = lstatSync(path);
        assert.ok(!info.isSymbolicLink(), 'Release must not contain symbolic links: ' + name);
        return info.isDirectory() ? walk(path) : [path];
    });
    return walk(root);
}

/** Static evidence only; Inspector must verify actual browser network/events. */
export function inspectPokiBuild(directory = 'dist-poki', { online = false } = {}) {
    const root = resolve(directory), files = releaseFiles(root), inventory = new Set(files);
    assert.ok(inventory.has(join(root,'index.html')), 'Missing root index.html');
    assert.ok(inventory.has(join(root,'THIRD_PARTY_NOTICES.txt')), 'Missing runtime license notices');
    const notices = readFileSync(join(root,'THIRD_PARTY_NOTICES.txt'),'utf8');
    assert.ok(/three\.js authors/i.test(notices) && /permission notice shall be included/i.test(notices), 'Incomplete runtime license notices');
    const localAsset = (url, owner) => {
        url = url.replaceAll('&amp;','&');
        if (url.startsWith('data:')) return;
        assert.ok(!/^(?:[a-z][a-z\d+.-]*:|\/|\\)/i.test(url), 'Unapproved or nonportable asset: ' + url);
        const clean = decodeURIComponent(url.split(/[?#]/)[0]);
        const target = resolve(dirname(owner),clean), path = relative(root,target);
        assert.ok(path && !path.startsWith('..') && !isAbsolute(path), 'Asset escapes release: ' + url);
        assert.ok(inventory.has(target), 'Missing bundled asset: ' + url);
    };
    const html = readFileSync(join(root,'index.html'),'utf8');
    assert.match(html,/data-platform="poki"/);
    assert.equal((html.match(/https:\/\/game-cdn\.poki\.com\/scripts\/v2\/poki-sdk\.js/g) ?? []).length,1);
    assert.match(html,/<script\b[^>]*data-poki-sdk[^>]*>/);
    assert.doesNotMatch(html,/<base\b|<iframe\b|http-equiv=["']refresh|\bon[a-z]+=["']/i);
    for (const match of html.matchAll(/\b(?:src|href|action|poster)\s*=\s*["']([^"']+)["']/gi)) {
        if (match[1] !== SDK) localAsset(match[1],join(root,'index.html'));
    }
    for (const file of files) {
        const name = relative(root,file).replaceAll('\\','/');
        assert.ok((name === 'index.html' || name === 'THIRD_PARTY_NOTICES.txt' || /^assets\/[a-z\d_.-]+\.(?:js|css|png|jpe?g|webp|svg|ogg|mp3|wav|woff2?)$/i.test(name)) && !/\.(?:test|spec)\.js$/i.test(name),
            'Unexpected publication file: ' + name);
        if (!/\.(?:js|css|html)$/.test(file)) continue;
        const text = readFileSync(file,'utf8');
        if (file.endsWith('.js')) {
            for (const match of text.matchAll(/\b(?:from\s*|import\s*(?:\(\s*)?)["']([^"']+)["']/g)) localAsset(match[1],file);
            // Vite's preload map names deferred assets relative to HTML.
            for (const match of text.matchAll(/["'](assets\/[a-z\d_.-]+\.(?:js|css))["']/gi)) localAsset(match[1],join(root,'index.html'));
            assert.doesNotMatch(text,/\beval\s*\(|new Function\s*\(/, 'Release contains dynamic code evaluation');
        }
        if (file.endsWith('.css')) {
            for (const match of text.matchAll(/url\(\s*["']?([^\s"')]+)["']?\s*\)|@import\s+["']([^"']+)["']/gi)) localAsset(match[1]??match[2],file);
        }
        assert.ok(!/fonts\.googleapis|fonts\.gstatic|_vercel\/insights|va\.vercel-scripts|debugHitboxes|sb_secret_[a-z\d_]+|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i.test(text), 'Forbidden debug, tracking, external resource, or secret in ' + name);
        if (!online) assert.ok(!/supabase\.co|\/auth\/v1\/|\/functions\/v1\/|\/api\/country|skyracer_lb_session_v1|skyracer_classic_pending_v1/.test(text), 'Online service in offline release: ' + name);
    }
    return { files:files.length, bytes:files.reduce((sum,file)=>sum+lstatSync(file).size,0) };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    console.log('Poki build integrity:', inspectPokiBuild('dist-poki', { online: process.env.POKI_ONLINE_APPROVED === 'true' }));
}
