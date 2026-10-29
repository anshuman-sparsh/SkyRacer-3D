// Deterministic, versioned UTC daily-course generator.
// Only layout consumes this RNG: decorative animation never changes placements.
export const DAILY_COURSE_VERSION = 1;
const UTC_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidUtcDate(value) {
    if (typeof value !== 'string' || !UTC_DATE.test(value)) return false;
    const date = new Date(value + 'T00:00:00.000Z');
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function utcChallengeDate(now = new Date()) {
    return now.toISOString().slice(0, 10);
}

export function nextUtcMidnight(date) {
    if (!isValidUtcDate(date)) throw new TypeError('Invalid UTC challenge date.');
    return Date.parse(date + 'T00:00:00.000Z') + 86_400_000;
}

export function formatCountdown(remainingMs) {
    const seconds = Math.max(0, Math.ceil(remainingMs / 1000));
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const rem = seconds % 60;
    return [hours, minutes, rem].map((v) => String(v).padStart(2, '0')).join(':');
}

export function createDailyRandom(date, version = DAILY_COURSE_VERSION) {
    if (!isValidUtcDate(date) || !Number.isSafeInteger(version) || version < 1 || version > 1000) {
        throw new TypeError('Invalid daily course identity.');
    }
    // Stable 32-bit FNV-1a hash over the challenge date plus generator version.
    const key = 'skyracer:daily:' + version + ':' + date;
    let state = 2166136261;
    for (let i = 0; i < key.length; i += 1) {
        state = Math.imul(state ^ key.charCodeAt(i), 16777619);
    }
    return () => {
        state = (state + 0x6D2B79F5) >>> 0;
        let x = state;
        x = Math.imul(x ^ (x >>> 15), x | 1);
        x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
        return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
}
