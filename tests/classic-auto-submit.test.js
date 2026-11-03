import test from 'node:test';
import assert from 'node:assert/strict';
import { ClassicAutoSubmit, CLASSIC_PENDING_KEY } from '../src/services/ClassicAutoSubmit.js';

function fixture({ best = null, registered = null, accepts = true } = {}) {
    const records = new Map();
    const submits = [];
    const deadlines = new Map();
    const store = {
        getItem(key) { return records.get(key) ?? null; },
        setItem(key, value) { records.set(key, value); },
        removeItem(key) { records.delete(key); },
    };
    const lb = {
        enabled: true, storage: store,
        async getRunStatus(runId) {
            if (!deadlines.has(runId)) deadlines.set(runId, ctrl.now() + 6 * 60 * 60 * 1000);
            return { expiresAt: deadlines.get(runId) };
        },
        async getLeaderboard() { return { me: best === null ? null : { score: best, nickname: registered } }; },
        async finishRun(data) { submits.push(data); return { accepted: accepts }; },
    };
    const states = [];
    const ctrl = new ClassicAutoSubmit({ leaderboard: lb, onStatus: x => states.push(x), now: () => 100000 });
    return { ctrl, submits, states, records, lb, deadlines };
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

test('Daily/Friend registered player with no Classic best submits without registration', async () => {
    const f = fixture();
    f.lb.getLeaderboard = async () => ({ profile: { nickname: 'DailyPilot' }, me: null });
    await f.ctrl.completedRun(run);
    assert.equal(f.submits.length, 1);
    assert.equal(f.submits[0].nickname, 'DailyPilot');
    assert.equal(f.states.some(state => state.status === 'needs-name'), false);
});

test('a higher replacement drains after either a stale lookup or submission finishes', async () => {
    for (const stage of ['lookup', 'submit']) {
        for (const fails of [false, true]) {
            const f = fixture({ best: 100, registered: 'PilotA' });
            let release;
            let signal;
            const entered = new Promise(resolve => { signal = resolve; });
            const blocked = new Promise((resolve, reject) => { release = () => fails ? reject(Error('Offline')) : resolve(); });
            let lookups = 0;
            f.lb.getLeaderboard = async () => {
                if (++lookups === 1 && stage === 'lookup') { signal(); await blocked; }
                return { me: { score: 100, nickname: 'PilotA' } };
            };
            f.lb.finishRun = async candidate => {
                f.submits.push(candidate);
                if (candidate.runId === id && stage === 'submit') { signal(); await blocked; }
                return { accepted: true };
            };
            const original = f.ctrl.completedRun(run);
            await entered;
            const higherId = '22345678-1234-4234-8234-123456789abc';
            await f.ctrl.completedRun({ ...run, runPromise: Promise.resolve(higherId), score: 2000, distance: 150 });
            release();
            await original;
            assert.equal(f.ctrl.pending, null, stage + ' / failure=' + fails);
            assert.equal(f.ctrl.busy, false);
            assert.equal(f.submits.at(-1).runId, higherId);
            assert.equal(f.submits.filter(candidate => candidate.runId === higherId).length, 1);
            assert.equal(f.states.filter(state => state.status === 'saved').length, 1);
            assert.equal(f.ctrl.status, 'saved');
        }
    }
});

test('one failed candidate is retained without an automatic infinite retry', async () => {
    const f = fixture();
    let lookups = 0;
    f.lb.getLeaderboard = async () => { lookups++; throw Error('Offline'); };
    await f.ctrl.completedRun(run);
    assert.equal(lookups, 1);
    assert.equal(f.ctrl.status, 'failed');
    assert.equal(f.ctrl.pending.runId, id);
});

test('expired higher pending results never discard fresh lower or equal runs', async () => {
    for (const age of [6 * 60 * 60 * 1000, 6 * 60 * 60 * 1000 + 1]) {
        for (const freshScore of [4000, 5000, 6000]) {
            const f = fixture();
            let now = 100000;
            f.ctrl.now = () => now;
            f.lb.getLeaderboard = async () => { throw Error('Offline'); };
            await f.ctrl.completedRun({ ...run, score: 5000, rings: 0, distance: 500 });
            now += age;
            f.lb.getLeaderboard = async () => ({ profile: { nickname: 'PilotA' }, me: null });
            const freshId = '22345678-1234-4234-8234-123456789abc';
            await f.ctrl.completedRun({ runPromise: Promise.resolve(freshId), score: freshScore,
                rings: 0, distance: freshScore / 10 });
            assert.equal(f.submits.length, 1);
            assert.equal(f.submits[0].runId, freshId);
            assert.equal(f.ctrl.pending, null);
            assert.equal(f.ctrl.status, 'saved');
        }
    }
});

test('an unexpired higher pending result still takes precedence', async () => {
    const f = fixture();
    let now = 100000;
    f.ctrl.now = () => now;
    f.lb.getLeaderboard = async () => { throw Error('Offline'); };
    await f.ctrl.completedRun({ ...run, score: 5000, rings: 0, distance: 500 });
    now += 6 * 60 * 60 * 1000 - 1;
    f.lb.getLeaderboard = async () => ({ profile: { nickname: 'PilotA' }, me: null });
    await f.ctrl.completedRun({ ...run, runPromise: Promise.resolve('22345678-1234-4234-8234-123456789abc') });
    assert.equal(f.submits.length, 1);
    assert.equal(f.submits[0].runId, id);
    assert.equal(f.submits[0].score, 5000);
});

test('a fresh lower run replaces an expired candidate even during an outstanding request', async () => {
    const f = fixture();
    let now = 100000, release, entered;
    f.ctrl.now = () => now;
    const waiting = new Promise(resolve => { entered = resolve; });
    let calls = 0;
    f.lb.getLeaderboard = async () => {
        if (++calls === 1) { entered(); await new Promise(resolve => { release = resolve; }); }
        return { profile: { nickname: 'PilotA' }, me: null };
    };
    const original = f.ctrl.completedRun({ ...run, score: 5000, distance: 450 });
    await waiting;
    now += 6 * 60 * 60 * 1000;
    const freshId = '22345678-1234-4234-8234-123456789abc';
    await f.ctrl.completedRun({ ...run, runPromise: Promise.resolve(freshId) });
    release();
    await original;
    assert.equal(f.submits.length, 1);
    assert.equal(f.submits[0].runId, freshId);
    assert.equal(f.ctrl.pending, null);
});

test('authoritative start-based expiry drops an older flight before choosing a fresh lower score', async () => {
    const f = fixture();
    let now = 60 * 60 * 1000; // First flight started at 0 and lasted an hour.
    f.ctrl.now = () => now;
    f.deadlines.set(id, 6 * 60 * 60 * 1000);
    f.lb.getLeaderboard = async () => { throw Error('Offline'); };
    await f.ctrl.completedRun({ ...run, score: 5000, distance: 450 });
    now = 6.5 * 60 * 60 * 1000;
    const fresh = '22345678-1234-4234-8234-123456789abc';
    f.lb.getLeaderboard = async () => ({ profile: { nickname: 'PilotA' }, me: null });
    await f.ctrl.completedRun({ ...run, runPromise: Promise.resolve(fresh), score: 4000 });
    assert.deepEqual(f.submits.map(item => item.runId), [fresh]);
    assert.equal(f.ctrl.pending, null);
});

test('legacy pending records check server expiry and fresh fallbacks survive lookup failures and reloads', async () => {
    const f = fixture();
    let now = 100000;
    f.ctrl.now = () => now;
    let lookupFails = true;
    f.lb.getRunStatus = async runId => {
        if (runId === id) {
            if (lookupFails) throw Error('Temporary status lookup failure');
            return { expiresAt: now - 1 };
        }
        return { expiresAt: now + 10000 };
    };
    f.lb.getLeaderboard = async () => { throw Error('Offline'); };
    await f.ctrl.completedRun({ ...run, score: 5000 });
    const fresh = '22345678-1234-4234-8234-123456789abc';
    await f.ctrl.completedRun({ ...run, runPromise: Promise.resolve(fresh) });
    assert.equal(f.ctrl.candidates.length, 2);
    const restored = new ClassicAutoSubmit({ leaderboard: f.lb, now: () => now });
    assert.equal(restored.candidates.length, 2);
    lookupFails = false;
    f.lb.getLeaderboard = async () => ({ profile: { nickname: 'PilotA' }, me: null });
    await restored.resume();
    assert.deepEqual(f.submits.map(item => item.runId), [fresh]);
    assert.equal(restored.pending, null);
});

test('late failed registrations never hide a newer nickname form or saved status', async () => {
    for (const registered of [null, 'PilotA']) {
        const f = fixture({ best: registered ? 100 : null, registered });
        let failOld;
        const old = f.ctrl.completedRun({ ...run, runPromise: new Promise(resolve => { failOld = resolve; }) });
        await f.ctrl.completedRun({ ...run, runPromise: Promise.resolve('22345678-1234-4234-8234-123456789abc'), score: 2000 });
        const expected = registered ? 'saved' : 'needs-name';
        assert.equal(f.ctrl.status, expected);
        failOld(null);
        await old;
        assert.equal(f.ctrl.status, expected);
    }
});

test('late successful higher registrations remain eligible and are not discarded as stale', async () => {
    const f = fixture({ best: 100, registered: 'PilotA' });
    let finishOld;
    const old = f.ctrl.completedRun({ ...run, score: 5000, runPromise: new Promise(resolve => { finishOld = resolve; }) });
    await f.ctrl.completedRun({ ...run, score: 2000, runPromise: Promise.resolve('22345678-1234-4234-8234-123456789abc') });
    finishOld(id);
    await old;
    assert.deepEqual(f.submits.map(item => item.score), [2000, 5000]);
});

test('server-confirmed expiry during submission is terminal but temporary errors stay pending', async () => {
    const f = fixture({ best: 100, registered: 'PilotA' });
    f.lb.finishRun = async () => { const error = Error('Expired'); error.code = 'RUN_EXPIRED'; throw error; };
    await f.ctrl.completedRun(run);
    assert.equal(f.ctrl.pending, null);
    assert.equal(f.ctrl.status, 'expired');
});

test('a first-time player can register a fresh fallback while the older expiry lookup is unavailable', async () => {
    const f = fixture();
    f.lb.getRunStatus = async runId => {
        if (runId === id) throw Error('Temporary lookup error');
        return { expiresAt: f.ctrl.now() + 10000 };
    };
    await f.ctrl.completedRun({ ...run, score: 5000 });
    const fresh = '22345678-1234-4234-8234-123456789abc';
    await f.ctrl.completedRun({ ...run, runPromise: Promise.resolve(fresh) });
    assert.equal(f.ctrl.status, 'needs-name');
    await f.ctrl.submitNickname('PilotA');
    assert.deepEqual(f.submits.map(item => item.runId), [fresh]);
    assert.equal(f.ctrl.pending.runId, id);
    assert.equal(f.ctrl.status, 'failed');
});

test('late expired or non-best registrations do not replace a newer saved result message', async () => {
    for (const expired of [true, false]) {
        const f = fixture({ best: 100, registered: 'PilotA' });
        let finishOld;
        const old = f.ctrl.completedRun({ ...run, runPromise: new Promise(resolve => { finishOld = resolve; }) });
        await f.ctrl.completedRun({ ...run, score: 2000, runPromise: Promise.resolve('22345678-1234-4234-8234-123456789abc') });
        assert.equal(f.ctrl.status, 'saved');
        if (expired) f.deadlines.set(id, f.ctrl.now() - 1);
        else f.lb.getLeaderboard = async () => ({ me: { nickname: 'PilotA', score: 2000 } });
        finishOld(id);
        await old;
        assert.equal(f.ctrl.pending, null);
        assert.equal(f.ctrl.status, 'saved');
    }
});
