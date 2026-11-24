import { readFileSync } from 'node:fs';

/** Preserve the notices for shipped engine and Vite runtime helpers. */
export function runtimeNotices({ poki = true } = {}) {
    const read = path => readFileSync(new URL('../node_modules/'+path,import.meta.url),'utf8').replaceAll('\r\n','\n').trim();
    const notices = ['THIRD-PARTY RUNTIME NOTICES', 'Three.js\n\n'+read('three/LICENSE'),
        'Vite runtime helpers\n\n'+read('vite/LICENSE.md').split('\n# Licenses of bundled dependencies')[0].trim()];
    if (!poki) notices.push('Vercel Analytics\n\n'+read('@vercel/analytics/LICENSE'));
    return notices.join('\n\n----------------------------------------\n\n')+'\n';
}
