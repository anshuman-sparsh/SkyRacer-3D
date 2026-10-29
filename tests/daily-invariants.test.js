import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('Daily UI selectors are actually present in HTML without new heavy assets', () => {
    const html = read('index.html');
    const controller = read('src/ui/DailyChallengePanel.js');
    const main = read('src/main.js');
    const selectors = [
        ...controller.matchAll(/document\.querySelector\('\[data-([a-z0-9-]+)\]'\)/g),
        ...main.matchAll(/document\.querySelector\('\[data-([a-z0-9-]+)\]'\)/g),
    ].map((match) => match[1]);
    for (const selector of selectors) {
        assert.ok(html.includes('data-' + selector),
            'Missing required interface target: ' + selector);
    }
    assert.match(html, /data-daily-countdown/);
    assert.match(html, /data-classic-mode/);
    assert.match(html, /data-daily-nickname/);
});

test('daily SQL schema cannot overwrite Classic scores and enforces single best per day', () => {
    const sql = read('supabase/migrations/20261029114803_daily_challenge.sql');
    assert.match(sql, /primary key \(challenge_date, user_id\)/);
    assert.match(sql, /where excluded\.score > previous\.score/);
    assert.match(sql, /for update/);
    assert.match(sql, /alter table public\.daily_best_scores enable row level security/);
    assert.match(sql, /revoke all on public\.daily_run_sessions, public\.daily_best_scores/);
    assert.match(sql, /grant execute on function public\.accept_daily_challenge_result/);
    assert.doesNotMatch(sql, /(?:delete from|truncate|alter table)\s+public\.(?:best_scores|run_sessions)\b/i);
});

test('daily JWT and date origin remain server-managed', () => {
    const config = read('supabase/config.toml');
    const endpoint = read('supabase/functions/daily-challenge/index.ts');
    assert.match(config, /\[functions\.daily-challenge\]\s*verify_jwt = true/);
    assert.match(endpoint, /withSupabase\(\{ auth: 'user' \}/);
    assert.match(endpoint, /const today = utcDateAt\(now\)/);
    assert.match(endpoint, /challenge_date: today/);
    assert.match(endpoint, /isDailySubmissionOpen\(run\.challenge_date, now\)/);
    assert.doesNotMatch(endpoint, /\.from\('best_scores'\)/);
    assert.doesNotMatch(endpoint, /\.from\('run_sessions'\)/);
});


test('hazard-enabled Daily v2 never combines rankings with earlier course versions', () => {
    const endpoint = read('supabase/functions/daily-challenge/index.ts');
    const validation = read('supabase/functions/daily-challenge/validation.js');
    const course = read('src/utils/DailyChallenge.js');
    const sql = read('supabase/migrations/20261029130807_black_ring_daily_course_v2.sql');
    assert.match(validation, /DAILY_COURSE_VERSION = 2/);
    assert.match(course, /DAILY_COURSE_VERSION = 2/);
    assert.ok((endpoint.match(/\.eq\('course_version', DAILY_COURSE_VERSION\)/g) ?? []).length >= 4);
    assert.match(sql, /primary key \(challenge_date, user_id, course_version\)/);
    assert.match(sql, /on conflict \(challenge_date, user_id, course_version\) do update/);
    assert.match(sql, /and best\.course_version = v_run\.course_version/);
    assert.doesNotMatch(sql, /truncate|delete from public\.best_scores/i);
});
