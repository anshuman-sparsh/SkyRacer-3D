import test from 'node:test';
import assert from 'node:assert/strict';
import { LeaderboardService } from '../src/services/LeaderboardService.js';
import { DailyChallengeService } from '../src/services/DailyChallengeService.js';

const storage = () => {
    const data = new Map();
    return {
        getItem: (k) => data.get(k) ?? null,
        setItem: (k, v) => data.set(k, String(v)),
    };
};

function asResponse(body, status = 200) {
    return { ok: status >= 200 && status < 300, status, json: async () => body };
}

test('Daily API shares one anonymous Supabase session without posting Classic scores', async () => {
    const requests = [];
    const leaderboard = new LeaderboardService({
        url: 'https://example.supabase.co', publishableKey: 'public-publishable',
        storage: storage(), fetchImpl: async (url, options) => {
            requests.push({ url, options });
            if (url.includes('/auth/v1/signup')) return asResponse({
                access_token: 'user-jwt', refresh_token: 'refresh', expires_in: 3600,
            });
            if (url.includes('daily-challenge')) {
                if (options.method === 'GET') return asResponse({
                    date: '2026-10-29', courseVersion: 1, serverNow: '2026-10-29T11:00:00Z',
                    entries: [], nickname: null, me: null,
                });
                const body = JSON.parse(options.body);
                if (body.action === 'start') return asResponse({
                    runId: '12345678-1234-4234-8234-123456789abc',
                    date: '2026-10-29', courseVersion: 1, nickname: null,
                });
                if (body.action === 'finish') return asResponse({
                    accepted: true, isNewBest: true, personalBest: 1070,
                });
            }
            throw Error('Unexpected API call ' + url);
        },
    });
    const daily = new DailyChallengeService(leaderboard);
    assert.equal(daily.enabled, true);
    const today = await daily.getToday();
    assert.equal(today.date, '2026-10-29');
    const run = await daily.begin();
    assert.equal(run.courseVersion, 1);
    assert.equal(run.submitted, false);
    const result = await daily.finish(run, {
        nickname: 'Pilot42', score: 1070, rings: 2, distance: 97,
    });
    assert.equal(result.isNewBest, true);
    assert.equal(run.submitted, true);
    assert.equal(leaderboard.getNickname(), 'Pilot42');
    assert.equal(requests.filter((r) => r.url.includes('/auth/v1/signup')).length, 1);
    assert.equal(requests.filter((r) => r.url.includes('/functions/v1/leaderboard')).length, 0);
    assert.equal(requests.filter((r) => r.url.includes('/functions/v1/daily-challenge')).length, 3);
    for (const req of requests.filter((r) => r.url.includes('daily-challenge'))) {
        assert.equal(req.options.headers.apikey, 'public-publishable');
        assert.equal(req.options.headers.Authorization, 'Bearer user-jwt');
    }
    await assert.rejects(() => daily.finish(run, {
        nickname: 'Pilot42', score: 1070, rings: 2, distance: 97,
    }), /no longer available/);
});

test('failed Daily submission preserves the same run for a nickname retry', async () => {
    let submissions = 0;
    const leaderboard = new LeaderboardService({
        url: 'https://example.supabase.co', publishableKey: 'public',
        storage: storage(), fetchImpl: async (url, options) => {
            if (url.includes('/auth/v1/signup')) return asResponse({
                access_token: 'jwt', refresh_token: 'refresh', expires_in: 3600,
            });
            if (url.includes('daily-challenge')) {
                const body = JSON.parse(options.body);
                if (body.action === 'start') return asResponse({
                    runId: '12345678-1234-4234-8234-123456789abc',
                    date: '2026-10-29', courseVersion: 1,
                });
                submissions += 1;
                return submissions === 1
                    ? asResponse({ error: 'Nickname is taken' }, 409)
                    : asResponse({ accepted: true, isNewBest: false, personalBest: 1200 });
            }
            throw Error('Unexpected request');
        },
    });
    const daily = new DailyChallengeService(leaderboard);
    const run = await daily.begin();
    await assert.rejects(() => daily.finish(run, {
        nickname: 'TakenPilot', score: 1070, rings: 2, distance: 97,
    }), /Nickname is taken/);
    assert.equal(run.submitted, false);
    const result = await daily.finish(run, {
        nickname: 'NewPilot', score: 1070, rings: 2, distance: 97,
    });
    assert.equal(result.isNewBest, false);
    assert.equal(submissions, 2);
    assert.equal(leaderboard.getNickname(), 'NewPilot');
});

test('Daily API refuses missing network credentials without invoking fetch', async () => {
    const leaderboard = new LeaderboardService({
        url: '', publishableKey: '', storage: storage(),
        fetchImpl: () => { throw Error('Network must not be used'); },
    });
    const daily = new DailyChallengeService(leaderboard);
    assert.equal(daily.enabled, false);
    await assert.rejects(() => daily.getToday(), /requires a connection/);
});
