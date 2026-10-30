import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
    isChallengeId, readChallengeLink, createChallengeLink,
    verifiedChallenge, beatsChallenge, isPilotNickname,
} from '../src/utils/FriendChallenge.js';

const id = 'AbCdEfGhIjKlMnOpQrStUvWx';

test('only a single opaque challenge ID is accepted from the URL', () => {
    assert.equal(isChallengeId(id), true);
    assert.deepEqual(readChallengeLink('https://www.skyracer.online/?challenge=' + id),
        { present: true, id });
    assert.deepEqual(readChallengeLink('https://www.skyracer.online/'),
        { present: false, id: null });
    for (const query of [
        '?challenge=123',
        '?challenge=' + id + '&challenge=' + id,
        '?challenge=' + encodeURIComponent('<img onerror=alert(1)>'),
    ]) {
        assert.deepEqual(readChallengeLink('https://www.skyracer.online/' + query),
            { present: true, id: null });
    }
});

test('shared URLs do not contain a trusted score or local run identity', () => {
    const result = createChallengeLink(id,
        'https://www.skyracer.online/?score=999999&runId=secret#score');
    const url = new URL(result);
    assert.equal(url.searchParams.get('challenge'), id);
    assert.equal(url.searchParams.has('score'), false);
    assert.equal(url.searchParams.has('runId'), false);
    assert.equal(url.hash, '');
    assert.throws(() => createChallengeLink('not-valid', result));
    assert.throws(() => createChallengeLink(id, 'javascript:alert(1)'));
});

test('server challenge payload must provide ID, valid nickname, score, and expiry', () => {
    const good = {
        id, creatorNickname: 'SkyPilot_1', targetScore: 1500,
        expiresAt: '2099-01-01T00:00:00Z',
    };
    assert.deepEqual(verifiedChallenge(good, id), { ...good, expired: false });
    assert.throws(() => verifiedChallenge({ ...good, targetScore: '1500' }, id));
    assert.throws(() => verifiedChallenge({ ...good, targetScore: 0 }, id));
    assert.throws(() => verifiedChallenge({ ...good, creatorNickname: '<script>' }, id));
    assert.throws(() => verifiedChallenge(good, 'DifferentChallengeId'));
    assert.equal(verifiedChallenge({ ...good, expiresAt: '2020-01-01T00:00:00Z' }).expired, true);
    assert.equal(isPilotNickname('SkyPilot_1'), true);
    assert.equal(isPilotNickname('bad nickname'), false);
});

test('a tie never wins a friend challenge', () => {
    assert.equal(beatsChallenge(1501, 1500), true);
    assert.equal(beatsChallenge(1500, 1500), false);
    assert.equal(beatsChallenge(1499, 1500), false);
    assert.equal(beatsChallenge(1501.5, 1500), false);
});

test('M4-A frontend exists but cannot claim an unverified challenge is active', () => {
    const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
    const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
    const css = readFileSync(new URL('../src/styles/racing-ui.css', import.meta.url), 'utf8');
    for (const hook of ['friend-dialog','quick-friend','friend-result','friend-close',
        'friend-create','friend-accept','friend-copy','friend-link','friend-status',
        'friend-details','friend-creator','friend-target','friend-expiry','friend-outcome']) {
        assert.ok(html.includes('data-' + hook), 'Missing ' + hook);
    }
    assert.match(main, /friendService = \{ enabled: false \}/);
    assert.match(main, /friendPanel\.dispose\(\)/);
    assert.match(main, /friendPanel\.dialog\.open/);
    assert.match(css, /\.friend-dialog/);
    assert.match(html, /data-friend-create disabled/);
    assert.match(html, /data-friend-accept disabled/);
    assert.match(html, /data-friend-copy disabled/);
});
