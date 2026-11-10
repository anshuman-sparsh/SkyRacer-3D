/** SDK state is independent of the game's run state. No ad frequency timers. */
export class PokiAdapter {
    constructor({ sdk = null, onBlocked = () => {} } = {}) {
        this.sdk = sdk;
        this.onBlocked = onBlocked;
        this.ready = false;
        this.loaded = false;
        this.playing = false;
        this.hasPlayed = false;
        this.blocked = false;
        this.generation = 0;
        this.disposed = false;
    }
    async init() {
        try { await this.sdk?.init(); this.ready = Boolean(this.sdk) && !this.disposed && !this.startupFailed; }
        catch { this.ready = false; }
    }
    call(method) {
        if (!this.ready || this.disposed) return;
        try { this.sdk[method]?.(); } catch { /* SDK failure must not end a flight. */ }
    }
    loadingFinished() {
        if (this.loaded || this.blocked) return;
        this.loaded = true;
        this.call('gameLoadingFinished');
    }
    transition(state) {
        if (this.blocked || this.disposed) return;
        const playing = state === 'running';
        if (playing === this.playing) return;
        if (playing && !this.loaded) return;
        this.playing = playing;
        if (playing) this.hasPlayed = true;
        this.call(playing ? 'gameplayStart' : 'gameplayStop');
    }
    cancelPending() { this.generation++; }
    async beforeGameplay(isValid = () => true) {
        if (this.blocked || this.disposed || this.playing) return false;
        const generation = this.generation;
        if (this.hasPlayed && this.ready) {
            this.blocked = true;
            this.onBlocked(true);
            try { await this.sdk.commercialBreak(() => {}); }
            catch { /* Unavailable ads still allow the player's next flight. */ }
            finally { this.blocked = false; this.onBlocked(false); }
        }
        return !this.disposed && generation === this.generation && isValid();
    }
    dispose() { this.cancelPending(); this.transition('stopped'); this.disposed = true; }
}

/** Only startup is bounded. Never time out an ad and resume underneath it. */
export async function initializeSdk(adapter, { doc = document, win = window, timeoutMs = 4000 } = {}) {
    let timer;
    const script = doc.querySelector('[data-poki-sdk]');
    let onLoad, onError;
    try {
        const initialization = (async () => {
            if (!win.PokiSDK && script) await new Promise((resolve, reject) => {
                onLoad = resolve; onError = reject;
                script.addEventListener('load', onLoad, { once: true });
                script.addEventListener('error', onError, { once: true });
            });
            adapter.sdk = win.PokiSDK ?? null;
            if (!adapter.startupFailed) await adapter.init();
        })();
        await Promise.race([initialization, new Promise((_, reject) => {
            timer = setTimeout(() => reject(Error('SDK startup unavailable')), timeoutMs);
        })]);
    } catch {
        // Invalidate late initialization rather than emitting events mid-flight.
        adapter.startupFailed = true;
        adapter.ready = false;
    } finally {
        clearTimeout(timer);
        script?.removeEventListener('load', onLoad);
        script?.removeEventListener('error', onError);
    }
    // Failed initialization is a playable no-SDK session.
    if (adapter.startupFailed) adapter.sdk = null;
}
