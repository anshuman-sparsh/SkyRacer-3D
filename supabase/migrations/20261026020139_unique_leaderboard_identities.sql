-- Keep one immutable, case-insensitively unique nickname per anonymous player.
-- Live duplicate cleanup is a separate one-off data operation before this DDL.
-- Existing auth.users and run history remain intact.
create unique index if not exists player_profiles_nickname_ci_unique
  on public.player_profiles (lower(nickname));

-- Defense in depth: even privileged application code cannot silently rename a
-- registered player. Admin maintenance can explicitly disable the trigger if
-- a future account-recovery process requires an identity change.
create or replace function public.prevent_leaderboard_nickname_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.nickname is distinct from old.nickname then
    raise exception using errcode = 'P0001', message = 'NICKNAME_LOCKED';
  end if;
  return new;
end;
$$;

revoke all on function public.prevent_leaderboard_nickname_change()
  from public, anon, authenticated;

drop trigger if exists leaderboard_nickname_immutable on public.player_profiles;
create trigger leaderboard_nickname_immutable
  before update of nickname on public.player_profiles
  for each row
  execute function public.prevent_leaderboard_nickname_change();

-- Enforce player identity and strict personal-best updates inside a single
-- transaction. Locking the existing profile row serializes concurrent finish
-- requests for the same player, including their first accepted submission.
create or replace function public.accept_leaderboard_result(
  p_user_id uuid,
  p_run_id uuid,
  p_nickname text,
  p_score integer,
  p_rings integer,
  p_distance numeric
)
returns table (is_record boolean, personal_best integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_updated_run_id uuid;
  v_registered_nickname text;
  v_previous_score integer;
  v_updated_best integer;
begin
  if p_nickname !~ '^[A-Za-z0-9_]{3,16}$'
     or p_score is null or p_score < 1
     or p_rings is null or p_rings < 0
     or p_distance is null or p_distance < 0 then
    raise exception 'Invalid leaderboard result';
  end if;

  -- First successful submission reserves a nickname globally. Other players
  -- attempting the same spelling in any capitalization hit unique violation.
  insert into public.player_profiles (user_id, nickname)
  values (p_user_id, p_nickname)
  on conflict (user_id) do nothing;

  select nickname into v_registered_nickname
  from public.player_profiles
  where user_id = p_user_id
  for update;

  if v_registered_nickname is distinct from p_nickname then
    raise exception using errcode = 'P0001', message = 'NICKNAME_LOCKED';
  end if;

  select score into v_previous_score
  from public.best_scores
  where user_id = p_user_id;

  if v_previous_score is not null and p_score <= v_previous_score then
    raise exception using errcode = 'P0001', message = 'PERSONAL_BEST_NOT_BEATEN';
  end if;

  -- A run can be finished only once. Errors roll back this update and any
  -- newly inserted profile, so rejected submissions never claim a nickname.
  update public.run_sessions
  set submitted_at = now(),
      score = p_score,
      rings = p_rings,
      distance = p_distance
  where run_id = p_run_id
    and user_id = p_user_id
    and score_version = 2
    and submitted_at is null
  returning run_id into v_updated_run_id;

  if v_updated_run_id is null then
    raise exception 'Run already submitted or unavailable';
  end if;

  insert into public.best_scores as previous
    (user_id, run_id, score, rings, distance, achieved_at, score_version)
  values (p_user_id, p_run_id, p_score, p_rings, p_distance, now(), 2)
  on conflict (user_id) do update
  set run_id = excluded.run_id,
      score = excluded.score,
      rings = excluded.rings,
      distance = excluded.distance,
      achieved_at = excluded.achieved_at,
      score_version = excluded.score_version
  where excluded.score > previous.score
  returning score into v_updated_best;

  if v_updated_best is null then
    raise exception using errcode = 'P0001', message = 'PERSONAL_BEST_NOT_BEATEN';
  end if;

  return query select true, v_updated_best;
end;
$$;

-- This security-definer RPC remains callable only by the server-side role.
revoke all on function public.accept_leaderboard_result(uuid, uuid, text, integer, integer, numeric)
  from public, anon, authenticated;
grant execute on function public.accept_leaderboard_result(uuid, uuid, text, integer, integer, numeric)
  to service_role;
