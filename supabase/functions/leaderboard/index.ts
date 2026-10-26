// Supabase Edge Function for SkyRacer 3D's score-version-2 leaderboard.
// The auth wrapper verifies the caller's user JWT, including anonymous accounts,
// and handles browser CORS automatically. Never expose supabaseAdmin in the app.
import { withSupabase } from 'npm:@supabase/server@^1';

const MAX_TOP = 50;
const SCORE_PER_DISTANCE_UNIT = 10;
const RING_BONUS = 50;
const MAX_RUN_SECONDS = 6 * 60 * 60;
const NICKNAME = /^[A-Za-z0-9_]{3,16}$/;
const RUN_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const invalid = (message: string, status = 400) =>
  Response.json({ error: message }, { status });

function plausibleScore(score: unknown, distance: unknown, rings: unknown, elapsedSeconds: number) {
  if (!Number.isSafeInteger(score) || (score as number) < 1) return false;
  if (!Number.isInteger(rings) || (rings as number) < 0 || (rings as number) > 100000) return false;
  if (typeof distance !== 'number' || !Number.isFinite(distance) || distance < 0 || distance > 1e8) return false;
  if (elapsedSeconds < 2 || elapsedSeconds > MAX_RUN_SECONDS) return false;

  const ringCount = rings as number;
  const distanceTravelled = distance as number;
  const expected = Math.floor(distanceTravelled * SCORE_PER_DISTANCE_UNIT + ringCount * RING_BONUS);
  // Allow one point for the client's accumulation of floating-point distances.
  if (Math.abs((score as number) - expected) > 1) return false;

  // Generous ceilings: distance/rings can be below these values in real runs.
  // They discourage simple fraud, but cannot verify browser-only gameplay.
  const potentialBoostedSpeed = (28 + Math.floor(ringCount / 6) * (2 / 3.6)) * 1.5;
  const potentialSurgeSpeed = (165 + Math.floor(ringCount / 4) * 5) / 3.6;
  const maximumSpeed = Math.max(potentialBoostedSpeed, potentialSurgeSpeed, 50);
  if (distanceTravelled > elapsedSeconds * maximumSpeed * 1.25 + 60) return false;
  if (ringCount > Math.floor(distanceTravelled / 12) + 8) return false;
  return true;
}

