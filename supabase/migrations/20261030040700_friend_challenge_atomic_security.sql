
ALTER TABLE public.friend_challenges ADD CONSTRAINT friend_challenge_source_run_fk FOREIGN KEY (source_run_id) REFERENCES public.run_sessions(run_id) ON DELETE RESTRICT;
CREATE UNIQUE INDEX friend_challenges_unique_source_idx ON public.friend_challenges(creator_user_id,source_run_id);

CREATE OR REPLACE FUNCTION public.issue_friend_challenge(p_user_id uuid,p_run_id uuid)
RETURNS TABLE(id uuid,creator_nickname text,target_score integer,expires_at timestamptz)
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE v_run public.run_sessions%ROWTYPE; v_profile text; v_old public.friend_challenges%ROWTYPE; v_new public.friend_challenges%ROWTYPE; n integer; t timestamptz:=clock_timestamp();
BEGIN
 IF p_user_id IS NULL OR p_run_id IS NULL THEN RAISE EXCEPTION 'FRIEND_INVALID'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('friend-create:'||p_user_id::text,0));
 SELECT * INTO v_run FROM public.run_sessions r WHERE r.run_id=p_run_id AND r.user_id=p_user_id;
 IF NOT FOUND OR v_run.submitted_at IS NULL OR v_run.score_version<>2 OR v_run.score IS NULL OR v_run.score<1 THEN RAISE EXCEPTION 'FRIEND_SOURCE_UNVERIFIED'; END IF;
 SELECT p.nickname INTO v_profile FROM public.player_profiles p WHERE p.user_id=p_user_id;
 IF v_profile IS NULL THEN RAISE EXCEPTION 'FRIEND_NICKNAME_REQUIRED'; END IF;
 SELECT * INTO v_old FROM public.friend_challenges c WHERE c.creator_user_id=p_user_id AND c.source_run_id=p_run_id;
 IF FOUND THEN
   IF v_old.expires_at<=t THEN RAISE EXCEPTION 'FRIEND_CHALLENGE_EXPIRED'; END IF;
   RETURN QUERY SELECT v_old.id,v_old.creator_nickname,v_old.target_score,v_old.expires_at; RETURN;
 END IF;
 SELECT count(*) INTO n FROM public.friend_challenges c WHERE c.creator_user_id=p_user_id AND c.created_at>=t-interval '1 hour';
 IF n>=5 THEN RAISE EXCEPTION 'FRIEND_RATE_LIMIT'; END IF;
 SELECT count(*) INTO n FROM public.friend_challenges c WHERE c.creator_user_id=p_user_id AND c.created_at>=t-interval '30 days';
 IF n>=30 THEN RAISE EXCEPTION 'FRIEND_RATE_LIMIT'; END IF;
 INSERT INTO public.friend_challenges(creator_user_id,source_run_id,target_score,creator_nickname)
 VALUES(p_user_id,p_run_id,v_run.score,v_profile) RETURNING * INTO v_new;
 RETURN QUERY SELECT v_new.id,v_new.creator_nickname,v_new.target_score,v_new.expires_at;
END $$;

CREATE OR REPLACE FUNCTION public.register_friend_attempt(p_user_id uuid,p_challenge_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE c public.friend_challenges%ROWTYPE; n integer; rid uuid; t timestamptz:=clock_timestamp();
BEGIN
 IF p_user_id IS NULL OR p_challenge_id IS NULL THEN RAISE EXCEPTION 'FRIEND_INVALID'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('friend-attempt:'||p_user_id::text,0));
 SELECT * INTO c FROM public.friend_challenges f WHERE f.id=p_challenge_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'FRIEND_NOT_FOUND'; END IF;
 IF c.expires_at<=t THEN RAISE EXCEPTION 'FRIEND_CHALLENGE_EXPIRED'; END IF;
 IF c.creator_user_id=p_user_id THEN RAISE EXCEPTION 'FRIEND_SELF_CHALLENGE'; END IF;
 SELECT count(*) INTO n FROM public.friend_runs r WHERE r.challenger_user_id=p_user_id AND r.started_at>=t-interval '1 minute';
 IF n>=8 THEN RAISE EXCEPTION 'FRIEND_RATE_LIMIT'; END IF;
 SELECT count(*) INTO n FROM public.friend_runs r WHERE r.challenger_user_id=p_user_id AND r.started_at>=t-interval '24 hours';
 IF n>=120 THEN RAISE EXCEPTION 'FRIEND_RATE_LIMIT'; END IF;
 SELECT count(*) INTO n FROM public.friend_runs r WHERE r.challenger_user_id=p_user_id AND r.challenge_id=p_challenge_id AND r.started_at>=t-interval '24 hours';
 IF n>=30 THEN RAISE EXCEPTION 'FRIEND_RATE_LIMIT'; END IF;
 INSERT INTO public.friend_runs(challenge_id,challenger_user_id) VALUES(p_challenge_id,p_user_id) RETURNING run_id INTO rid;
 RETURN rid;
