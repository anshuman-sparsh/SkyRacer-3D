// Shared, dependency-free validation for the Edge Function and Node unit tests.
// A browser event is telemetry, NEVER evidence for leaderboard scores or unlocks.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EVENTS = new Set([
    'game_start', 'game_over', 'second_run',
    'challenge_shared', 'daily_challenge_played',
]);
const MODES = new Set(['classic', 'practice', 'daily', 'friend']);
const REASONS = new Set(['collision', 'ring-timeout', 'completed']);
const METRICS = ['score', 'rings', 'distance', 'durationSeconds', 'reason'];
const ALLOWED = new Set(['eventId', 'sessionId', 'eventName', 'mode', ...METRICS]);

export function validateGameplayEvent(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
    if (Object.keys(input).some((field) => !ALLOWED.has(field))) return null;
    const { eventId, sessionId, eventName, mode } = input;
    if (typeof eventId !== 'string' || !UUID.test(eventId)
        || typeof sessionId !== 'string' || !UUID.test(sessionId)
        || !EVENTS.has(eventName) || !MODES.has(mode)) return null;
    if (eventName === 'daily_challenge_played' && mode !== 'daily') return null;
    if (eventName === 'challenge_shared' && mode === 'practice') return null;

    const clean = {
        eventId: eventId.toLowerCase(),
        sessionId: sessionId.toLowerCase(),
        eventName, mode,
        score: null, rings: null, distance: null,
        durationSeconds: null, reason: null,
    };
    if (eventName !== 'game_over') {
        if (METRICS.some((field) => Object.hasOwn(input, field))) return null;
        return clean;
    }

    const { score, rings, distance, durationSeconds, reason } = input;
    if (!Number.isSafeInteger(score) || score < 0 || score > 2147483647
        || !Number.isSafeInteger(rings) || rings < 0 || rings > 100000
        || typeof distance !== 'number' || !Number.isFinite(distance)
        || distance < 0 || distance > 100000000
        || typeof durationSeconds !== 'number' || !Number.isFinite(durationSeconds)
        || durationSeconds < 0 || durationSeconds > 21600
        || !REASONS.has(reason)) return null;

    const expectedScore = Math.floor(10 * distance + 50 * rings);
    if (Math.abs(score - expectedScore) > 1) return null;

    return {
        ...clean, score, rings,
        distance: Math.round(distance * 1000) / 1000,
        durationSeconds: Math.round(durationSeconds * 10) / 10,
        reason,
    };
}
