import { initializePlatform } from '#platform';

async function boot() {
    await initializePlatform();
    await import('./main.js');
}
void boot().catch(error => {
    console.error('[SkyRacer] Startup failed:', error);
    const status = document.querySelector('[data-loading-status]');
    status.hidden = false;
    status.textContent = 'Could not start the game. Please reload to try again.';
});
