import test from 'node:test';
import assert from 'node:assert/strict';
import { readLeaderboard } from '../supabase/functions/leaderboard/read-leaderboard.js';
import { readDailyLeaderboard } from '../supabase/functions/daily-challenge/ranking.js';

test('Classic read uses one snapshot RPC and preserves its complete response', async () => {
    const snapshot = { entries: [], profile: { nickname: 'DailyPilot' }, me: null };
    const calls = [];
    const db = { async rpc(name, args) { calls.push({ name, args }); return { data: snapshot, error: null }; } };
    assert.equal(await readLeaderboard(db, 'owner'), snapshot);
    assert.deepEqual(calls, [{ name: 'classic_leaderboard_snapshot', args: { p_user_id: 'owner' } }]);
});

test('Daily read passes the server-selected date/version to exactly one snapshot RPC', async () => {
    const snapshot = { entries: [], me: null, nickname: 'Pilot' };
    const calls = [];
    const db = { async rpc(name, args) { calls.push({ name, args }); return { data: snapshot, error: null }; } };
    assert.equal(await readDailyLeaderboard(db, 'owner', '2026-11-03', 3), snapshot);
    assert.deepEqual(calls, [{ name: 'daily_leaderboard_snapshot',
        args: { p_user_id: 'owner', p_date: '2026-11-03', p_course_version: 3 } }]);
});

test('snapshot errors or invalid data fail closed instead of falling back to inconsistent queries', async () => {
    for (const result of [{ data: null, error: { message: 'internal' } }, { data: null }, { data: {} }]) {
        const db = { async rpc() { return result; }, from() { throw Error('Unexpected split query'); } };
        await assert.rejects(readLeaderboard(db, 'owner'), /temporarily unavailable/);
        await assert.rejects(readDailyLeaderboard(db, 'owner', '2026-11-03', 3), /temporarily unavailable/);
    }
});
