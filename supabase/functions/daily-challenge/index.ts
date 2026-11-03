// M3 Daily Challenge: separate authenticated competition, no Classic writes.
// All course dates and run IDs are issued by this server, never trusted from URL.
import { withSupabase } from 'npm:@supabase/server@^1';
import { readDailyLeaderboard } from './ranking.js';
import {
  DAILY_COURSE_VERSION, SUPPORTED_DAILY_COURSE_VERSIONS, NICKNAME, RUN_ID, isPlausibleDailyResult,
  isDailySubmissionOpen, utcDateAt,
} from './validation.js';

const bad = (message: string, status = 400) =>
  Response.json({ error: message }, { status, headers: { 'Cache-Control': 'no-store' } });

export default {
  fetch: withSupabase({ auth: 'user' }, async (request, ctx) => {
    const playerId = ctx.userClaims?.id;
    if (!playerId) return bad('A player session is required.', 401);
    const now = Date.now();
    const today = utcDateAt(now);
    if (request.method === 'GET') {
      try {
        const snapshot = await readDailyLeaderboard(ctx.supabaseAdmin, playerId, today, DAILY_COURSE_VERSION);
        return Response.json({
          ...snapshot, date: today, courseVersion: DAILY_COURSE_VERSION,
          nextResetAt: new Date(Date.parse(today + 'T00:00:00.000Z') + 86400000).toISOString(),
          serverNow: new Date(now).toISOString(),
        }, { headers: { 'Cache-Control': 'no-store' } });
      } catch {
        return bad('Daily rankings are temporarily unavailable.', 503);
      }
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
      if (body.courseVersion !== DAILY_COURSE_VERSION) {
        return bad('The Daily course has been updated. Reload the game before starting a new attempt.', 409);
      }
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
      if (!run || run.submitted_at || !SUPPORTED_DAILY_COURSE_VERSIONS.includes(run.course_version)) {
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
