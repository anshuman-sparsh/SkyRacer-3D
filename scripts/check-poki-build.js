import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

export function inspectPokiBuild(directory = 'dist-poki', { online = false } = {}) {
    const root = resolve(directory);
    const walk = dir => readdirSync(dir).flatMap(name => {
        const path = join(dir, name);
        return statSync(path).isDirectory() ? walk(path) : [path];
    });
    const files = walk(root);
    const html = readFileSync(join(root, 'index.html'), 'utf8');
    assert.match(html, /data-platform="poki"/);
    assert.equal((html.match(/https:\/\/game-cdn\.poki\.com\/scripts\/v2\/poki-sdk\.js/g) ?? []).length, 1);
    assert.doesNotMatch(html, /fonts\.google|fonts\.gstatic|href="\/(?!\/)|src="\/(?!\/)/);
    for (const match of html.matchAll(/(?:src|href)="(\.\/[^"?#]+)"/g)) {
        assert.ok(existsSync(resolve(root, match[1])), 'Missing bundled asset: ' + match[1]);
    }
    const text = files.filter(p => /\.(js|css|html)$/.test(p)).map(p => readFileSync(p, 'utf8')).join('\n');
    assert.doesNotMatch(text, /fonts\.googleapis|fonts\.gstatic|_vercel\/insights|va\.vercel-scripts|debugHitboxes/);
    if (!online) assert.doesNotMatch(text, /supabase\.co|\/auth\/v1\/|\/functions\/v1\/|\/api\/country|skyracer_lb_session_v1|skyracer_classic_pending_v1/);
    assert.ok(!files.some(p => /\.(map|test\.js|sql)$/.test(p)), 'Publication output contains development artifacts');
    return { files: files.length, bytes: files.reduce((sum, file) => sum + statSync(file).size, 0) };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    console.log('Poki build integrity:', inspectPokiBuild('dist-poki', { online: process.env.POKI_ONLINE_APPROVED === 'true' }));
}
