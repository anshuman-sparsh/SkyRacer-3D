import { defineConfig } from 'vite';

export default defineConfig({
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
        outDir: 'dist',
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
});
