// Registered Classic results remain local until accepted or proven ineligible.
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
        && (Number.isFinite(value.expiresAt) ? now < value.expiresAt
            : now - value.savedAt < MAX_PENDING_AGE_MS);
}

export class ClassicAutoSubmit {
    constructor({ leaderboard, storage = null, onStatus = () => {}, now = () => Date.now() }) {
        this.leaderboard = leaderboard;
        this.storage = storage ?? leaderboard.storage;
        this.onStatus = onStatus;
        this.now = now;
        this.candidates = this.#restore();
        this.busy = false;
        this.status = 'idle';
        this.completionVersion = 0;
        this.#persist();
    }

    get pending() { return this.candidates[0] ?? null; }

    #persist() {
        try {
            // Preserve the old top-level record; fallbacks survive expiry lookup failures.
            if (this.pending) this.storage?.setItem(CLASSIC_PENDING_KEY,
                JSON.stringify({ ...this.pending, queued: this.candidates.slice(1) }));
            else this.storage?.removeItem(CLASSIC_PENDING_KEY);
        } catch { /* In-memory retries still work when storage is blocked. */ }
    }

    #restore() {
        try {
            const raw = JSON.parse(this.storage?.getItem(CLASSIC_PENDING_KEY) ?? 'null');
            const seen = new Set();
            return [raw, ...(Array.isArray(raw?.queued) ? raw.queued : [])]
                .filter(candidate => {
                    if (!validPending(candidate, this.now()) || seen.has(candidate.runId)) return false;
                    seen.add(candidate.runId);
                    delete candidate.queued;
                    delete candidate.completionVersion; // Only meaningful within this page session.
                    return true;
                }).sort((a, b) => b.score - a.score);
        } catch { return []; }
    }

    #emit(status, message) {
        this.status = status;
        this.onStatus({ status, message, rank: null, pending: this.pending });
    }

    #emitEnded(candidate, status, message) {
        if (candidate.completionVersion === undefined || candidate.completionVersion === this.completionVersion) {
            this.#emit(status, message);
        }
    }

    #remove(candidate) {
        this.candidates = this.candidates.filter(item => item !== candidate);
        this.#persist();
    }

    #removeThrough(score) {
        this.candidates = this.candidates.filter(item => item.score > score);
        this.#persist();
    }

    async completedRun({ runPromise, score, rings, distance }) {
        if (!this.leaderboard.enabled || !Number.isSafeInteger(score) || score <= 0) return;
        const version = ++this.completionVersion;
        if (!this.pending) this.#emit('checking', 'Checking your Classic personal best…');
        let runId;
        try { runId = await runPromise; } catch { runId = null; }
        if (!RUN_ID.test(runId ?? '')) {
            if (version === this.completionVersion && !this.pending) {
                this.#emit('unavailable', 'This flight could not be registered online. Your local score is safe, but it cannot be submitted.');
            }
            return;
        }
        const candidate = { runId, score, rings, distance, savedAt: this.now(), completionVersion: version };
        if (!validPending(candidate, this.now())) return;
        this.candidates = this.candidates.filter(item => validPending(item, this.now()));
        if (!this.candidates.some(item => item.runId === runId)) this.candidates.push(candidate);
        this.candidates.sort((a, b) => b.score - a.score);
        this.#persist();
        return this.process();
    }

    async resume() { return this.process(); }

    async submitNickname(name) {
        if (!this.pending) return;
        const nickname = String(name ?? '').trim();
        if (!NICKNAME.test(nickname)) {
            this.#emit('needs-name', 'Enter a unique nickname (3–16 letters, numbers or underscores).');
            return;
        }
        // All queued flights share this player's permanent identity. Applying
        // the choice to fallbacks also lets a fresh flight proceed when an
        // older flight's expiration lookup is temporarily unavailable.
        this.candidates = this.candidates.map(candidate => ({ ...candidate, nickname }));
        this.#persist();
        return this.process();
    }

    async process() {
        if (this.busy || !this.pending || !this.leaderboard.enabled) return;
        this.busy = true;
        // Try each result at most once per trigger. A higher result with
        // unknown expiry must not make us lose a fresh lower result.
        const attempted = new Set();
        const next = () => this.candidates.find(item => !attempted.has(item));
        try {
            let candidate;
            while ((candidate = next())) {
                if (!validPending(candidate, this.now())) {
                    this.#remove(candidate);
                    if (!this.pending) this.#emitEnded(candidate, 'expired', 'This pending flight has expired online. Your local score is still saved.');
                    continue;
                }
                try {
                    if (!Number.isFinite(candidate.expiresAt)) {
                        const status = await this.leaderboard.getRunStatus(candidate.runId);
                        if (!Number.isFinite(status?.expiresAt)) throw Error('Could not verify this run’s expiration.');
                        candidate.expiresAt = status.expiresAt;
                        candidate.serverExpiresAt = status.serverExpiresAt;
                        this.#persist();
                    }
                    if (next() !== candidate) continue;
                    if (!validPending(candidate, this.now())) {
                        this.#remove(candidate);
                        if (!this.pending) this.#emitEnded(candidate, 'expired', 'This pending flight has expired online. Your local score is still saved.');
                        continue;
                    }
                    if (candidate === this.pending) this.#emitEnded(candidate, 'checking', 'Checking the online personal best…');
                    const snapshot = await this.leaderboard.getLeaderboard();
                    if (next() !== candidate) continue;
                    const best = snapshot?.me ? Number(snapshot.me.score) : null;
                    if (best !== null && candidate.score <= best) {
                        this.#removeThrough(best);
                        if (!this.pending) this.#emitEnded(candidate, candidate.score === best ? 'already-saved' : 'not-best',
                            candidate.score === best ? 'Your personal best is already on the leaderboard.' : 'Your previous online personal best remains higher.');
                        continue;
                    }
                    const nickname = snapshot?.profile?.nickname ?? snapshot?.me?.nickname ?? candidate.nickname;
                    if (!NICKNAME.test(nickname ?? '')) {
                        this.#emit('needs-name', 'New personal best! Choose your permanent pilot nickname to save it.');
                        break;
                    }
                    if (candidate === this.pending) this.#emit('submitting', 'Saving your new personal best automatically…');
                    const result = await this.leaderboard.finishRun({ runId: candidate.runId,
                        nickname, score: candidate.score, rings: candidate.rings, distance: candidate.distance });
                    if (!result?.accepted) throw Error('The leaderboard did not accept this run.');
                    this.#removeThrough(candidate.score);
                    if (!this.pending) this.#emit('saved', 'New personal best saved to the global leaderboard!');
                } catch (error) {
                    if (!this.candidates.includes(candidate)) continue;
                    if (error?.code === 'RUN_EXPIRED' || error?.code === 'RUN_UNAVAILABLE') {
                        this.#remove(candidate);
                        if (!this.pending) this.#emitEnded(candidate, 'expired', 'This pending flight is no longer available online. Your local score is still saved.');
                        continue;
                    }
                    attempted.add(candidate);
                    if (candidate !== this.pending) continue;
                    const message = String(error?.message ?? 'Leaderboard temporarily unavailable.');
                    if (/nickname.*taken|nickname.*registered|registered as|nickname.*locked/i.test(message)) {
                        candidate.nickname = null;
                        this.#persist();
                        this.#emit('needs-name', message);
                        break;
                    }
                    this.#emit('failed', 'Score pending: ' + message + ' Retry before the registered run expires.');
                }
            }
        } finally { this.busy = false; }
    }
}