export default {
  fetch: withSupabase({ auth: 'user' }, async (request, ctx) => {
    const playerId = ctx.userClaims?.id;
    if (!playerId) return invalid('Please sign in before using the leaderboard.', 401);

    // Reads require a player session but do not allow direct table access.
    if (request.method === 'GET') {
      const { data, error } = await ctx.supabaseAdmin
        .from('best_scores')
        .select('user_id, score, rings, achieved_at, player_profiles(nickname)')
        .order('score', { ascending: false })
        .order('achieved_at', { ascending: true })
        .limit(MAX_TOP);
      if (error) return invalid('Leaderboard is temporarily unavailable.', 503);

      const entries = (data ?? []).map((item, index) => ({
        rank: index + 1,
        nickname: item.player_profiles?.nickname ?? 'Pilot',
        score: item.score,
        rings: item.rings,
        achieved_at: item.achieved_at,
      }));
      const { data: mine, error: mineError } = await ctx.supabaseAdmin
        .from('best_scores')
        .select('score, rings')
        .eq('user_id', playerId)
        .maybeSingle();
      if (mineError) return invalid('Your ranking is temporarily unavailable.', 503);

      // The server's registered nickname is authoritative for returning players.
      const { data: profile, error: profileError } = await ctx.supabaseAdmin
        .from('player_profiles')
        .select('nickname')
        .eq('user_id', playerId)
        .maybeSingle();
      if (profileError) return invalid('Player profile is temporarily unavailable.', 503);

      let ownRank: number | null = null;
      if (mine) {
        const { count, error: countError } = await ctx.supabaseAdmin
          .from('best_scores')
          .select('user_id', { count: 'exact', head: true })
          .gt('score', mine.score);
        if (countError) return invalid('Your ranking is temporarily unavailable.', 503);
        ownRank = (count ?? 0) + 1;
      }
      return Response.json({ entries, me: mine ? { ...mine, rank: ownRank, nickname: profile?.nickname ?? null } : null });
    }

    if (request.method !== 'POST') return invalid('Method not allowed.', 405);

    let body: Record<string, unknown>;
    try {
      const parsed = await request.json();
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return invalid('Invalid request.');
      body = parsed as Record<string, unknown>;
    } catch {
      return invalid('Invalid JSON.');
    }

    if (body.action === 'start') {
      const minuteAgo = new Date(Date.now() - 60_000).toISOString();
      const { count, error: countError } = await ctx.supabaseAdmin
        .from('run_sessions')
        .select('run_id', { count: 'exact', head: true })
        .eq('user_id', playerId)
        .gte('started_at', minuteAgo);
      if (countError) return invalid('Cannot start an online run right now.', 503);
      if ((count ?? 0) >= 8) return invalid('Too many online runs. Please try again shortly.', 429);

      const { data, error } = await ctx.supabaseAdmin
        .from('run_sessions')
        .insert({ user_id: playerId, score_version: 2 })
        .select('run_id, started_at')
        .single();
      if (error) return invalid('Could not create an online run.', 503);
      return Response.json({ runId: data.run_id, startedAt: data.started_at });
    }

    if (body.action === 'finish') {
      const nickname = typeof body.nickname === 'string' ? body.nickname.trim() : '';
      if (!NICKNAME.test(nickname)) return invalid('Nickname must be 3–16 letters, numbers or underscores.');
      if (typeof body.runId !== 'string' || !RUN_ID.test(body.runId)) return invalid('Invalid run ID.');

      const { data: run, error: runError } = await ctx.supabaseAdmin
        .from('run_sessions')
        .select('started_at, submitted_at, score_version')
        .eq('run_id', body.runId)
        .eq('user_id', playerId)
        .maybeSingle();
      if (runError) return invalid('Could not verify this run.', 503);
      if (!run || run.submitted_at || run.score_version !== 2) return invalid('Run already submitted or unavailable.', 409);

      // Friendly errors here; the RPC enforces both rules again atomically.
      const { data: registered, error: registeredError } = await ctx.supabaseAdmin
        .from('player_profiles').select('nickname').eq('user_id', playerId).maybeSingle();
      if (registeredError) return invalid('Could not check your registered nickname.', 503);
      if (registered && registered.nickname !== nickname) {
        return invalid(`This account is registered as ${registered.nickname}. Use your original nickname.`, 409);
      }
      const { data: best, error: bestError } = await ctx.supabaseAdmin
        .from('best_scores').select('score').eq('user_id', playerId).maybeSingle();
      if (bestError) return invalid('Could not check your personal best.', 503);
      if (best && (body.score as number) <= best.score) {
        return invalid(`Only a new personal best can be submitted. Beat ${best.score.toLocaleString()} points.`, 409);
      }

      const elapsedSeconds = (Date.now() - new Date(run.started_at).getTime()) / 1000;
      if (!plausibleScore(body.score, body.distance, body.rings, elapsedSeconds)) {
        return invalid('The run could not be validated.');
      }

      const hourAgo = new Date(Date.now() - 60 * 60_000).toISOString();
      const { count, error: countError } = await ctx.supabaseAdmin
        .from('run_sessions')
        .select('run_id', { count: 'exact', head: true })
        .eq('user_id', playerId)
        .gte('submitted_at', hourAgo);
      if (countError) return invalid('Could not check submission limits.', 503);
      if ((count ?? 0) >= 20) return invalid('Too many submissions. Try again later.', 429);

      // This SQL function locks and claims the run atomically, so concurrent
      // requests cannot submit it twice or replace a better score with a worse one.
      const { data, error } = await ctx.supabaseAdmin.rpc('accept_leaderboard_result', {
        p_user_id: playerId,
        p_run_id: body.runId,
        p_nickname: nickname,
        p_score: body.score,
        p_rings: body.rings,
        p_distance: body.distance,
      });
      if (error) {
        if (error.code === '23505' || error.message?.includes('player_profiles_nickname_ci_unique')) {
          return invalid('That nickname is already taken. Please choose another.', 409);
        }
        if (error.message?.includes('NICKNAME_LOCKED')) {
          return invalid('Your nickname is permanently registered. Use the same nickname.', 409);
        }
        if (error.message?.includes('PERSONAL_BEST_NOT_BEATEN')) {
          return invalid('Your score must be higher than your previous personal best.', 409);
        }
        return invalid('This run was already submitted or could not be saved.', 409);
      }
      return Response.json({
        accepted: true,
        isNewPersonalBest: true,
        personalBest: data?.[0]?.personal_best ?? body.score,
      });
    }

    return invalid('Unknown leaderboard action.');
  }),
};
