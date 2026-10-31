import test from 'node:test';
import assert from 'node:assert/strict';
import { ClassicAutoSubmit, CLASSIC_PENDING_KEY } from '../src/services/ClassicAutoSubmit.js';

function fixture({ best = null, registered = null, accepts = true } = {}) {
    const records = new Map();
    const submits = [];
    const store = {
        getItem(key) { return records.get(key) ?? null; },
        setItem(key, value) { records.set(key, value); },
        removeItem(key) { records.delete(key); },
    };
    const lb = {
        enabled: true, storage: store,
        async getLeaderboard() { return { me: best === null ? null : { score: best, nickname: registered } }; },
        async finishRun(data) { submits.push(data); return { accepted: accepts }; },
    };
    const states = [];
    const ctrl = new ClassicAutoSubmit({ leaderboard: lb, onStatus: x => states.push(x), now: () => 100000 });
    return { ctrl, submits, states, records, lb };
}
const id = '12345678-1234-4234-8234-123456789abc';
const run = { runPromise: Promise.resolve(id), score: 1000, rings: 10, distance: 50 };

test('returning Classic player automatically submits a server-registered new PB', async () => {
    const f = fixture({ best: 850, registered: 'PilotA' });
    await f.ctrl.completedRun(run);
    assert.equal(f.submits.length, 1);
    assert.equal(f.submits[0].nickname, 'PilotA');
    assert.equal(f.ctrl.status, 'saved');
    assert.equal(f.records.has(CLASSIC_PENDING_KEY), false);
    await f.ctrl.resume();
    assert.equal(f.submits.length, 1);
});
test('new Classic player must select a permanent nickname, then submits', async () => {
    const f = fixture();
    await f.ctrl.completedRun(run);
    assert.equal(f.ctrl.status, 'needs-name');
    assert.equal(f.submits.length, 0);
    await f.ctrl.submitNickname('bad name');
    assert.equal(f.submits.length, 0);
    await f.ctrl.submitNickname('Pilot_New');
    assert.equal(f.submits[0].nickname, 'Pilot_New');
    assert.equal(f.ctrl.status, 'saved');
});
test('ties and worse runs never overwrite server personal best', async () => {
    for (const best of [1000, 1001]) {
        const f = fixture({ best, registered: 'PilotA' });
        await f.ctrl.completedRun(run);
        assert.equal(f.submits.length, 0);
        assert.equal(f.records.has(CLASSIC_PENDING_KEY), false);
    }
});
test('failed network completion stays pending for later safe retry', async () => {
    const f = fixture({ best: 10, registered: 'PilotA', accepts: false });
    await f.ctrl.completedRun(run);
    assert.equal(f.ctrl.status, 'failed');
    assert.ok(f.records.has(CLASSIC_PENDING_KEY));
    f.lb.finishRun = async data => { f.submits.push(data); return { accepted: true }; };
    await f.ctrl.resume();
    assert.equal(f.ctrl.status, 'saved');
    assert.equal(f.records.has(CLASSIC_PENDING_KEY), false);
});
test('unregistered flights cannot enter leaderboard', async () => {
    const f = fixture();
    await f.ctrl.completedRun({ ...run, runPromise: Promise.resolve(null) });
    assert.equal(f.ctrl.status, 'unavailable');
    assert.equal(f.submits.length, 0);
});
test('stored pending run can resume after a page reload', async () => {
    const f = fixture({ best: 100, registered: 'PilotA' });
    f.records.set(CLASSIC_PENDING_KEY, JSON.stringify({ runId: id, score: 1000, rings: 10, distance: 50, savedAt: 99999 }));
    const c = new ClassicAutoSubmit({ leaderboard: f.lb, now: () => 100000 });
    await c.resume();
    assert.equal(f.submits.length, 1);
    assert.equal(f.records.has(CLASSIC_PENDING_KEY), false);
});
