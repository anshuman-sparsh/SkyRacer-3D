/** One reusable text channel; no particles, audio contexts, queues, or rewards. */
export class FlightFeedback {
    constructor() { this.beginFlight(); }
    beginFlight() { this.message = ''; this.remaining = 0; this.nearMisses = 0; }
    collection(energy, surge, speedLevels, ringBonus) {
        const total = energy + surge;
        if (!(total > 0)) return;
        const pickup = energy && surge ? 'BLUE + PINK RINGS' : surge ? 'PINK RING · SURGE' : 'BLUE RING · ENERGY BOOST';
        this.message = pickup + ` · +${(total * ringBonus).toLocaleString()} · TIMER RESET`
            + (speedLevels > 0 ? ' · CRUISE SPEED UP' : '');
        this.remaining = 2.2;
    }
    nearMiss(count) {
        if (!(count > 0)) return;
        this.nearMisses += count;
        // Never obscure a pickup with a less important avoidance message.
        if (this.remaining > 0) return;
        this.message = 'BARRIER CLEARED · NICE RECOVERY';
        this.remaining = 1.8;
    }
    advance(delta) {
        this.remaining = Math.max(0, this.remaining - (Number.isFinite(delta) ? Math.max(0, delta) : 0));
        return this.remaining > 0 ? this.message : '';
    }
}
