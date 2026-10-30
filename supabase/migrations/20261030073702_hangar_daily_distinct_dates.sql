-- M5-C refinement: Daily progression counts distinct challenge days,
-- not unlimited retries on one Daily course.
ALTER TABLE public.hangar_verified_runs ADD COLUMN daily_date date;
UPDATE public.hangar_verified_runs h SET daily_date = d.challenge_date
FROM public.daily_run_sessions d WHERE h.mode='daily' AND h.run_id=d.run_id;
CREATE OR REPLACE FUNCTION public.capture_hangar_verified_run()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=''
AS $$
DECLARE v_mode text; v_id uuid; v_owner uuid; v_score integer;
 v_rings integer; v_distance numeric; v_won boolean; v_time timestamptz;
 v_daily date;
BEGIN
 IF TG_TABLE_NAME='best_scores' THEN
  v_mode:='classic';v_id:=NEW.run_id;v_owner:=NEW.user_id;
  v_score:=NEW.score;v_rings:=NEW.rings;v_distance:=NEW.distance;
  v_won:=false;v_time:=NEW.achieved_at;
 ELSIF TG_TABLE_NAME='friend_classic_results' THEN
  v_mode:='classic';v_id:=NEW.run_id;v_owner:=NEW.user_id;
  v_score:=NEW.score;v_rings:=NEW.rings;v_distance:=NEW.distance;
  v_won:=false;v_time:=NEW.finished_at;
 ELSIF TG_TABLE_NAME='daily_run_sessions' THEN
  IF NEW.submitted_at IS NULL THEN RETURN NEW;END IF;
  v_mode:='daily';v_id:=NEW.run_id;v_owner:=NEW.user_id;
  v_score:=NEW.score;v_rings:=NEW.rings;v_distance:=NEW.distance;
  v_won:=false;v_time:=NEW.submitted_at;v_daily:=NEW.challenge_date;
 ELSIF TG_TABLE_NAME='friend_runs' THEN
  IF NEW.submitted_at IS NULL THEN RETURN NEW;END IF;
  v_mode:='friend';v_id:=NEW.run_id;v_owner:=NEW.challenger_user_id;
  v_score:=NEW.score;v_rings:=NEW.rings;v_distance:=NEW.distance;
  v_won:=coalesce(NEW.won,false);v_time:=NEW.submitted_at;
 ELSE RETURN NEW; END IF;
 IF v_owner IS NULL OR v_id IS NULL OR v_score IS NULL OR
 v_rings IS NULL OR v_distance IS NULL OR v_time IS NULL THEN RETURN NEW;END IF;
 INSERT INTO public.hangar_verified_runs(mode,run_id,user_id,score,rings,distance,won,verified_at,daily_date)
 VALUES(v_mode,v_id,v_owner,v_score,v_rings,v_distance,v_won,v_time,v_daily)
 ON CONFLICT (mode,run_id) DO NOTHING;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.capture_hangar_verified_run() FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.get_hangar_progress(p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=''
AS $$
DECLARE v_runs bigint;v_rings bigint;v_distance numeric;v_wins bigint;
 v_daily bigint;v_owned jsonb;
BEGIN
 IF p_user_id IS NULL THEN RAISE EXCEPTION 'HANGAR_USER_REQUIRED';END IF;
 SELECT count(*),coalesce(sum(r.rings),0),coalesce(sum(r.distance),0),
 count(*) FILTER(WHERE r.mode='friend' AND r.won),
 count(DISTINCT r.daily_date) FILTER(WHERE r.mode='daily')
 INTO v_runs,v_rings,v_distance,v_wins,v_daily
 FROM public.hangar_verified_runs r WHERE r.user_id=p_user_id;
 v_owned:=jsonb_build_array('cyan-striker','ember-striker');
 IF v_rings>=100 THEN v_owned:=v_owned||jsonb_build_array('silver-arrow');END IF;
 IF v_distance>=10000 AND v_rings>=500 THEN v_owned:=v_owned||jsonb_build_array('voidrunner');END IF;
 IF v_distance>=25000 AND v_rings>=1500 THEN v_owned:=v_owned||jsonb_build_array('nova-vortex');END IF;
 IF v_wins>=10 AND v_daily>=10 THEN v_owned:=v_owned||jsonb_build_array('apex-overdrive');END IF;
 RETURN jsonb_build_object('verifiedRuns',v_runs,'totalRings',v_rings,
 'totalDistance',v_distance,'friendWins',v_wins,
 'dailyCompletions',v_daily,'unlockedIds',v_owned);
END $$;
REVOKE ALL ON FUNCTION public.get_hangar_progress(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_hangar_progress(uuid) TO service_role;
