const KEY = 'practice_objectives_v1';
const MAX_COMPLETIONS = 999999;
const GOALS = [
    { metric: 'rings', targets: [3, 6, 10], unit: 'rings', verb: 'Collect' },
    { metric: 'seconds', targets: [30, 60, 90], unit: 'seconds', verb: 'Fly for' },
    { metric: 'score', targets: [3000, 6000, 10000], unit: 'points', verb: 'Reach' },
];
const count = value => Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;

/** Personal practice only: never grants score, equipment, or verified credit. */
export class FlightObjectives {
    constructor(storage) {
        this.storage = storage;
        this.completed = 0;
        try {
            const saved = JSON.parse(storage?.getItem(KEY) ?? 'null');
            if (Number.isInteger(saved?.completed) && saved.completed >= 0 && saved.completed <= MAX_COMPLETIONS) {
                this.completed = saved.completed;
            }
        } catch { /* Practice continues in memory when storage is unavailable. */ }
        this.active = false;
        this.prepare();
    }
    prepare() {
        this.active = false;
        const definition = GOALS[this.completed % GOALS.length];
        this.goal = { ...definition, target: definition.targets[Math.min(2, Math.floor(this.completed / GOALS.length))] };
        this.goalLabel = `${this.goal.verb} ${this.goal.target.toLocaleString()} ${this.goal.unit} in one flight`;
        this.value = 0;
        this.hintRemaining = 4;
        this.result = null;
    }
    beginFlight() { this.prepare(); this.active = true; }
    observe(metrics) {
        if (!this.active) return;
        const wasComplete = this.complete;
        this.value = Math.max(this.value, Math.min(this.goal.target, count(metrics[this.goal.metric])));
        if (!wasComplete && this.complete) this.hintRemaining = 4;
    }
    get complete() { return this.value >= this.goal.target; }
    get label() { return this.goalLabel; }
    get progress() { return `${this.value.toLocaleString()} / ${this.goal.target.toLocaleString()} ${this.goal.unit}`; }
    /** Exposure advances only when the existing coach slot is available. */
    hint(delta) {
        if (!this.active || this.hintRemaining <= 0) return '';
        this.hintRemaining = Math.max(0, this.hintRemaining - Math.min(.25, countDelta(delta)));
        // A static hint avoids live-region chatter as score/time changes each frame.
        return this.complete ? 'PERSONAL GOAL COMPLETE · NICE FLYING' : this.label;
    }
    finish(metrics) {
        if (!this.active) return this.result;
        this.observe(metrics);
        this.active = false;
        if (this.complete) {
            this.completed = Math.min(MAX_COMPLETIONS, this.completed + 1);
            try { this.storage?.setItem(KEY, JSON.stringify({ completed: this.completed })); } catch { /* Session memory remains usable. */ }
        }
        const left = this.goal.target - this.value;
        this.result = {
            label: this.label, progress: this.progress, ratio: this.value / this.goal.target,
            complete: this.complete, completed: this.completed,
            text: this.complete ? 'Goal complete · A new personal goal is ready for your next flight.'
                : (this.value / this.goal.target >= .8 ? 'SO CLOSE · ' : '')
                    + `${left.toLocaleString()} ${this.goal.unit} to go · Try this goal again next flight.`,
        };
        return this.result;
    }
}

const countDelta = delta => Number.isFinite(delta) && delta > 0 ? delta : 0;
