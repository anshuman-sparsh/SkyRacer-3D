import test from 'node:test';
import assert from 'node:assert/strict';
import { readRunStatus } from '../supabase/functions/leaderboard/run-status.js';

test('expiry lookup is scoped to the authenticated owner and uses run start', async () => {
    const filters = [];
    const db = { from(table) {
        assert.equal(table, 'run_sessions');
        return { select() { return this; }, eq(key, value) { filters.push([key, value]); return this; },
            async maybeSingle() { return { data: { started_at: '2026-11-03T00:00:00Z', score_version: 2 }, error: null }; } };
    } };
    const result = await readRunStatus(db, 'owner', 'run', Date.parse('2026-11-03T06:30:00Z'));
    assert.deepEqual(filters, [['run_id', 'run'], ['user_id', 'owner']]);
    assert.equal(result.expiresAt, '2026-11-03T06:00:00.000Z');
    assert.equal(result.serverNow, '2026-11-03T06:30:00.000Z');
});

test('missing/foreign runs are unavailable, but database errors are retryable', async () => {
    const database = result => ({ from() { return { select() { return this; }, eq() { return this; }, async maybeSingle() { return result; } }; } });
    assert.equal(await readRunStatus(database({ data: null }), 'owner', 'run'), null);
    await assert.rejects(readRunStatus(database({ error: { message: 'offline' } }), 'owner', 'run'), /Could not check/);
});
