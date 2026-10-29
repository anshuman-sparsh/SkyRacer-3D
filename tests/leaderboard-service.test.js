import test from 'node:test';
import assert from 'node:assert/strict';
import { LeaderboardService } from '../src/services/LeaderboardService.js';

const json = (data, status = 200) => ({
    status, ok: status >= 200 && status < 300, json: async () => data,
});
function storage() {
    const values = new Map();
    return {
        getItem: (key) => values.get(key) ?? null,
        setItem: (key, value) => values.set(key, String(value)),
    };
}

test('leaderboard does not contact network without credentials', async () => {
    const service = new LeaderboardService({
        url: '', publishableKey: '', storage: storage(),
        fetchImpl: () => { throw Error('No network expected'); },
    });
    assert.equal(service.enabled, false);
    assert.equal(await service.beginRun(), null);
    assert.deepEqual(await service.getLeaderboard(), { entries: [], me: null });
});

test('anonymous session and a run are reused for score submission', async () => {
    const calls = [];
    const service = new LeaderboardService({
        url: 'https://game.supabase.co', publishableKey: 'public', storage: storage(),
        fetchImpl: async (url, init) => {
            const body = init.body ? JSON.parse(init.body) : null;
            calls.push({ url, body, method: init.method });
            if (url.endsWith('/signup')) return json({
                access_token: 'jwt', refresh_token: 'refresh', expires_in: 3600,
            });
            if (body?.action === 'start') return json({ runId: 'server-run' });
            if (body?.action === 'finish') return json({ accepted: true, personalBest: 350 });
            return json({ entries: [], me: null });
        },
    });
    const runId = await service.beginRun();
    await service.finishRun({ runId, nickname: 'SkyPilot', score: 350, rings: 3, distance: 20 });
    assert.equal(calls.filter((call) => call.url.endsWith('/signup')).length, 1);
    assert.deepEqual(calls.find((call) => call.body?.action === 'finish')?.body, {
        action: 'finish', runId: 'server-run', nickname: 'SkyPilot',
        score: 350, rings: 3, distance: 20,
    });
    assert.equal(service.getNickname(), 'SkyPilot');
});

test('failed score submissions are not saved as successful', async () => {
    const service = new LeaderboardService({
        url: 'https://game.supabase.co', publishableKey: 'public', storage: storage(),
        fetchImpl: async (url) => url.endsWith('/signup')
            ? json({ access_token: 'jwt', refresh_token: 'refresh', expires_in: 3600 })
            : json({ error: 'Score rejected' }, 400),
    });
    await assert.rejects(() => service.finishRun({
        runId: 'bad', nickname: 'Pilot', score: 9999, rings: 0, distance: 0,
    }), /Score rejected/);
    assert.equal(service.getNickname(), '');
});

test('returning account uses its server-registered permanent nickname', async () => {
    const store = storage();
    store.setItem('skyracer_lb_nickname_v1', 'OldBrowserName');
    const calls = [];
    const service = new LeaderboardService({
        url: 'https://game.supabase.co', publishableKey: 'public', storage: store,
        fetchImpl: async (url, init) => {
            calls.push({ url, method: init.method });
            if (url.endsWith('/signup')) {
                return json({ access_token: 'jwt', refresh_token: 'refresh', expires_in: 3600 });
            }
            return json({
                entries: [{ rank: 1, nickname: 'Doom', score: 500 }],
                me: { rank: 1, nickname: 'Doom', score: 500, rings: 2 },
            });
        },
    });

    const result = await service.getLeaderboard();
    assert.equal(result.me.nickname, 'Doom');
    assert.equal(service.getNickname(), 'Doom');
    assert.equal(calls.filter((call) => call.method === 'GET').length, 1);
});

test('rejected nickname conflict does not overwrite previously registered nickname', async () => {
    const store = storage();
    store.setItem('skyracer_lb_nickname_v1', 'Doom');
    const service = new LeaderboardService({
        url: 'https://game.supabase.co', publishableKey: 'public', storage: store,
        fetchImpl: async (url) => url.endsWith('/signup')
            ? json({ access_token: 'jwt', refresh_token: 'refresh', expires_in: 3600 })
            : json({ error: 'That nickname is already taken.' }, 409),
    });

    await assert.rejects(() => service.finishRun({
        runId: 'another-run', nickname: 'RazorPaw', score: 1000, rings: 5, distance: 75,
    }), /already taken/);
    assert.equal(service.getNickname(), 'Doom');
});

test('score submission carries a Vercel-signed country proof for its run', async () => {
    const runId = '12345678-1234-4234-8234-123456789abc';
    const proof = `v1.${runId}.IN.1793000000.${'a'.repeat(64)}`;
    const calls = [];
    const service = new LeaderboardService({
        url: 'https://game.supabase.co', publishableKey: 'public', storage: storage(),
        fetchImpl: async (url, init) => {
            const body = init?.body ? JSON.parse(init.body) : null;
            calls.push({ url, body });
            if (url.endsWith('/signup')) {
                return json({ access_token: 'jwt', refresh_token: 'refresh', expires_in: 3600 });
            }
            if (url === '/api/country') {
                assert.equal(body.runId, runId);
                return json({ proof });
            }
            return json({ accepted: true, personalBest: 500 });
        },
    });

    await service.finishRun({ runId, nickname: 'Pilot', score: 500, rings: 1, distance: 45 });
    assert.equal(calls.filter((call) => call.url === '/api/country').length, 1);
    assert.equal(calls.find((call) => call.body?.action === 'finish')?.body.countryProof, proof);
});