END $$;

CREATE OR REPLACE FUNCTION public.accept_friend_result(p_user_id uuid,p_run_id uuid,p_score integer,p_rings integer,p_distance numeric)
RETURNS TABLE(accepted boolean,won boolean,score integer,target_score integer)
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE v_started timestamptz; v_submitted timestamptz; v_expires timestamptz; v_creator uuid; v_target integer;
  v_elapsed numeric; v_speed numeric; v_win boolean; t timestamptz:=clock_timestamp(); n integer;
BEGIN
 IF p_user_id IS NULL OR p_run_id IS NULL THEN RAISE EXCEPTION 'FRIEND_INVALID'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('friend-finish:'||p_user_id::text,0));
 SELECT r.started_at,r.submitted_at,c.expires_at,c.creator_user_id,c.target_score
 INTO v_started,v_submitted,v_expires,v_creator,v_target
 FROM public.friend_runs r JOIN public.friend_challenges c ON c.id=r.challenge_id
 WHERE r.run_id=p_run_id AND r.challenger_user_id=p_user_id FOR UPDATE OF r;
 IF NOT FOUND OR v_submitted IS NOT NULL THEN RAISE EXCEPTION 'FRIEND_RUN_UNAVAILABLE'; END IF;
 IF v_expires<=t THEN RAISE EXCEPTION 'FRIEND_CHALLENGE_EXPIRED'; END IF;
 IF v_creator=p_user_id THEN RAISE EXCEPTION 'FRIEND_SELF_CHALLENGE'; END IF;
 v_elapsed:=extract(epoch from (t-v_started));
 IF v_elapsed<2 OR v_elapsed>3600 OR p_score IS NULL OR p_score<0 OR p_rings IS NULL OR p_rings<0 OR p_rings>100000 OR p_distance IS NULL OR p_distance::text IN ('NaN','Infinity','-Infinity') OR p_distance<0 OR p_distance>100000000 THEN RAISE EXCEPTION 'FRIEND_INVALID_RESULT'; END IF;
 IF abs(floor(p_distance*10+p_rings*50)-p_score)>1 THEN RAISE EXCEPTION 'FRIEND_INVALID_RESULT'; END IF;
 v_speed:=greatest(50::numeric,(28+floor(p_rings/6.0)*(2.0/3.6))*1.5,(165+floor(p_rings/4.0)*5)/3.6);
 IF p_distance>v_elapsed*v_speed*1.25+60 OR p_rings>floor(p_distance/12)+8 THEN RAISE EXCEPTION 'FRIEND_INVALID_RESULT'; END IF;
 SELECT count(*) INTO n FROM public.friend_runs r WHERE r.challenger_user_id=p_user_id AND r.submitted_at>=t-interval '1 hour';
 IF n>=30 THEN RAISE EXCEPTION 'FRIEND_RATE_LIMIT'; END IF;
 v_win:=p_score>v_target;
 UPDATE public.friend_runs r SET submitted_at=t,score=p_score,rings=p_rings,distance=p_distance,won=v_win
 WHERE r.run_id=p_run_id AND r.challenger_user_id=p_user_id AND r.submitted_at IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'FRIEND_RUN_UNAVAILABLE'; END IF;
 RETURN QUERY SELECT true,v_win,p_score,v_target;
END $$;
REVOKE ALL ON FUNCTION public.issue_friend_challenge(uuid,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.register_friend_attempt(uuid,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.accept_friend_result(uuid,uuid,integer,integer,numeric) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.issue_friend_challenge(uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.register_friend_attempt(uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.accept_friend_result(uuid,uuid,integer,integer,numeric) TO service_role;
