-- Compare an accepted Classic run at the precision of run_sessions.distance.
-- Keep independent Friend results, validation, locks and replay checks intact.
CREATE OR REPLACE FUNCTION public.submit_friend_classic_result(
 p_user_id uuid,p_run_id uuid,p_nickname text,p_score integer,p_rings integer,p_distance numeric)
RETURNS TABLE(run_id uuid, score integer, nickname text)
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE r public.run_sessions%ROWTYPE; existing public.friend_classic_results%ROWTYPE;
 oldname text; elapsed numeric; speed_limit numeric; t timestamptz:=clock_timestamp(); n integer;
BEGIN
 IF p_user_id IS NULL OR p_run_id IS NULL OR p_nickname IS NULL
  OR p_nickname !~ '^[A-Za-z0-9_]{3,16}$' THEN RAISE EXCEPTION 'FRIEND_BAD_NICKNAME'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('friend-create:'||p_user_id::text,0));
 SELECT * INTO r FROM public.run_sessions s WHERE s.run_id=p_run_id AND s.user_id=p_user_id FOR UPDATE;
 IF NOT FOUND OR r.score_version<>2 THEN RAISE EXCEPTION 'FRIEND_SOURCE_UNVERIFIED'; END IF;
 SELECT * INTO existing FROM public.friend_classic_results f WHERE f.run_id=p_run_id AND f.user_id=p_user_id;
 IF FOUND THEN
   IF existing.score<>p_score OR existing.rings<>p_rings OR existing.distance<>p_distance
     OR existing.nickname<>p_nickname THEN RAISE EXCEPTION 'FRIEND_RESULT_LOCKED'; END IF;
   RETURN QUERY SELECT existing.run_id, existing.score, existing.nickname;
   RETURN;
 END IF;
 IF p_score IS NULL OR p_score<1 OR p_rings IS NULL OR p_rings<0 OR p_rings>100000
    OR p_distance IS NULL OR p_distance::text IN ('NaN','Infinity','-Infinity')
    OR p_distance<0 OR p_distance>100000000
 THEN RAISE EXCEPTION 'FRIEND_INVALID_RESULT'; END IF;
 elapsed:=extract(epoch from (t-r.started_at));
 IF elapsed<2 OR elapsed>21600 THEN RAISE EXCEPTION 'FRIEND_INVALID_RESULT'; END IF;
 IF abs(floor(p_distance*10+p_rings*50)-p_score)>1 THEN RAISE EXCEPTION 'FRIEND_INVALID_RESULT'; END IF;
 speed_limit:=greatest(50::numeric,(28+floor(p_rings/6.0)*(2.0/3.6))*1.5,
     (165+floor(p_rings/4.0)*5)/3.6);
 IF p_distance>elapsed*speed_limit*1.25+60 OR p_rings>floor(p_distance/12)+8 THEN
   RAISE EXCEPTION 'FRIEND_INVALID_RESULT'; END IF;
 IF r.submitted_at IS NOT NULL AND (r.score<>p_score OR r.rings<>p_rings
  OR r.distance IS DISTINCT FROM round(p_distance, 6)) THEN RAISE EXCEPTION 'FRIEND_RESULT_LOCKED'; END IF;
 SELECT p.nickname INTO oldname FROM public.player_profiles p WHERE p.user_id=p_user_id;
 IF oldname IS NOT NULL AND oldname<>p_nickname THEN RAISE EXCEPTION 'NICKNAME_LOCKED'; END IF;
 IF oldname IS NULL THEN
  INSERT INTO public.player_profiles(user_id,nickname) VALUES(p_user_id,p_nickname);
 END IF;
 SELECT count(*) INTO n FROM public.friend_classic_results f
  WHERE f.user_id=p_user_id AND f.finished_at >= t-interval '1 hour';
 IF n>=30 THEN RAISE EXCEPTION 'FRIEND_RATE_LIMIT'; END IF;
 INSERT INTO public.friend_classic_results(run_id,user_id,score,rings,distance,nickname)
 VALUES(p_run_id,p_user_id,p_score,p_rings,p_distance,p_nickname) RETURNING * INTO existing;
 RETURN QUERY SELECT existing.run_id,existing.score,existing.nickname;
