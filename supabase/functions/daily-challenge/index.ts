// M3 Daily Challenge: separate authenticated competition, no Classic writes.
// All course dates and run IDs are issued by this server, never trusted from URL.
import { withSupabase } from 'npm:@supabase/server@^1';
import {
  DAILY_COURSE_VERSION, NICKNAME, RUN_ID, isPlausibleDailyResult,
  isDailySubmissionOpen, utcDateAt,
} from './validation.js';

const TOP = 50;
const bad = (message: string, status = 400) =>
  Response.json({ error: message }, { status, headers: { 'Cache-Control': 'no-store' } });

export default {
  fetch: withSupabase({ auth: 'user' }, async (request, ctx) => {
    const playerId = ctx.userClaims?.id;
    if (!playerId) return bad('A player session is required.', 401);
    const now = Date.now();
    const today = utcDateAt(now);
    if (request.method === 'GET') {
      const { data: best, error: bestError } = await ctx.supabaseAdmin
        .from('daily_best_scores')
        .select('user_id,score,rings,achieved_at,player_profiles(nickname)')
        .eq('challenge_date', today)
        .order('score', { ascending: false })
        .order('achieved_at', { ascending: true })
        .limit(TOP);
      if (bestError) return bad('Daily rankings are temporarily unavailable.', 503);
      const { data: mine, error: mineError } = await ctx.supabaseAdmin
        .from('daily_best_scores')
        .select('score,rings,achieved_at')
        .eq('challenge_date', today).eq('user_id', playerId)
        .maybeSingle();
      if (mineError) return bad('Your daily ranking is temporarily unavailable.', 503);
      const { data: profile, error: profileError } = await ctx.supabaseAdmin
        .from('player_profiles')
        .select('nickname').eq('user_id', playerId).maybeSingle();
      if (profileError) return bad('Your pilot profile is temporarily unavailable.', 503);
      let rank: number | null = null;
      if (mine) {
        const [above, aheadOnTie] = await Promise.all([
          ctx.supabaseAdmin.from('daily_best_scores')
            .select('user_id', { count: 'exact', head: true })
            .eq('challenge_date', today).gt('score', mine.score),
          ctx.supabaseAdmin.from('daily_best_scores')
            .select('user_id', { count: 'exact', head: true })
            .eq('challenge_date', today).eq('score', mine.score)
            .lt('achieved_at', mine.achieved_at),
        ]);
        if (above.error || aheadOnTie.error) return bad('Your daily rank is temporarily unavailable.', 503);
        rank = (above.count ?? 0) + (aheadOnTie.count ?? 0) + 1;
      }
      return Response.json({
        date: today, courseVersion: DAILY_COURSE_VERSION,
        nextResetAt: new Date(Date.parse(today + 'T00:00:00.000Z') + 86400000).toISOString(),
        serverNow: new Date(now).toISOString(),
        entries: (best ?? []).map((entry, i) => ({
          rank: i + 1,
          nickname: entry.player_profiles?.nickname ?? 'Pilot',
          score: entry.score, rings: entry.rings,
        })),
        me: mine ? {
          score: mine.score, rings: mine.rings, rank,
        } : null,
        nickname: profile?.nickname ?? null,
      }, { headers: { 'Cache-Control': 'no-store' } });
    }

    if (request.method !== 'POST') return bad('Method not allowed.', 405);
    const size = Number(request.headers.get('content-length') ?? 0);
    if (!Number.isFinite(size) || size > 2048) return bad('Request is too large.', 413);
    let body: Record<string, unknown>;
    try {
      const raw = await request.text();
      if (raw.length > 2048) return bad('Request is too large.', 413);
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return bad('Invalid request.');
      body = parsed as Record<string, unknown>;
    } catch {
      return bad('Invalid JSON.');
    }

    if (body.action === 'start') {
      const minuteAgo = new Date(now - 60000).toISOString();
      const { count, error: countError } = await ctx.supabaseAdmin
        .from('daily_run_sessions')
        .select('run_id', { count: 'exact', head: true })
        .eq('user_id', playerId).gte('started_at', minuteAgo);
      if (countError) return bad('Could not check attempt limits.', 503);
      if ((count ?? 0) >= 12) return bad('Too many new attempts. Try again shortly.', 429);

      const { data, error } = await ctx.supabaseAdmin
        .from('daily_run_sessions')
        .insert({ user_id: playerId, challenge_date: today, course_version: DAILY_COURSE_VERSION })
        .select('run_id,started_at,challenge_date,course_version').single();
      if (error) return bad('Could not register your daily attempt.', 503);
      const { data: profile } = await ctx.supabaseAdmin
        .from('player_profiles').select('nickname').eq('user_id', playerId).maybeSingle();
      return Response.json({
        runId: data.run_id, date: data.challenge_date,
        courseVersion: data.course_version, startedAt: data.started_at,
        nickname: profile?.nickname ?? null,
      }, { headers: { 'Cache-Control': 'no-store' } });
    }

    if (body.action === 'finish') {
      if (typeof body.runId !== 'string' || !RUN_ID.test(body.runId)
          || typeof body.nickname !== 'string' || !NICKNAME.test(body.nickname)) {
        return bad('Provide your registered nickname and a valid run.', 400);
      }
      const { data: run, error: runError } = await ctx.supabaseAdmin
        .from('daily_run_sessions')
        .select('started_at,challenge_date,course_version,submitted_at')
        .eq('run_id', body.runId).eq('user_id', playerId).maybeSingle();
      if (runError) return bad('Could not verify the daily run.', 503);
      if (!run || run.submitted_at || run.course_version !== DAILY_COURSE_VERSION) {
        return bad('This daily attempt is already submitted or unavailable.', 409);
      }
      if (!isDailySubmissionOpen(run.challenge_date, now)) {
        return bad('This challenge has expired. Try today’s new course.', 409);
      }
      const elapsedSeconds = (now - Date.parse(run.started_at)) / 1000;
      if (!isPlausibleDailyResult(body, elapsedSeconds)) {
        return bad('Your daily result could not be validated.', 400);
      }
      const { data, error } = await ctx.supabaseAdmin.rpc('accept_daily_challenge_result', {
        p_user_id: playerId,
        p_run_id: body.runId,
        p_nickname: body.nickname,
        p_score: body.score,
        p_rings: body.rings,
        p_distance: body.distance,
      });
      if (error) {
        if (error.code === '23505') return bad('This nickname is already registered by another pilot.', 409);
        if (error.message?.includes('NICKNAME_LOCKED')) return bad('Use your original registered nickname.', 409);
        if (error.message?.includes('DAILY_RUN_UNAVAILABLE')) return bad('This daily attempt is already submitted.', 409);
        return bad('Unable to save the daily score.', 503);
      }
      const result = data?.[0];
      if (!result?.accepted) return bad('Daily result could not be saved.', 503);
      return Response.json({
        accepted: true, isNewBest: result.is_new_best,
        personalBest: result.personal_best, date: run.challenge_date,
      }, { headers: { 'Cache-Control': 'no-store' } });
    }
    return bad('Unknown daily action.', 400);
  }),
};
