-- SkyRacer 3D leaderboard, scoring version 2: floor(10 * distance + 50 * rings).
-- All writes are server-only. Never give browser roles INSERT/UPDATE grants.
create table public.player_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  nickname text not null check (nickname ~ '^[A-Za-z0-9_]{3,16}$'),
  updated_at timestamptz not null default now()
);

create table public.run_sessions (
  run_id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  score integer check (score is null or score >= 0),
  rings integer check (rings is null or rings >= 0),
  distance numeric(16, 6) check (distance is null or distance >= 0),
  score_version smallint not null default 2 check (score_version = 2)
);
create index run_sessions_player_started on public.run_sessions (user_id, started_at desc);

create table public.best_scores (
  user_id uuid primary key references public.player_profiles(user_id) on delete cascade,
  run_id uuid not null references public.run_sessions(run_id),
  score integer not null check (score >= 0),
  rings integer not null check (rings >= 0),
  distance numeric(16, 6) not null check (distance >= 0),
  achieved_at timestamptz not null default now(),
  score_version smallint not null default 2 check (score_version = 2)
);
create index best_scores_global_order on public.best_scores (score desc, achieved_at asc);

alter table public.player_profiles enable row level security;
alter table public.run_sessions enable row level security;
alter table public.best_scores enable row level security;

-- Neither anon nor authenticated users may directly query or mutate tables.
-- Edge Functions use the server-only admin context to access these.
revoke all on public.player_profiles, public.run_sessions, public.best_scores
  from public, anon, authenticated;
grant select, insert, update, delete on
  public.player_profiles, public.run_sessions, public.best_scores to service_role;

-- One atomic transaction claims a completed run and updates the best score.
-- Role is limited to service_role: do not call this function from a browser.
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
  v_is_record boolean := false;
  v_best integer;
begin
  if p_nickname !~ '^[A-Za-z0-9_]{3,16}$'
     or p_score is null or p_score < 1
     or p_rings is null or p_rings < 0
     or p_distance is null or p_distance < 0 then
    raise exception 'Invalid leaderboard result';
  end if;

  -- A duplicate submission cannot be accepted, even under concurrency.
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

  insert into public.player_profiles (user_id, nickname)
  values (p_user_id, p_nickname)
  on conflict (user_id) do update
  set nickname = excluded.nickname, updated_at = now();

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
  returning true into v_is_record;

  select best.score into v_best
  from public.best_scores as best
  where best.user_id = p_user_id;

  return query select coalesce(v_is_record, false), coalesce(v_best, 0);
end;
$$;

revoke all on function public.accept_leaderboard_result(uuid, uuid, text, integer, integer, numeric)
  from public, anon, authenticated;
grant execute on function public.accept_leaderboard_result(uuid, uuid, text, integer, integer, numeric)
  to service_role;

-- The optional automatic-RLS event trigger must not be executable through the Data API.
-- Event triggers continue to run on DDL without these API privileges.
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end;
$$;
