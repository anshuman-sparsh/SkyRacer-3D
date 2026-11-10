import { defineConfig, loadEnv } from 'vite';
import { fileURLToPath } from 'node:url';
import { buildPolicy, pokiHtml } from './src/platform/BuildPolicy.js';

export default defineConfig(({ mode }) => {
    const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env };
    const policy = buildPolicy(mode, env);
    const source = name => fileURLToPath(new URL('./src/platform/' + name, import.meta.url));
    return {
    resolve: { alias: {
        '#platform': source(policy.poki ? 'poki.js' : 'web.js'),
        '#game-services': source(policy.localOnly ? 'local-services.js'
            : policy.poki ? 'poki-online-services.js' : 'web-services.js'),
        '#friend-panel': policy.poki ? source('poki-friend-panel.js')
            : fileURLToPath(new URL('./src/ui/FriendChallengePanel.js', import.meta.url)),
    } },
    define: { __POKI_LOCAL_ONLY__: JSON.stringify(policy.localOnly),
        __POKI_PRIVACY_URL__: JSON.stringify(policy.privacyUrl) },
    plugins: [{ name: 'skyracer-platform', generateBundle(_, bundle) {
        if (!policy.poki) return;
        const forbidden = ['@vercel/analytics', 'GameplayAnalyticsService.js', 'CollisionDebug.js'];
        if (policy.localOnly) forbidden.push('services/LeaderboardService.js', 'services/ClassicAutoSubmit.js',
            'services/DailyChallengeService.js', 'services/FriendChallengeService.js', 'ui/FriendChallengePanel.js');
        for (const output of Object.values(bundle)) {
            if (output.type !== 'chunk') continue;
            for (const [name, info] of Object.entries(output.modules)) {
                if (info.renderedLength > 0 && forbidden.some(part => name.replaceAll('\\', '/').includes(part))) {
                    throw Error('Forbidden dependency in Poki build: ' + name);
                }
            }
        }
    }, transformIndexHtml: {
        order: 'pre', handler: html => pokiHtml(html, policy),
    } }],
    // Relative base keeps asset URLs portable across Vercel preview and production
    // deployments, which are served from different hostnames.
    base: './',
    server: {
        host: '127.0.0.1',
        port: 5173,
    },
    preview: {
        host: '127.0.0.1',
        port: 4173,
    },
    build: {
        outDir: policy.poki ? 'dist-poki' : 'dist',
        copyPublicDir: !policy.poki,
        assetsDir: 'assets',
        target: 'es2020',
        sourcemap: false,
        emptyOutDir: true,
        // Three.js alone exceeds the default 500 kB warning threshold; the raised
        // limit keeps genuine regressions visible without a permanent false alarm.
        chunkSizeWarningLimit: 900,
        rollupOptions: {
            output: {
                // Splitting the engine out lets the browser cache it across deploys
                // while the much smaller game bundle changes.
                manualChunks: { three: ['three'] },
            },
        },
    },
};
});
