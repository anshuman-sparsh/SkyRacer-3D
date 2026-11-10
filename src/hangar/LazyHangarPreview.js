/** Load optional preview code on intent, without creating a context after close. */
export class LazyHangarPreview {
    constructor(host, load = () => import('./HangarPreview.js')) {
        this.host = host; this.load = load; this.viewer = null; this.pending = null;
        this.generation = 0; this.disposed = false;
    }
    async open(id) {
        if (this.disposed) return;
        this.id = id;
        const generation = ++this.generation;
        this.host.classList.add('is-loading');
        try {
            this.pending ??= this.load();
            const { HangarPreview } = await this.pending;
            if (this.disposed || generation !== this.generation) return;
            this.viewer ??= new HangarPreview(this.host);
            this.viewer.open(this.id);
        } catch {
            this.pending = null;
            if (generation === this.generation && !this.disposed) this.host.classList.add('is-fallback');
        } finally {
            if (generation === this.generation) this.host.classList.remove('is-loading');
        }
    }
    setAircraft(id) { this.id = id; this.viewer?.setAircraft(id); }
    resize() { this.viewer?.resize(); }
    close() { this.generation++; this.host.classList.remove('is-loading'); this.viewer?.close(); }
    dispose() { this.close(); this.disposed = true; this.viewer?.dispose(); this.viewer = null; }
}
