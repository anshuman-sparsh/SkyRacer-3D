/**
 * Best-effort, privacy-conscious gameplay telemetry.
 * Runs outside the animation loop. It never delays gameplay or affects scores.
 * Existing anonymous Supabase auth is reused by the injected transport.
 */
const SESSION_KEY = 'skyracer_analytics_session_v1';
const RUN_COUNT_KEY = 'skyracer_analytics_runs_v1';
const MAX_QUEUED_EVENTS = 24;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MODES = new Set(['classic', 'practice', 'daily', 'friend']);

function createUuid() {
    const crypto = globalThis.crypto;
    if (typeof crypto?.randomUUID === 'function') return crypto.randomUUID();
    if (typeof crypto?.getRandomValues !== 'function') return null;
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
    return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16),
        hex.slice(16, 20), hex.slice(20)].join('-');
}

export class GameplayAnalyticsService {
    constructor({
        submitEvent = null,
        storage,
        uuidFactory = createUuid,
        schedule = (fn) => setTimeout(fn, 0),
    } = {}) {
        this.submitEvent = typeof submitEvent === 'function' ? submitEvent : null;
        if (storage === undefined) {
            try { storage = globalThis.sessionStorage ?? null; }
            catch { storage = null; }
        }
        this.storage = storage;
        this.uuidFactory = uuidFactory;
        this.schedule = schedule;
        this.queue = [];
        this.scheduled = false;
        this.flushing = false;
        this.closed = false;
        this.sessionId = this.#read(SESSION_KEY);
        if (!UUID.test(this.sessionId ?? '')) {
            this.sessionId = this.#newId();
            if (this.sessionId) this.#write(SESSION_KEY, this.sessionId);
        }
        const savedCount = Number(this.#read(RUN_COUNT_KEY));
        this.runCount = Number.isSafeInteger(savedCount) && savedCount >= 0
            ? Math.min(savedCount, 1_000_000) : 0;
    }

    #newId() {
        try {
            const id = this.uuidFactory();
            return typeof id === 'string' && UUID.test(id) ? id : null;
        } catch { return null; }
    }

    #read(key) {
        try { return this.storage?.getItem(key) ?? null; }
        catch { return null; }
    }

    #write(key, value) {
        try { this.storage?.setItem(key, String(value)); }
        catch { /* Blocked storage must never interrupt gameplay. */ }
    }

    #enqueue(eventName, mode, details = {}) {
        if (this.closed || !this.submitEvent || !this.sessionId || !MODES.has(mode)
            || this.queue.length >= MAX_QUEUED_EVENTS) return;
        const eventId = this.#newId();
        if (!eventId) return;
        this.queue.push({
            eventId, sessionId: this.sessionId, eventName, mode, ...details,
        });
        if (this.scheduled || this.flushing) return;
        this.scheduled = true;
        try {
            this.schedule(() => {
                this.scheduled = false;
                void this.flush();
            });
        } catch {
            this.scheduled = false;
            this.queue.length = 0;
        }
    }

    /** Counts genuine new runs only, never resumes from pause. */
    trackRunStart(mode = 'classic') {
        if (!MODES.has(mode) || this.closed) return;
        this.runCount = Math.min(this.runCount + 1, 1_000_000);
        this.#write(RUN_COUNT_KEY, this.runCount);
        this.#enqueue('game_start', mode);
        if (this.runCount === 2) this.#enqueue('second_run', mode);
        if (mode === 'daily') this.#enqueue('daily_challenge_played', mode);
    }

    trackRunEnd({ mode = 'classic', score, rings, distance, durationSeconds, reason }) {
        if (!MODES.has(mode)) return;
        this.#enqueue('game_over', mode, {
            score, rings, distance, durationSeconds, reason,
        });
    }

    /** Call only after a share sheet opens or a link is successfully copied. */
    trackChallengeShared(mode = 'classic') {
        if (mode === 'practice') return;
        this.#enqueue('challenge_shared', mode);
    }

    /** Public for tests and pagehide; network work remains async and optional. */
    async flush() {
        if (this.flushing || !this.submitEvent) return;
        this.flushing = true;
        try {
            while (this.queue.length) {
                const event = this.queue.shift();
                try { await this.submitEvent(event); }
                catch { /* Analytics is nonessential: do not retry endlessly. */ }
            }
        } finally {
            this.flushing = false;
        }
    }

    dispose() {
        this.closed = true;
        // Already queued requests can finish via fetch's keepalive option.
        void this.flush();
    }
}