END $$;
REVOKE ALL ON FUNCTION public.submit_friend_classic_result(uuid,uuid,text,integer,integer,numeric)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.submit_friend_classic_result(uuid,uuid,text,integer,integer,numeric)
 TO service_role;

-- Skipping exhausted unsafe obstacle placements changes the seeded course.
-- Preserve old records and separate the corrected Daily layout as version 3.
ALTER TABLE public.daily_run_sessions DROP CONSTRAINT daily_run_sessions_course_version_check;
ALTER TABLE public.daily_run_sessions ADD CONSTRAINT daily_run_sessions_course_version_check
 CHECK (course_version IN (1, 2, 3));
ALTER TABLE public.daily_run_sessions ALTER COLUMN course_version SET DEFAULT 3;
ALTER TABLE public.daily_best_scores DROP CONSTRAINT daily_best_scores_course_version_check;
ALTER TABLE public.daily_best_scores ADD CONSTRAINT daily_best_scores_course_version_check
 CHECK (course_version IN (1, 2, 3));
ALTER TABLE public.daily_best_scores ALTER COLUMN course_version SET DEFAULT 3;

CREATE OR REPLACE FUNCTION public.accept_daily_challenge_result(
 p_user_id uuid, p_run_id uuid, p_nickname text,
 p_score integer, p_rings integer, p_distance numeric)
RETURNS TABLE (accepted boolean, is_new_best boolean, personal_best integer)
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $daily$
DECLARE
 v_run public.daily_run_sessions%ROWTYPE;
 v_nickname text; v_updated_score integer; v_best integer;
BEGIN
 IF p_user_id IS NULL OR p_run_id IS NULL OR
    p_nickname IS NULL OR p_nickname !~ '^[A-Za-z0-9_]{3,16}$' OR
    p_score IS NULL OR p_score < 1 OR p_rings IS NULL OR p_rings < 0 OR
    p_distance IS NULL OR p_distance < 0 THEN
   RAISE EXCEPTION 'INVALID_DAILY_RESULT';
 END IF;
 SELECT * INTO v_run FROM public.daily_run_sessions
 WHERE run_id = p_run_id AND user_id = p_user_id FOR UPDATE;
 IF NOT FOUND OR v_run.submitted_at IS NOT NULL OR v_run.course_version NOT IN (1, 2, 3) THEN
   RAISE EXCEPTION 'DAILY_RUN_UNAVAILABLE';
 END IF;
 INSERT INTO public.player_profiles (user_id, nickname)
 VALUES (p_user_id, p_nickname) ON CONFLICT (user_id) DO NOTHING;
 SELECT nickname INTO v_nickname FROM public.player_profiles
 WHERE user_id = p_user_id FOR UPDATE;
 IF v_nickname IS DISTINCT FROM p_nickname THEN RAISE EXCEPTION 'NICKNAME_LOCKED'; END IF;
 UPDATE public.daily_run_sessions SET
   submitted_at = now(), score = p_score, rings = p_rings, distance = p_distance
 WHERE run_id = p_run_id AND user_id = p_user_id AND submitted_at IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'DAILY_RUN_UNAVAILABLE'; END IF;
 INSERT INTO public.daily_best_scores AS previous (
   challenge_date, user_id, run_id, course_version, score, rings, distance, achieved_at
 ) VALUES (
   v_run.challenge_date, p_user_id, p_run_id, v_run.course_version,
   p_score, p_rings, p_distance, now()
 ) ON CONFLICT (challenge_date, user_id, course_version) DO UPDATE SET
   run_id = excluded.run_id, course_version = excluded.course_version,
   score = excluded.score, rings = excluded.rings,
   distance = excluded.distance, achieved_at = excluded.achieved_at
 WHERE excluded.score > previous.score RETURNING score INTO v_updated_score;
 SELECT best.score INTO v_best FROM public.daily_best_scores AS best
 WHERE best.user_id = p_user_id AND best.challenge_date = v_run.challenge_date
   AND best.course_version = v_run.course_version;
 RETURN QUERY SELECT true, (v_updated_score IS NOT NULL), v_best;
END;
$daily$;
REVOKE ALL ON FUNCTION public.accept_daily_challenge_result(uuid,uuid,text,integer,integer,numeric)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.accept_daily_challenge_result(uuid,uuid,text,integer,integer,numeric)
 TO service_role;
