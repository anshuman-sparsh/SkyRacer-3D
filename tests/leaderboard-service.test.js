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
