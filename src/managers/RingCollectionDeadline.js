export const RING_GRACE_SECONDS = 20;
export const RING_WARNING_SECONDS = 10;
export const RING_DEADLINE_SECONDS = RING_GRACE_SECONDS + RING_WARNING_SECONDS;

/**
 * Tracks active gameplay time since the last collected ring.
 * Call advance() only while a run is running, never while paused or on a menu.
 */
export class RingCollectionDeadline {
    constructor() {
        this.reset();
    }

    reset() {
        this.secondsWithoutRing = 0;
    }

    /**
     * A collected ring wins over expiration on the same frame.
     * Returns true when the run has exhausted its 30-second allowance.
     */
    advance(delta, collectedRings = 0) {
        if (collectedRings > 0) {
            this.reset();
            return false;
        }

        if (Number.isFinite(delta) && delta > 0) {
            this.secondsWithoutRing = Math.min(
                RING_DEADLINE_SECONDS,
                this.secondsWithoutRing + delta,
            );
        }

        return this.expired;
    }

    get expired() {
        return this.secondsWithoutRing >= RING_DEADLINE_SECONDS;
    }

    /** Null during the initial 20 seconds; then 10, 9, …, 1. */
    get countdownSeconds() {
        if (this.secondsWithoutRing < RING_GRACE_SECONDS || this.expired) return null;
        return Math.ceil(RING_DEADLINE_SECONDS - this.secondsWithoutRing);
    }
}
