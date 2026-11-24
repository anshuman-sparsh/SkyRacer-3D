-- Read from the durable acceptance ledger, including previously verified runs.
-- Keep Classic submission eligibility and the mode-specific rankings separate.
CREATE INDEX hangar_verified_runs_all_time_idx
 ON public.hangar_verified_runs (user_id, score DESC, verified_at, mode, run_id)
 WHERE score > 0;

CREATE FUNCTION public.all_time_leaderboard_snapshot(p_user_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
 WITH best AS (
   SELECT DISTINCT ON (user_id) user_id, score, rings, verified_at, mode, run_id
   FROM public.hangar_verified_runs WHERE score > 0
   ORDER BY user_id, score DESC, verified_at, mode, run_id
 ), ranked AS MATERIALIZED (
   SELECT b.*, p.nickname, c.country_code,
     row_number() OVER (ORDER BY b.score DESC, b.verified_at, b.user_id) AS rank
   FROM best b JOIN public.player_profiles p USING (user_id)
   LEFT JOIN public.best_scores c USING (user_id)
 ), displayed AS MATERIALIZED (
   SELECT user_id, rank, jsonb_build_object('rank',rank,'nickname',nickname,
     'score',score,'rings',rings,'achieved_at',verified_at,'countryCode',country_code,
     'mode',mode,'runId',run_id) AS entry FROM ranked
   WHERE rank <= 50 OR user_id = p_user_id
 )
 SELECT jsonb_build_object(
   'entries', coalesce((SELECT jsonb_agg(entry ORDER BY rank) FROM displayed WHERE rank <= 50), '[]'::jsonb),
   'me', (SELECT entry FROM displayed WHERE user_id = p_user_id)
 );
$$;
REVOKE ALL ON FUNCTION public.all_time_leaderboard_snapshot(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.all_time_leaderboard_snapshot(uuid) TO service_role;
