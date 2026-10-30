// M4 friend challenge URLs carry only an opaque server-issued identifier.
// Never encode a score, nickname, run token, or other authoritative data in URLs.
const CHALLENGE_ID = /^[A-Za-z0-9_-]{16,64}$/;
const NICKNAME = /^[A-Za-z0-9_]{3,16}$/;

export function isChallengeId(value) {
    return typeof value === 'string' && CHALLENGE_ID.test(value);
}

export function readChallengeLink(href) {
    const url = new URL(href);
    const values = url.searchParams.getAll('challenge');
    if (!values.length) return { present: false, id: null };
    if (values.length !== 1 || !isChallengeId(values[0])) {
        return { present: true, id: null };
    }
    return { present: true, id: values[0] };
}

export function createChallengeLink(id, href) {
    if (!isChallengeId(id)) throw new TypeError('Invalid challenge ID.');
    const url = new URL(href);
    if (!/^https?:$/.test(url.protocol)) throw new TypeError('Unsupported challenge link.');
    url.search = '';
    url.hash = '';
    url.searchParams.set('challenge', id);
    return url.toString();
}

export function verifiedChallenge(data, expectedId) {
    if (!data || !isChallengeId(data.id) || (expectedId && data.id !== expectedId)
        || !Number.isSafeInteger(data.targetScore) || data.targetScore <= 0
        || !NICKNAME.test(data.creatorNickname)
        || typeof data.expiresAt !== 'string'
        || !Number.isFinite(Date.parse(data.expiresAt))) {
        throw new Error('The challenge details could not be verified.');
    }
    return {
        id: data.id,
        targetScore: data.targetScore,
        creatorNickname: data.creatorNickname,
        expiresAt: data.expiresAt,
        expired: Date.parse(data.expiresAt) <= Date.now(),
    };
}

export function beatsChallenge(score, targetScore) {
    return Number.isSafeInteger(score) && Number.isSafeInteger(targetScore)
        && targetScore > 0 && score > targetScore;
}

export function isPilotNickname(name) {
    return typeof name === 'string' && NICKNAME.test(name);
}
