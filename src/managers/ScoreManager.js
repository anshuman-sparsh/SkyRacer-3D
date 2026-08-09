const HIGH_SCORE_KEY = 'skyracer_highscore';
const PERSIST_INTERVAL = 2;
const RINGS_PER_SPEED_LEVEL = 6;

/**
 * Reads persisted values defensively: localStorage throws in private-browsing
 * modes and sandboxed frames, and the stored value can be corrupted by hand, so
 * every failure path falls back to a zero high score instead of breaking boot.
 */
function readStoredHighScore() {
    try {
        const stored = window.localStorage.getItem(HIGH_SCORE_KEY);
        const parsed = Number.parseInt(stored ?? '', 10);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
    } catch {
        return 0;
    }
}

export class ScoreManager {
    constructor({ ringBonus = 500 } = {}) {
        this.distance = 0;
        this.currentVelocity = 0;
        this.ringsCollected = 0;
        this.score = 0;
        this.ringBonus = ringBonus;

        this.highScore = readStoredHighScore();
        this.isStorageAvailable = true;
        this.timeSincePersist = 0;
        this.hasUnsavedHighScore = false;
    }

    update(delta, velocity) {
        this.currentVelocity = Math.max(0, -velocity.z);
        const distanceStep = this.currentVelocity * delta;
        this.distance += distanceStep;
        this.score += distanceStep * 10;

        this.#trackHighScore();

        // The in-memory best updates every frame for the HUD, but writing to disk
        // is throttled: localStorage is synchronous and would stall the render loop
        // if it ran on all sixty frames per second.
        this.timeSincePersist += delta;
        if (this.hasUnsavedHighScore && this.timeSincePersist >= PERSIST_INTERVAL) {
            this.persistHighScore();
        }
    }

    #trackHighScore() {
        const current = this.currentScore;
        if (current <= this.highScore) return;

        this.highScore = current;
        this.hasUnsavedHighScore = true;
    }

    /** Flushes a pending best to localStorage. Safe to call at any time. */
    persistHighScore() {
        this.timeSincePersist = 0;
        if (!this.hasUnsavedHighScore || !this.isStorageAvailable) return;

        try {
            window.localStorage.setItem(HIGH_SCORE_KEY, String(this.highScore));
            this.hasUnsavedHighScore = false;
        } catch {
            // Storage is unavailable or full: keep the session best in memory and
            // stop retrying so the loop is not hammered with throwing calls.
            this.isStorageAvailable = false;
        }
    }

    getHighScore() {
        return this.highScore;
    }

    get isNewHighScore() {
        return this.currentScore > 0 && this.currentScore >= this.highScore;
    }

    /** Clears run statistics for a restart. The persisted best is retained. */
    reset() {
        this.persistHighScore();
        this.distance = 0;
        this.currentVelocity = 0;
        this.ringsCollected = 0;
        this.score = 0;
    }

    collectRings(count = 1) {
        const previousSpeedLevel = this.speedProgressionLevel;
        for (let index = 0; index < count; index += 1) {
            this.ringsCollected += 1;
            this.score += this.ringBonus;
        }
        this.#trackHighScore();
        return this.speedProgressionLevel - previousSpeedLevel;
    }

    get currentScore() {
        return Math.floor(this.score);
    }

    get speed() {
        return Math.round(this.currentVelocity);
    }

    /** One permanent cruise-speed level is earned for each six session rings. */
    get speedProgressionLevel() {
        return Math.floor(this.ringsCollected / RINGS_PER_SPEED_LEVEL);
    }
}
