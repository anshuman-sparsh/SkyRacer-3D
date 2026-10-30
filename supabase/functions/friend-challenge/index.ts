// M4-B basic lifecycle. Server snapshots target from an already accepted Classic run.
// More advanced throttling and scoring hardening are reserved for M4-C.
import { withSupabase } from 'npm:@supabase/server@^1';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail = (error: string, status = 400) => Response.json({ error }, { status, headers: { 'Cache-Control': 'no-store' } });
const ok = (value: unknown) => Response.json(value, { headers: { 'Cache-Control': 'no-store' } });
const snapshot = (row: any) => ({
  id: row.id.replaceAll('-', ''), creatorNickname: row.creator_nickname,
  targetScore: row.target_score, expiresAt: row.expires_at,
});
export default {
  fetch: withSupabase({ auth: 'user' }, async (request, ctx) => {
    const uid = ctx.userClaims?.id;
    if (!uid) return fail('Player login required.', 401);
    const db = ctx.supabaseAdmin;
    const now = Date.now();
    if (request.method === 'GET') {
      const id = new URL(request.url).searchParams.get('challenge');
      if (!id || !/^[0-9a-f]{32}$/i.test(id)) return fail('Invalid challenge ID.');
      const uuid = id.replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5');
      const { data, error } = await db.from('friend_challenges')
        .select('id,creator_nickname,target_score,expires_at').eq('id', uuid).maybeSingle();
      if (error) return fail('Challenge temporarily unavailable.', 503);
      if (!data) return fail('Challenge not found.', 404);
      return ok(snapshot(data));
    }
    if (request.method !== 'POST') return fail('Method not allowed.', 405);
    if (Number(request.headers.get('content-length') || 0) > 2048) return fail('Request too large.', 413);
    let body: any;
    try {
      const raw = await request.text();
      if (raw.length > 2048) return fail('Request too large.', 413);
      body = JSON.parse(raw);
      if (!body || typeof body !== 'object' || Array.isArray(body)) return fail('Invalid request.');
    } catch { return fail('Invalid JSON.'); }
    if (body.action === 'create') {
      if (typeof body.runId !== 'string' || !UUID.test(body.runId)) return fail('A verified Classic run is required.');
      const { data: run, error: re } = await db.from('run_sessions')
        .select('run_id,user_id,score,submitted_at').eq('run_id', body.runId).eq('user_id', uid).maybeSingle();
      if (re) return fail('Cannot verify Classic score.', 503);
      if (!run?.submitted_at || !Number.isSafeInteger(run.score) || run.score < 1) return fail('Classic run not yet verified.', 409);
      const { data: profile, error: pe } = await db.from('player_profiles')
        .select('nickname').eq('user_id', uid).maybeSingle();
      if (pe || !profile?.nickname) return fail('Register your pilot nickname first.', 409);
      const { data, error } = await db.from('friend_challenges')
        .insert({ creator_user_id: uid, source_run_id: run.run_id,
          target_score: run.score, creator_nickname: profile.nickname })
        .select('id,creator_nickname,target_score,expires_at').single();
      if (error) return fail('Could not create a challenge.', 503);
      return ok(snapshot(data));
    }
    if (body.action === 'start') {
      if (typeof body.challengeId !== 'string' || !/^[0-9a-f]{32}$/i.test(body.challengeId)) return fail('Invalid challenge ID.');
      const uuid = body.challengeId.replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5');
      const { data: challenge, error } = await db.from('friend_challenges')
        .select('id,expires_at,creator_user_id,target_score').eq('id', uuid).maybeSingle();
      if (error || !challenge) return fail('Challenge not found.', 404);
      if (Date.parse(challenge.expires_at) <= now) return fail('Challenge expired.', 410);
      if (challenge.creator_user_id === uid) return fail('You cannot challenge yourself.', 409);
      const { data: run, error: insertError } = await db.from('friend_runs')
        .insert({ challenge_id: uuid, challenger_user_id: uid }).select('run_id').single();
      if (insertError) return fail('Could not register attempt.', 503);
      return ok({ runId: run.run_id, challengeId: body.challengeId });
    }
    if (body.action === 'finish') {
      if (typeof body.runId !== 'string' || !UUID.test(body.runId)
          || !Number.isSafeInteger(body.score) || body.score < 0 || body.score > 2147483647
          || !Number.isSafeInteger(body.rings) || body.rings < 0 || body.rings > 100000
          || typeof body.distance !== 'number' || !Number.isFinite(body.distance) || body.distance < 0) return fail('Invalid result.');
      if (Math.abs(Math.floor(body.distance * 10 + body.rings * 50) - body.score) > 1) return fail('Inconsistent score.');
      const { data: run, error: runError } = await db.from('friend_runs')
        .select('run_id,submitted_at,started_at,challenge_id,friend_challenges(target_score,expires_at)')
        .eq('run_id', body.runId).eq('challenger_user_id', uid).maybeSingle();
      if (runError || !run || run.submitted_at) return fail('Attempt unavailable or already completed.', 409);
      const ch = Array.isArray(run.friend_challenges) ? run.friend_challenges[0] : run.friend_challenges;
      if (!ch || Date.parse(ch.expires_at) <= now) return fail('Challenge expired.', 410);
      const elapsed = (now - Date.parse(run.started_at)) / 1000;
      if (!Number.isFinite(elapsed) || elapsed < 2 || elapsed > 3600
        || body.distance > elapsed * 100 + 60 || body.rings > body.distance / 12 + 8) return fail('Result could not be verified.');
      const won = body.score > ch.target_score;
      const { data, error } = await db.from('friend_runs')
        .update({ submitted_at: new Date(now).toISOString(),
          score: body.score, rings: body.rings, distance: body.distance, won })
        .eq('run_id', body.runId).eq('challenger_user_id', uid).is('submitted_at', null)
        .select('run_id,won,score').maybeSingle();
      if (error || !data) return fail('Attempt already completed or unavailable.', 409);
      return ok({ accepted: true, won: data.won, score: data.score, targetScore: ch.target_score });
    }
    return fail('Unknown action.');
  }),
};
