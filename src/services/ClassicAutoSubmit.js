// Classic-only automatic personal-best submission. A completed, server-registered
// run is kept locally until the backend accepts it or rules it ineligible.
// A stored run cannot bypass backend run ownership, score checks or nickname rules.
export const CLASSIC_PENDING_KEY = 'skyracer_classic_pending_v1';
const MAX_PENDING_AGE_MS = 6 * 60 * 60 * 1000;
const NICKNAME = /^[A-Za-z0-9_]{3,16}$/;
const RUN_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validPending(value, now) {
    return value && RUN_ID.test(value.runId)
        && Number.isSafeInteger(value.score) && value.score > 0
        && Number.isInteger(value.rings) && value.rings >= 0
        && Number.isFinite(value.distance) && value.distance >= 0
        && Number.isFinite(value.savedAt) && value.savedAt <= now
        && now - value.savedAt < MAX_PENDING_AGE_MS;
}

export class ClassicAutoSubmit {
    constructor({ leaderboard, storage = null, onStatus = () => {}, now = () => Date.now() }) {
        this.leaderboard = leaderboard;
        this.storage = storage ?? leaderboard.storage;
        this.onStatus = onStatus;
        this.now = now;
        this.pending = this.#restore();
        this.busy = false;
        this.status = 'idle';
    }

    #persist() {
        try {
            if (this.pending) this.storage?.setItem(CLASSIC_PENDING_KEY, JSON.stringify(this.pending));
            else this.storage?.removeItem(CLASSIC_PENDING_KEY);
        } catch { /* Keep the current run in memory if storage is blocked. */ }
    }

    #restore() {
        try {
            const raw = this.storage?.getItem(CLASSIC_PENDING_KEY);
            const candidate = raw ? JSON.parse(raw) : null;
            if (validPending(candidate, this.now())) return candidate;
            if (raw) this.storage?.removeItem(CLASSIC_PENDING_KEY);
        } catch { /* Invalid or unavailable local storage. */ }
        return null;
    }

    #emit(status, message, rank = null) {
        this.status = status;
        this.onStatus({ status, message, rank, pending: this.pending });
    }

    async completedRun({ runPromise, score, rings, distance }) {
        if (!this.leaderboard.enabled || !Number.isSafeInteger(score) || score <= 0) return;
        this.#emit('checking', 'Checking your Classic personal best…');
        let runId;
        try { runId = await runPromise; }
        catch { runId = null; }
        if (!RUN_ID.test(runId ?? '')) {
            this.#emit('unavailable', 'This flight could not be registered online. Your local score is safe, but it cannot be submitted.');
            return;
        }
        const candidate = { runId, score, rings, distance, savedAt: this.now() };
        if (!validPending(candidate, this.now())) {
            this.#emit('unavailable', 'This run cannot be submitted online.');
            return;
        }
        if (!this.pending || this.pending.score < score) {
            this.pending = candidate;
            this.#persist();
        }
        return this.process();
    }

    async resume() {
        if (!this.pending) return;
        return this.process();
    }

    async submitNickname(name) {
        if (!this.pending) return;
        const nickname = String(name ?? '').trim();
        if (!NICKNAME.test(nickname)) {
            this.#emit('needs-name', 'Enter a unique nickname (3–16 letters, numbers or underscores).');
            return;
        }
        this.pending.nickname = nickname;
        this.#persist();
        return this.process();
    }

    async process() {
        if (this.busy || !this.pending || !this.leaderboard.enabled) return;
        if (!validPending(this.pending, this.now())) {
            this.pending = null;
            this.#persist();
            this.#emit('expired', 'This pending flight has expired online. Your local score is still saved.');
            return;
        }
        this.busy = true;
        const candidate = this.pending;
        this.#emit('checking', 'Checking the online personal best…');
        try {
            const snapshot = await this.leaderboard.getLeaderboard();
            if (this.pending !== candidate) return;
            const best = snapshot?.me ? Number(snapshot.me.score) : null;
            if (best !== null && candidate.score <= best) {
                this.pending = null;
                this.#persist();
                this.#emit(candidate.score === best ? 'already-saved' : 'not-best',
                    candidate.score === best ? 'Your personal best is already on the leaderboard.'
                        : 'Your previous online personal best remains higher.');
                return;
            }
            const registered = typeof snapshot?.me?.nickname === 'string'
                ? snapshot.me.nickname : null;
            const nickname = registered ?? candidate.nickname ?? this.leaderboard.getNickname();
            if (!NICKNAME.test(nickname ?? '')) {
                this.#emit('needs-name', 'New personal best! Choose your permanent pilot nickname to save it.');
                return;
            }
            this.#emit('submitting', 'Saving your new personal best automatically…');
            const result = await this.leaderboard.finishRun({
                runId: candidate.runId, nickname, score: candidate.score,
                rings: candidate.rings, distance: candidate.distance,
            });
            if (!result?.accepted) throw new Error('The leaderboard did not accept this run.');
            if (this.pending === candidate) {
                this.pending = null;
                this.#persist();
            }
            this.#emit('saved', 'New personal best saved to the global leaderboard!');
        } catch (error) {
            if (this.pending !== candidate) return;
            const message = String(error?.message ?? 'Leaderboard temporarily unavailable.');
            if (/nickname.*taken|nickname.*registered|registered as|nickname.*locked/i.test(message)) {
                // Server-side registration or unique-name enforcement wins over cached names.
                this.pending.nickname = null;
                this.#persist();
                this.#emit('needs-name', message);
            } else {
                this.#emit('failed', 'Score pending: ' + message + ' Retry before the registered run expires.');
            }
        } finally {
            this.busy = false;
        }
    }
}
