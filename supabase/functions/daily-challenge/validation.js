// Pure M3 validation shared by Edge Function and Node tests.
// Like Classic, anti-cheat is plausibility-based, not proof of browser physics.
export const DAILY_COURSE_VERSION = 1;
export const DAILY_GRACE_MS = 5 * 60 * 1000;
export const MAX_DAILY_RUN_SECONDS = 60 * 60;
export const RUN_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const NICKNAME = /^[A-Za-z0-9_]{3,16}$/;

export function isPlausibleDailyResult(input, elapsedSeconds) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return false;
    const { score, rings, distance } = input;
    if (!Number.isSafeInteger(score) || score < 1 || score > 2147483647) return false;
    if (!Number.isSafeInteger(rings) || rings < 0 || rings > 100000) return false;
    if (typeof distance !== 'number' || !Number.isFinite(distance)
        || distance < 0 || distance > 1e8) return false;
    if (!Number.isFinite(elapsedSeconds)
        || elapsedSeconds < 2 || elapsedSeconds > MAX_DAILY_RUN_SECONDS) return false;
    const expected = Math.floor(10 * distance + 50 * rings);
    if (Math.abs(expected - score) > 1) return false;
    const potentialBoostedSpeed = (28 + Math.floor(rings / 6) * (2 / 3.6)) * 1.5;
    const potentialSurgeSpeed = (165 + Math.floor(rings / 4) * 5) / 3.6;
    const speedCeiling = Math.max(50, potentialBoostedSpeed, potentialSurgeSpeed);
    if (distance > elapsedSeconds * speedCeiling * 1.25 + 60) return false;
    if (rings > Math.floor(distance / 12) + 8) return false;
    return true;
}

export function utcDateAt(ms) {
    return new Date(ms).toISOString().slice(0, 10);
}

export function dailyDeadlineMs(date) {
    const start = Date.parse(date + 'T00:00:00.000Z');
    if (!Number.isFinite(start)) throw new TypeError('Invalid challenge date.');
    return start + 86400000 + DAILY_GRACE_MS;
}

export function isDailySubmissionOpen(date, nowMs) {
    return Number.isFinite(nowMs) && nowMs < dailyDeadlineMs(date);
}
