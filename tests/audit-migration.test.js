import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { readLeaderboard } from '../supabase/functions/leaderboard/read-leaderboard.js';
import { readDailyLeaderboard } from '../supabase/functions/daily-challenge/ranking.js';

// Actual PostgreSQL/PLpgSQL in memory: no network, Docker, or hosted credentials.
const db = new PGlite();
const migration = name => readFileSync(new URL('../supabase/migrations/' + name, import.meta.url), 'utf8');
const correction = migration('20261103032412_audit_precision_and_daily_course_v3.sql');
const uid = '00000000-0000-4000-8000-000000000001';
const other = '00000000-0000-4000-8000-000000000002';
const id = n => '10000000-0000-4000-8000-' + String(n).padStart(12, '0');
const submitFriend = (run, distance = '123.123456789', user = uid, points = 1231) =>
    db.query('select * from public.submit_friend_classic_result($1,$2,$3,$4,0,$5::numeric)',
        [user, run, 'Pilot', points, distance]);
const submitGlobal = (run, distance = '123.123456789', points = 1231) =>
    db.query('select * from public.accept_leaderboard_result($1,$2,$3,$4,0,$5::numeric)',
        [uid, run, 'Pilot', points, distance]);
const createRun = run => db.query(`insert into public.run_sessions(run_id,user_id,started_at)
    values($1,$2,now()-interval '20 seconds')`, [run, uid]);

