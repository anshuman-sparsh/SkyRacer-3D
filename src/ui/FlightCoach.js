const KEY = 'flight_coach_v1';
const STEPS = ['steer', 'rings', 'hazard', 'boost'];
const COMPLETE = 15;

/** Short, non-blocking hints. Only active flying advances exposure time. */
export class FlightCoach {
    constructor(storage, touch = false, { experienced = false } = {}) {
        this.storage = storage;
        this.touch = touch;
        this.seen = 0;
        let restored = false;
        try {
            const raw = storage?.getItem(KEY);
            const value = Number(raw);
            if (raw != null && raw !== '' && Number.isInteger(value) && value >= 0 && value <= COMPLETE) {
                this.seen = value; restored = true;
            }
        } catch { /* Session guidance still works. */ }
        if (!restored) {
            if (experienced) this.seen = COMPLETE;
            try { storage?.setItem(KEY, String(this.seen)); } catch { /* Memory-only session. */ }
        }
        this.beginFlight();
    }
    beginFlight() { this.current = null; this.elapsed = 0; }
    get completed() { return this.seen === COMPLETE; }
    mark(id) {
        this.seen |= 1 << STEPS.indexOf(id);
        try { this.storage?.setItem(KEY, String(this.seen)); } catch { /* Keep session completion. */ }
    }
    advance(delta, { steering = false, boosting = false, rings = 0, hazardNear = false } = {}) {
        if (this.completed && !this.current) return null;
        const unseen = id => !(this.seen & (1 << STEPS.indexOf(id)));
        if (!this.current) {
            this.current = hazardNear && unseen('hazard') ? 'hazard' : STEPS.find(unseen);
            this.elapsed = 0;
        }
        if (!this.current) return null;
        this.elapsed += Number.isFinite(delta) ? Math.max(0, Math.min(delta, 0.25)) : 0;
        const id = this.current;
        const practiced = id === 'steer' ? steering : id === 'rings' ? rings > 0 : id === 'boost' ? boosting : false;
        if (this.elapsed >= 2.5 || (practiced && this.elapsed >= 1.5)) {
            this.mark(id); this.current = null;
        }
        const hints = {
            steer: this.touch ? ['↔ ↕', 'Drag to steer & change height'] : ['WASD / ↑↓←→', 'Steer & change height'],
            rings: ['○', 'Fly through blue / pink rings · 30 seconds per ring'],
            hazard: ['✕', 'Red-orange X rings & barriers end your flight'],
            boost: this.touch ? ['BOOST', 'Hold BOOST to go faster · release to stop'] : ['SPACE / SHIFT', 'Hold to boost · release to stop'],
        };
        return { id, icon: hints[id][0], text: hints[id][1] };
    }
}

export class FlightMilestones {
    beginFlight(previousBest = null) {
        this.previousBest = previousBest;
        this.rings = 0; this.recordShown = false; this.message = ''; this.remaining = 0;
    }
    constructor() { this.beginFlight(); }
    advance(delta, rings, score) {
        this.remaining = Math.max(0, this.remaining - Math.max(0, Number.isFinite(delta) ? delta : 0));
        const reached = [1, 5, 10, 25, 50, 100].filter(target => this.rings < target && rings >= target).at(-1);
        const record = !this.recordShown && this.previousBest > 0 && score > this.previousBest;
        if (record) this.recordShown = true;
        if (reached || record) {
            this.message = reached ? (reached === 1 ? 'FIRST RING · NICE FLYING' : reached + ' RINGS · KEEP GOING')
                : 'PREVIOUS BEST PASSED';
            this.remaining = 2.2;
        }
        this.rings = rings;
        return this.remaining > 0 ? this.message : '';
    }
}
