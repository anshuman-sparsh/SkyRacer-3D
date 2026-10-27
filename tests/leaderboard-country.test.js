import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import countryHandler, { signCountryProof } from '../api/country.js';
import { verifyCountryProof } from '../supabase/functions/leaderboard/country-proof.js';
import { formatLeaderboardName } from '../src/utils/LeaderboardDisplay.js';

// Node versions that expose Web Crypto via node:crypto rather than global.
if (!globalThis.crypto) globalThis.crypto = webcrypto;

const secret = 'testing-shared-vercel-and-supabase-hmac-secret-1234567890';
const runId = '12345678-1234-4234-8234-123456789abc';

function response() {
    return {
        statusCode: 200, headers: {}, body: null,
        setHeader(key, value) { this.headers[key.toLowerCase()] = value; return this; },
        status(statusCode) { this.statusCode = statusCode; return this; },
        json(body) { this.body = body; return this; },
    };
}

function setEnvironment(t, isVercel, geoSecret = secret) {
    const existing = { vercel: process.env.VERCEL, secret: process.env.LEADERBOARD_GEO_SECRET };
    if (isVercel) process.env.VERCEL = '1';
    else delete process.env.VERCEL;
    if (geoSecret === null) delete process.env.LEADERBOARD_GEO_SECRET;
    else process.env.LEADERBOARD_GEO_SECRET = geoSecret;
    t.after(() => {
        if (existing.vercel === undefined) delete process.env.VERCEL;
        else process.env.VERCEL = existing.vercel;
        if (existing.secret === undefined) delete process.env.LEADERBOARD_GEO_SECRET;
        else process.env.LEADERBOARD_GEO_SECRET = existing.secret;
    });
}

test('Vercel signs IP-derived country for one specific run, verified by Supabase', async (t) => {
    setEnvironment(t, true);
    const res = response();
    countryHandler({
        method: 'POST',
        headers: { 'x-vercel-ip-country': 'IN' },
        body: { runId },
    }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.headers['cache-control'], 'private, no-store');
    assert.match(res.body.proof, /^v1\./);
    assert.equal(await verifyCountryProof(res.body.proof, runId, secret), 'IN');
    assert.equal(await verifyCountryProof(res.body.proof,
        'aaaaaaaa-1234-4234-8234-123456789abc', secret), null);
});

test('country proof cannot be forged, changed, or replayed after expiration', async () => {
    const now = Date.now();
    const proof = signCountryProof(runId, 'US', Math.floor(now / 1000), secret);
    assert.equal(await verifyCountryProof(proof, runId, secret, now), 'US');
    assert.equal(await verifyCountryProof(proof.replace('.US.', '.IN.'), runId, secret, now), null);
    assert.equal(await verifyCountryProof(proof, runId, secret + 'wrong', now), null);
    assert.equal(await verifyCountryProof(proof, runId, secret, now + 6 * 60_000), null);
    assert.equal(await verifyCountryProof(proof, runId, secret, now - 60_000), null);
    assert.equal(await verifyCountryProof('invalid', runId, secret), null);
});

test('local development with no Vercel header and missing secrets do not assign a country', (t) => {
    setEnvironment(t, false);
    const local = response();
    countryHandler({ method: 'POST', headers: {},
        body: { runId } }, local);
    assert.equal(local.body.proof, null);

    process.env.VERCEL = '1';
    const missingGeo = response();
    countryHandler({ method: 'POST', headers: {}, body: { runId } }, missingGeo);
    assert.equal(missingGeo.body.proof, null);

    delete process.env.LEADERBOARD_GEO_SECRET;
    const missingSecret = response();
    countryHandler({ method: 'POST', headers: { 'x-vercel-ip-country': 'IN' },
        body: { runId } }, missingSecret);
    assert.equal(missingSecret.body.proof, null);
});

test('country endpoint rejects requests without a valid run ID', (t) => {
    setEnvironment(t, true);
    const badMethod = response();
    countryHandler({ method: 'GET', headers: {}, body: { runId } }, badMethod);
    assert.equal(badMethod.statusCode, 405);
    const badRunId = response();
    countryHandler({ method: 'POST', headers: { 'x-vercel-ip-country': 'US' },
        body: { runId: 'not-a-real-id' } }, badRunId);
    assert.equal(badRunId.statusCode, 400);
});

test('leaderboard appends verified ISO country codes and preserves legacy names', () => {
    assert.equal(formatLeaderboardName({ nickname: 'Minions', countryCode: 'IN' }), 'Minions (IN)');
    assert.equal(formatLeaderboardName({ nickname: 'Twixyy', countryCode: 'US' }), 'Twixyy (US)');
    assert.equal(formatLeaderboardName({ nickname: 'ExistingPlayer', countryCode: null }), 'ExistingPlayer');
    assert.equal(formatLeaderboardName({ nickname: 'Pilot', countryCode: '<script>' }), 'Pilot');
    assert.equal(formatLeaderboardName({ nickname: 'Pilot', countryCode: 'in' }), 'Pilot');
    assert.equal(formatLeaderboardName({ nickname: 'Pilot', countryCode: 'USA' }), 'Pilot');
});