test('a missing geolocation route does not interrupt score submission', async () => {
    const calls = [];
    const service = new LeaderboardService({
        url: 'https://game.supabase.co', publishableKey: 'public', storage: storage(),
        fetchImpl: async (url, init) => {
            if (url === '/api/country') throw new Error('No Vercel Function on localhost');
            if (url.endsWith('/signup')) {
                return json({ access_token: 'jwt', refresh_token: 'refresh', expires_in: 3600 });
            }
            const body = init?.body ? JSON.parse(init.body) : null;
            if (body?.action === 'finish') calls.push(body);
            return json({ accepted: true, personalBest: 350 });
        },
    });

    const result = await service.finishRun({
        runId: '12345678-1234-4234-8234-123456789abc',
        nickname: 'SkyPilot', score: 350, rings: 3, distance: 20,
    });
    assert.equal(result.accepted, true);
    assert.equal(calls.length, 1);
    assert.equal('countryProof' in calls[0], false);
});

test('returning player backfills country for an older best without a new score', async () => {
    const runId = '12345678-1234-4234-8234-123456789abc';
    const proof = `v1.${runId}.IN.1793000000.${'a'.repeat(64)}`;
    const requests = [];
    let countryCode = null;
    const service = new LeaderboardService({
        url: 'https://game.supabase.co', publishableKey: 'public', storage: storage(),
        fetchImpl: async (url, init) => {
            const body = init?.body ? JSON.parse(init.body) : null;
            requests.push({ url, body, method: init.method });
            if (url.endsWith('/signup')) {
                return json({ access_token: 'jwt', refresh_token: 'refresh', expires_in: 3600 });
            }
            if (url === '/api/country') {
                assert.equal(body.runId, runId);
                return json({ proof });
            }
            if (body?.action === 'backfill-country') {
                assert.equal(body.runId, runId);
                assert.equal(body.countryProof, proof);
                countryCode = 'IN';
                return json({ updated: true });
            }
            return json({
                entries: [{ nickname: 'OlderPilot', score: 2000, countryCode }],
                me: { nickname: 'OlderPilot', rank: 1, score: 2000, rings: 4,
                    runId, countryCode },
            });
        },
    });

    const result = await service.getLeaderboard();
    assert.equal(result.entries[0].countryCode, 'IN');
    assert.equal(result.me.countryCode, 'IN');
    assert.equal(result.me.score, 2000);
    assert.equal(requests.filter((r) => r.method === 'GET').length, 2);
    assert.equal(requests.filter((r) => r.body?.action === 'backfill-country').length, 1);

    // Country is now stored on the best score. Reloading should not request
    // another proof or change the preserved score.
    await service.getLeaderboard();
    assert.equal(requests.filter((r) => r.url === '/api/country').length, 1);
});

test('missing country proof leaves older scores visible and avoids retry loops', async () => {
    const runId = '12345678-1234-4234-8234-123456789abc';
    const requests = [];
    const service = new LeaderboardService({
        url: 'https://game.supabase.co', publishableKey: 'public', storage: storage(),
        fetchImpl: async (url, init) => {
            const body = init?.body ? JSON.parse(init.body) : null;
            requests.push({ url, body });
            if (url.endsWith('/signup')) {
                return json({ access_token: 'jwt', refresh_token: 'refresh', expires_in: 3600 });
            }
            if (url === '/api/country') return json({ proof: null });
            return json({
                entries: [{ nickname: 'LegacyPlayer', score: 900, countryCode: null }],
                me: { nickname: 'LegacyPlayer', score: 900, rings: 1,
                    runId, countryCode: null },
            });
        },
    });
    const first = await service.getLeaderboard();
    const second = await service.getLeaderboard();
    assert.equal(first.entries[0].countryCode, null);
    assert.equal(second.entries[0].nickname, 'LegacyPlayer');
    assert.equal(requests.filter((r) => r.url === '/api/country').length, 1);
    assert.equal(requests.filter((r) => r.body?.action === 'backfill-country').length, 0);
});

test('gameplay telemetry reuses anonymous auth, sends small keepalive POST, and is non-authoritative', async () => {
    const calls = [];
    const service = new LeaderboardService({
        url: 'https://game.supabase.co', publishableKey: 'public', storage: storage(),
        fetchImpl: async (url, init) => {
            calls.push({ url, init });
            if (url.endsWith('/signup')) {
                return json({ access_token: 'jwt', refresh_token: 'refresh', expires_in: 3600 });
            }
            if (url.endsWith('/game-events')) return json({ accepted: true });
            throw new Error('Unexpected request');
        },
    });
    const result = await service.sendGameplayEvent({
        eventId: '12345678-1234-4234-8234-123456789abc',
        sessionId: 'aabbccdd-1234-4234-8234-123456789abc',
        eventName: 'game_start', mode: 'classic',
    });
    assert.equal(result, true);
    assert.equal(calls.filter((call) => call.url.endsWith('/signup')).length, 1);
    const eventCall = calls.find((call) => call.url.endsWith('/game-events'));
    assert.equal(eventCall.init.headers.Authorization, 'Bearer jwt');
    assert.equal(eventCall.init.headers.apikey, 'public');
    assert.equal(eventCall.init.keepalive, true);
    assert.equal(JSON.parse(eventCall.init.body).eventName, 'game_start');
    assert.equal('userId' in JSON.parse(eventCall.init.body), false);
});

test('telemetry is completely skipped when Supabase is not configured', async () => {
    const service = new LeaderboardService({
        url: '', publishableKey: '', storage: storage(),
        fetchImpl: () => { throw Error('Network unexpectedly used'); },
    });
    assert.equal(await service.sendGameplayEvent({ eventName: 'game_start' }), false);
});
