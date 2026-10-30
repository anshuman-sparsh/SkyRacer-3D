
-- Ordinary Classic results are separate from the personal-best leaderboard.
CREATE TABLE public.friend_classic_results (
 run_id uuid PRIMARY KEY REFERENCES public.run_sessions(run_id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 score integer NOT NULL CHECK (score > 0),
 rings integer NOT NULL CHECK (rings >= 0),
 distance numeric NOT NULL CHECK (distance >= 0),
 nickname text NOT NULL CHECK (nickname ~ '^[A-Za-z0-9_]{3,16}$'),
 finished_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX friend_classic_results_owner_idx
 ON public.friend_classic_results(user_id, finished_at DESC);
ALTER TABLE public.friend_classic_results ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.friend_classic_results FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.friend_classic_results TO service_role;

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
 -- If the run was already accepted by the global leaderboard, its score is immutable.
 IF r.submitted_at IS NOT NULL AND (r.score<>p_score OR r.rings<>p_rings
  OR r.distance IS DISTINCT FROM p_distance) THEN RAISE EXCEPTION 'FRIEND_RESULT_LOCKED'; END IF;
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

-- Shareable challenge creation now requires a strictly increasing verified
-- friend score from a Classic run started after the most recent challenge.
CREATE OR REPLACE FUNCTION public.issue_friend_challenge(p_user_id uuid,p_run_id uuid)
RETURNS TABLE(id uuid,creator_nickname text,target_score integer,expires_at timestamptz)
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE r public.run_sessions%ROWTYPE; f public.friend_classic_results%ROWTYPE;
 previous public.friend_challenges%ROWTYPE; oldchallenge public.friend_challenges%ROWTYPE;
 created public.friend_challenges%ROWTYPE;
 nick text; accepted_score integer; n integer; t timestamptz:=clock_timestamp();
BEGIN
 IF p_user_id IS NULL OR p_run_id IS NULL THEN RAISE EXCEPTION 'FRIEND_INVALID'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('friend-create:'||p_user_id::text,0));
 -- Reopening the same completed challenge is idempotent, not a new challenge.
 SELECT * INTO oldchallenge FROM public.friend_challenges c
   WHERE c.creator_user_id=p_user_id AND c.source_run_id=p_run_id;
 IF FOUND THEN
   IF oldchallenge.expires_at<=t THEN RAISE EXCEPTION 'FRIEND_CHALLENGE_EXPIRED'; END IF;
   RETURN QUERY SELECT oldchallenge.id,oldchallenge.creator_nickname,
     oldchallenge.target_score,oldchallenge.expires_at;
   RETURN;
 END IF;
 SELECT * INTO r FROM public.run_sessions s WHERE s.run_id=p_run_id AND s.user_id=p_user_id;
 IF NOT FOUND OR r.score_version<>2 THEN RAISE EXCEPTION 'FRIEND_SOURCE_UNVERIFIED'; END IF;
 SELECT * INTO f FROM public.friend_classic_results q
   WHERE q.run_id=p_run_id AND q.user_id=p_user_id;
 IF FOUND THEN
   accepted_score:=f.score;
   nick:=f.nickname;
 ELSE
   -- Backwards compatibility: an existing leaderboard-accepted Classic run.
   IF r.submitted_at IS NULL OR r.score IS NULL OR r.score<1 THEN
     RAISE EXCEPTION 'FRIEND_SOURCE_UNVERIFIED'; END IF;
   accepted_score:=r.score;
   SELECT p.nickname INTO nick FROM public.player_profiles p WHERE p.user_id=p_user_id;
 END IF;
 IF nick IS NULL THEN RAISE EXCEPTION 'FRIEND_NICKNAME_REQUIRED'; END IF;
 SELECT * INTO previous FROM public.friend_challenges c
   WHERE c.creator_user_id=p_user_id ORDER BY c.created_at DESC,c.id DESC LIMIT 1;
 IF FOUND THEN
   IF accepted_score<=previous.target_score THEN RAISE EXCEPTION 'FRIEND_SCORE_NOT_HIGHER'; END IF;
   IF r.started_at<=previous.created_at THEN RAISE EXCEPTION 'FRIEND_NEEDS_NEW_RUN'; END IF;
 END IF;
 SELECT count(*) INTO n FROM public.friend_challenges c
   WHERE c.creator_user_id=p_user_id AND c.created_at>=t-interval '1 hour';
 IF n>=5 THEN RAISE EXCEPTION 'FRIEND_RATE_LIMIT'; END IF;
 SELECT count(*) INTO n FROM public.friend_challenges c
   WHERE c.creator_user_id=p_user_id AND c.created_at>=t-interval '30 days';
 IF n>=30 THEN RAISE EXCEPTION 'FRIEND_RATE_LIMIT'; END IF;
 INSERT INTO public.friend_challenges(creator_user_id,source_run_id,target_score,creator_nickname)
 VALUES(p_user_id,p_run_id,accepted_score,nick) RETURNING * INTO created;
 RETURN QUERY SELECT created.id,created.creator_nickname,created.target_score,created.expires_at;
END $$;

REVOKE ALL ON FUNCTION public.submit_friend_classic_result(uuid,uuid,text,integer,integer,numeric)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.submit_friend_classic_result(uuid,uuid,text,integer,integer,numeric)
 TO service_role;
REVOKE ALL ON FUNCTION public.issue_friend_challenge(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.issue_friend_challenge(uuid,uuid) TO service_role;
