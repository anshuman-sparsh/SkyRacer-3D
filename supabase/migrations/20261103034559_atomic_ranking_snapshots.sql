-- Each response is computed by one STABLE SQL statement. List positions,
-- the caller's score/rank and profile therefore share one MVCC snapshot.
CREATE FUNCTION public.classic_leaderboard_snapshot(p_user_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
 WITH ranked AS MATERIALIZED (
   SELECT b.*, p.nickname,
     row_number() OVER (ORDER BY b.score DESC, b.achieved_at ASC, b.user_id ASC) AS ordinal_rank
   FROM public.best_scores b JOIN public.player_profiles p ON p.user_id = b.user_id
 ), top_pilots AS (SELECT * FROM ranked ORDER BY ordinal_rank LIMIT 50)
 SELECT jsonb_build_object(
   'entries', coalesce((SELECT jsonb_agg(jsonb_build_object(
     'rank', r.ordinal_rank, 'nickname', r.nickname, 'countryCode', r.country_code,
     'score', r.score, 'rings', r.rings, 'achieved_at', r.achieved_at
   ) ORDER BY r.ordinal_rank) FROM top_pilots r), '[]'::jsonb),
   'profile', (SELECT jsonb_build_object('nickname', p.nickname)
     FROM public.player_profiles p WHERE p.user_id = p_user_id),
   'me', (SELECT jsonb_build_object('score', r.score, 'rings', r.rings,
     'rank', r.ordinal_rank, 'nickname', r.nickname,
     'runId', r.run_id, 'countryCode', r.country_code)
     FROM ranked r WHERE r.user_id = p_user_id)
 );
$$;
REVOKE ALL ON FUNCTION public.classic_leaderboard_snapshot(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.classic_leaderboard_snapshot(uuid) TO service_role;

CREATE FUNCTION public.daily_leaderboard_snapshot(p_user_id uuid, p_date date, p_course_version integer)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
 WITH ranked AS MATERIALIZED (
   SELECT b.*, p.nickname,
     row_number() OVER (ORDER BY b.score DESC, b.achieved_at ASC, b.user_id ASC) AS ordinal_rank
   FROM public.daily_best_scores b JOIN public.player_profiles p ON p.user_id = b.user_id
   WHERE b.challenge_date = p_date AND b.course_version = p_course_version
 ), top_pilots AS (SELECT * FROM ranked ORDER BY ordinal_rank LIMIT 50)
 SELECT jsonb_build_object(
   'entries', coalesce((SELECT jsonb_agg(jsonb_build_object(
     'rank', r.ordinal_rank, 'nickname', r.nickname, 'score', r.score, 'rings', r.rings
   ) ORDER BY r.ordinal_rank) FROM top_pilots r), '[]'::jsonb),
   'nickname', (SELECT p.nickname FROM public.player_profiles p WHERE p.user_id = p_user_id),
   'me', (SELECT jsonb_build_object('score', r.score, 'rings', r.rings, 'rank', r.ordinal_rank)
     FROM ranked r WHERE r.user_id = p_user_id)
 );
$$;
REVOKE ALL ON FUNCTION public.daily_leaderboard_snapshot(uuid,date,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.daily_leaderboard_snapshot(uuid,date,integer) TO service_role;
