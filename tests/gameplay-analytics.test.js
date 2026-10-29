import test from 'node:test';
import assert from 'node:assert/strict';
import { GameplayAnalyticsService } from '../src/services/GameplayAnalyticsService.js';

const uuid = (n) => '12345678-1234-4234-8234-' + String(n).padStart(12, '0');
function storage() {
    const values = new Map();
    return {
        getItem: (key) => values.get(key) ?? null,
        setItem: (key, value) => values.set(key, String(value)),
    };
}
function harness({ store = storage(), sendEvent = async () => {} } = {}) {
    let id = 0;
    const scheduled = [];
    const client = new GameplayAnalyticsService({
        storage: store,
        submitEvent: sendEvent,
        uuidFactory: () => uuid(++id),
        schedule: (cb) => { scheduled.push(cb); },
    });
    return { client, scheduled, store };
}

test('first and second runs emit exact events outside the render call', async () => {
    const received = [];
    const { client, scheduled } = harness({
        sendEvent: async (event) => received.push(event),
    });
    client.trackRunStart('classic');
    client.trackRunEnd({
        score: 850, rings: 3, distance: 70,
        durationSeconds: 18.5, reason: 'collision',
    });
    client.trackRunStart('classic');
    assert.deepEqual(received, []);
    assert.equal(scheduled.length, 1);
    await client.flush();

    assert.deepEqual(received.map((event) => event.eventName), [
        'game_start', 'game_over', 'game_start', 'second_run',
    ]);
    assert.ok(received.every((event) => event.mode === 'classic'));
    assert.equal(new Set(received.map((event) => event.eventId)).size, 4);
    assert.equal(new Set(received.map((event) => event.sessionId)).size, 1);
    assert.equal(received[1].score, 850);
    assert.equal(received[1].durationSeconds, 18.5);
    assert.equal(received[1].reason, 'collision');
    assert.equal(client.runCount, 2);
});

test('session id and run count survive a same-tab reload; second_run never repeats', async () => {
    const store = storage();
    const first = harness({ store });
    first.client.trackRunStart();
    await first.client.flush();
    const otherEvents = [];
    const second = harness({ store, sendEvent: async (event) => otherEvents.push(event) });
    assert.equal(second.client.sessionId, first.client.sessionId);
    second.client.trackRunStart();
    second.client.trackRunStart();
    await second.client.flush();
    assert.deepEqual(otherEvents.map((event) => event.eventName), [
        'game_start', 'second_run', 'game_start',
    ]);
    assert.equal(second.client.runCount, 3);
});

test('daily adoption and challenge sharing events exist but are not emitted early', async () => {
    const events = [];
    const { client } = harness({ sendEvent: async (event) => events.push(event) });
    client.trackRunStart('classic');
    await client.flush();
    assert.deepEqual(events.map((e) => e.eventName), ['game_start']);
    client.trackRunStart('daily');
    client.trackChallengeShared('friend');
    client.trackChallengeShared('practice');
    await client.flush();
    assert.deepEqual(events.map((e) => e.eventName), [
        'game_start', 'game_start', 'second_run',
        'daily_challenge_played', 'challenge_shared',
    ]);
});

test('failed transport does not interrupt the next event or throw into gameplay', async () => {
    let attempts = 0;
    const { client } = harness({
        sendEvent: async () => {
            attempts += 1;
            if (attempts === 1) throw Error('Telemetry offline');
        },
    });
    client.trackRunStart();
    client.trackRunEnd({
        score: 50, rings: 1, distance: 0,
        durationSeconds: 3, reason: 'ring-timeout',
    });
    await assert.doesNotReject(() => client.flush());
    assert.equal(attempts, 2);
    assert.equal(client.queue.length, 0);
});

test('an outage never builds an unbounded analytics queue', async () => {
    const { client } = harness({ sendEvent: async () => {} });
    for (let i = 0; i < 80; i += 1) client.trackRunStart();
    assert.equal(client.queue.length, 24);
    await client.flush();
    assert.equal(client.queue.length, 0);
});

test('blocked browser storage and disabled analytics remain safe', async () => {
    let id = 0;
    const broken = new GameplayAnalyticsService({
        storage: { getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); } },
        submitEvent: null,
        uuidFactory: () => uuid(++id),
        schedule: () => { throw Error('no timer'); },
    });
    assert.equal(broken.sessionId, uuid(1));
    broken.trackRunStart();
    broken.trackRunEnd({ score: 0 });
    assert.equal(broken.queue.length, 0);
    await assert.doesNotReject(() => broken.flush());
});

test('invalid UUID provider gracefully disables tracking', async () => {
    const { client } = harness({ sendEvent: async () => {}, store: storage() });
    client.uuidFactory = () => 'bad-id';
    client.trackRunStart();
    assert.equal(client.queue.length, 0);
});
