import { DAILY_COURSE_VERSION, utcChallengeDate } from '../utils/DailyChallenge.js';
const KEY = 'local_progress_v1';
const empty = () => ({ totalRings: 0, totalDistance: 0, verifiedRuns: 0, daily: {}, dailyDates: [] });
const number = value => Number.isFinite(value) && value >= 0 ? value : 0;

/** Device-only milestones. Never submitted to any server or represented as verified. */
export class LocalProgress {
    constructor(storage, now = () => new Date()) {
        this.storage = storage;
        this.now = now;
        this.attempts = new Set();
        this.serial = 0;
        try {
            const saved = JSON.parse(storage.getItem(KEY) ?? 'null');
            this.data = { ...empty(), totalRings: Math.floor(number(saved?.totalRings)),
                totalDistance: number(saved?.totalDistance), verifiedRuns: Math.floor(number(saved?.verifiedRuns)),
                daily: saved?.daily && typeof saved.daily === 'object' ? saved.daily : {},
                dailyDates: Array.isArray(saved?.dailyDates) ? saved.dailyDates.filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d)) : [] };
        } catch { this.data = empty(); }
    }
    save() { try { this.storage.setItem(KEY, JSON.stringify(this.data)); } catch { /* Memory session continues. */ } }
    snapshot() {
        const d = this.data;
        const unlockedIds = ['cyan-striker', 'ember-striker'];
        if (d.totalRings >= 100) unlockedIds.push('silver-arrow');
        if (d.totalRings >= 500 && d.totalDistance >= 10000) unlockedIds.push('voidrunner');
        if (d.totalRings >= 1500 && d.totalDistance >= 25000) unlockedIds.push('nova-vortex');
        return { ...d, daily: undefined, dailyDates: undefined, unlockedIds,
            friendWins: 0, dailyCompletions: d.dailyDates.length, local: true };
    }
    recordFlight({ rings, distance }) {
        this.data.totalRings += Math.floor(number(rings));
        this.data.totalDistance += number(distance);
        this.data.verifiedRuns++;
        this.save();
    }
    beginDaily() {
        const run = { runId: 'local-' + (++this.serial), date: utcChallengeDate(this.now()),
            courseVersion: DAILY_COURSE_VERSION, nickname: 'This device', submitted: false, local: true };
        // Only one Daily flight can be active in the shared engine.
        this.attempts.clear();
        this.attempts.add(run);
        return run;
    }
    dailyKey(run) { return `${run.courseVersion}:${run.date}`; }
    today() {
        const date = utcChallengeDate(this.now());
        const score = number(this.data.daily[`${DAILY_COURSE_VERSION}:${date}`]);
        return { date, courseVersion: DAILY_COURSE_VERSION, serverNow: this.now().toISOString(),
            entries: [], me: score ? { score } : null, nickname: 'This device', local: true };
    }
    finishDaily(run, result) {
        if (!this.attempts.has(run) || run.submitted) throw Error('This local attempt is no longer available.');
        const score = Math.floor(number(result.score));
        if (!score) throw Error('Finish a flight to save a local score.');
        this.attempts.delete(run);
        run.submitted = true;
        const key = this.dailyKey(run);
        const before = number(this.data.daily[key]);
        this.data.daily[key] = Math.max(before, score);
        if (!this.data.dailyDates.includes(run.date)) this.data.dailyDates.push(run.date);
        const keys = Object.keys(this.data.daily).sort();
        for (const old of keys.slice(0, -90)) delete this.data.daily[old];
        this.save();
        return { accepted: true, personalBest: this.data.daily[key], isNewBest: score > before, local: true };
    }
}