before(async () => {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
        create schema auth; create table auth.users(id uuid primary key);
        -- Scheduling itself is hosted infrastructure, not part of these RPC tests.
        create schema cron;
        create function cron.schedule(text,text,text) returns bigint language sql as 'select 1::bigint';
        insert into auth.users values('${uid}'),('${other}');`);
    for (const name of [
        '20261025000000_leaderboard.sql',
        '20261026020139_unique_leaderboard_identities.sql',
        '20261027063144_leaderboard_country_codes.sql',
        '20261029114803_daily_challenge.sql',
        '20261029130807_black_ring_daily_course_v2.sql',
        '20261030035540_friend_challenge_backend.sql',
        '20261030040700_friend_challenge_atomic_security.sql',
        '20261030045020_friend_classic_independent_increasing_scores.sql',
        '20261030073352_hangar_verified_progression.sql',
        '20261030073702_hangar_daily_distinct_dates.sql',
    ]) await db.exec(migration(name));
    await db.exec(migration('20261103034559_atomic_ranking_snapshots.sql'));
});
after(() => db.close());

test('migration repairs a real PostgreSQL rounding rejection without losing replay protection', async () => {
    await createRun(id(1));
    await submitGlobal(id(1));
    await assert.rejects(submitFriend(id(1)), /FRIEND_RESULT_LOCKED/);
    await db.exec(correction);
    assert.equal((await submitFriend(id(1))).rows[0].score, 1231);
    await submitFriend(id(1)); // Identical retry is idempotent.
    await assert.rejects(submitFriend(id(1), '123.124456789'), /FRIEND_RESULT_LOCKED/);
    await assert.rejects(submitFriend(id(1), '123.123456789', other), /FRIEND_SOURCE_UNVERIFIED/);
    assert.equal((await db.query('select count(*)::int as n from public.hangar_verified_runs where run_id=$1', [id(1)])).rows[0].n, 1);
    assert.equal((await db.query('select * from public.issue_friend_challenge($1,$2)', [uid, id(1)])).rows[0].target_score, 1231);
});

test('Friend-first and leaderboard-first submissions both preserve one Hangar credit', async () => {
    await createRun(id(2));
    await submitFriend(id(2), '150.123456789', uid, 1501);
    await submitGlobal(id(2), '150.123456789', 1501);
    await submitFriend(id(2), '150.123456789', uid, 1501);
    await createRun(id(3));
    await submitGlobal(id(3), '175.123456789', 1751);
    // Different value remains invalid even before an independent result exists.
    await assert.rejects(submitFriend(id(3), '175.124456789', uid, 1751), /FRIEND_RESULT_LOCKED/);
    await submitFriend(id(3), '175.123456789', uid, 1751);
    const counts = (await db.query(`select run_id,count(*)::int as n from public.hangar_verified_runs
        where mode='classic' group by run_id`)).rows;
    assert.equal(counts.length, 3);
    assert.ok(counts.every(row => row.n === 1));
});

test('v3 accepts old issued Daily attempts but keeps each course ranking separate', async () => {
    for (const version of [1, 2, 3]) {
        await db.query(`insert into public.daily_run_sessions(run_id,user_id,challenge_date,course_version)
            values($1,$2,current_date,$3)`, [id(10 + version), uid, version]);
        await db.query('select * from public.accept_daily_challenge_result($1,$2,$3,1000,0,100)',
            [uid, id(10 + version), 'Pilot']);
    }
    const rows = (await db.query('select course_version,score from public.daily_best_scores order by course_version')).rows;
    assert.deepEqual(rows.map(row => row.course_version), [1, 2, 3]);
    await assert.rejects(db.query('select * from public.accept_daily_challenge_result($1,$2,$3,1000,0,100)',
        [uid, id(13), 'Pilot']), /DAILY_RUN_UNAVAILABLE/);
    assert.equal((await db.query(`select (public.get_hangar_progress($1)->>'dailyCompletions')::int as n`, [uid])).rows[0].n, 1);
    const access = (await db.query(`select
        has_function_privilege('anon','public.submit_friend_classic_result(uuid,uuid,text,integer,integer,numeric)','execute') as anon_friend,
        has_function_privilege('authenticated','public.accept_daily_challenge_result(uuid,uuid,text,integer,integer,numeric)','execute') as client_daily,
        has_function_privilege('service_role','public.accept_daily_challenge_result(uuid,uuid,text,integer,integer,numeric)','execute') as server_daily`)).rows[0];
    assert.deepEqual(access, { anon_friend: false, client_daily: false, server_daily: true });
});

test('SQL snapshot RPCs keep exact ties, Top 50, own rank, date and version in one consistent result', async () => {
    const user = n => '20000000-0000-4000-8000-' + String(n).padStart(12, '0');
    for (let n = 1; n <= 60; n++) {
        await db.query('insert into auth.users values($1)', [user(n)]);
        await db.query('insert into public.player_profiles(user_id,nickname) values($1,$2)', [user(n), 'TiePilot' + n]);
        await db.query('insert into public.run_sessions(run_id,user_id) values($1,$2)', [user(n), user(n)]);
        await db.query(`insert into public.best_scores(user_id,run_id,score,rings,distance,achieved_at)
            values($1,$1,9000,0,900,'2026-11-03T10:00:00Z')`, [user(n)]);
        for (const [date, version, points] of [['2030-01-01', 3, 9000], ['2030-01-01', 2, 99999], ['2030-01-02', 3, 99999]]) {
            const run = (await db.query(`insert into public.daily_run_sessions(user_id,challenge_date,course_version)
                values($1,$2,$3) returning run_id`, [user(n), date, version])).rows[0].run_id;
            await db.query(`insert into public.daily_best_scores(challenge_date,user_id,run_id,course_version,score,rings,distance,achieved_at)
                values($1,$2,$3,$4,$5,0,900,'2026-11-03T10:00:00Z')`, [date, user(n), run, version, points]);
        }
    }
    const rpc = { async rpc(name, args) {
        const result = name === 'classic_leaderboard_snapshot'
            ? await db.query('select public.classic_leaderboard_snapshot($1) as data', [args.p_user_id])
            : await db.query('select public.daily_leaderboard_snapshot($1,$2,$3) as data', [args.p_user_id,args.p_date,args.p_course_version]);
        return { data: result.rows[0].data, error: null };
    } };
    for (const n of [1, 2, 50, 60]) {
        const classic = await readLeaderboard(rpc, user(n));
        const daily = await readDailyLeaderboard(rpc, user(n), '2030-01-01', 3);
        for (const snapshot of [classic, daily]) {
            assert.equal(snapshot.me.rank, n);
            assert.equal(snapshot.entries.length, 50);
            assert.equal(snapshot.entries[0].nickname, 'TiePilot1');
            assert.equal(snapshot.entries[49].nickname, 'TiePilot50');
            assert.equal(snapshot.me.score, 9000);
        }
    }
    await db.query('insert into auth.users values($1)', [user(100)]);
    await db.query('insert into public.player_profiles(user_id,nickname) values($1,$2)', [user(100), 'ProfileOnly']);
    const profileOnly = await readLeaderboard(rpc, user(100));
    assert.equal(profileOnly.me, null);
    assert.deepEqual(profileOnly.profile, { nickname: 'ProfileOnly' });
    const empty = await readDailyLeaderboard(rpc, user(100), '2030-01-03', 3);
    assert.deepEqual(empty.entries, []);
    assert.equal(empty.me, null);
    assert.equal(empty.nickname, 'ProfileOnly');
    // A rival improves: both complete snapshots still report the correct rank.
    await db.query('update public.best_scores set score=9100 where user_id=$1', [user(1)]);
    assert.equal((await readLeaderboard(rpc, user(2))).me.rank, 2);
    const privileges = (await db.query(`select
        has_function_privilege('anon','public.classic_leaderboard_snapshot(uuid)','execute') as anon,
        has_function_privilege('authenticated','public.daily_leaderboard_snapshot(uuid,date,integer)','execute') as client`)).rows[0];
    assert.deepEqual(privileges, { anon: false, client: false });
    await db.exec('set role service_role');
    try { assert.equal((await readLeaderboard(rpc, user(2))).me.rank, 2); }
    finally { await db.exec('reset role'); }
    const definitions = (await db.query(`select provolatile from pg_proc
        where proname in ('classic_leaderboard_snapshot','daily_leaderboard_snapshot')`)).rows;
    assert.ok(definitions.every(row => row.provolatile === 's'));
});
