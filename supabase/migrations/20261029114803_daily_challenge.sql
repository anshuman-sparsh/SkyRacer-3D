-- M3: Daily SkyRacer Challenge. Additive: does not modify classic leaderboard.
-- One course/day, server-issued run identity, and per-user best for that UTC day.
create table public.daily_run_sessions (
    run_id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    challenge_date date not null,
    course_version smallint not null default 1 check (course_version = 1),
    started_at timestamptz not null default now(),
    submitted_at timestamptz,
    score integer check (score is null or score >= 0),
    rings integer check (rings is null or rings >= 0),
    distance numeric check (distance is null or distance >= 0)
);
create index daily_run_sessions_user_started
    on public.daily_run_sessions (user_id, started_at desc);

create table public.daily_best_scores (
    challenge_date date not null,
    user_id uuid not null references public.player_profiles(user_id) on delete cascade,
    run_id uuid not null references public.daily_run_sessions(run_id),
    course_version smallint not null default 1 check (course_version = 1),
    score integer not null check (score > 0),
    rings integer not null check (rings >= 0),
    distance numeric not null check (distance >= 0),
    achieved_at timestamptz not null default now(),
    primary key (challenge_date, user_id)
);
create index daily_best_scores_ranked
    on public.daily_best_scores (challenge_date, score desc, achieved_at asc);

alter table public.daily_run_sessions enable row level security;
alter table public.daily_best_scores enable row level security;
revoke all on public.daily_run_sessions, public.daily_best_scores from public, anon, authenticated;
grant select, insert, update on public.daily_run_sessions to service_role;
grant select, insert, update on public.daily_best_scores to service_role;

-- The server checks elapsed time, score plausibility, and UTC-day deadline.
-- This RPC additionally guarantees nickname uniqueness and single-use runs,
-- with atomic personal-best upserts under concurrent requests.
create or replace function public.accept_daily_challenge_result(
    p_user_id uuid, p_run_id uuid, p_nickname text,
    p_score integer, p_rings integer, p_distance numeric
)
returns table (accepted boolean, is_new_best boolean, personal_best integer)
language plpgsql
security invoker
set search_path = ''
as $daily$
declare
    v_run public.daily_run_sessions%rowtype;
    v_nickname text;
    v_updated_score integer;
    v_best integer;
begin
    if p_user_id is null or p_run_id is null or
        p_nickname is null or p_nickname !~ '^[A-Za-z0-9_]{3,16}$' or
        p_score is null or p_score < 1 or p_rings is null or p_rings < 0 or
        p_distance is null or p_distance < 0 then
        raise exception 'INVALID_DAILY_RESULT';
    end if;

    select * into v_run from public.daily_run_sessions
    where run_id = p_run_id and user_id = p_user_id
    for update;
    if not found or v_run.submitted_at is not null or v_run.course_version <> 1 then
        raise exception 'DAILY_RUN_UNAVAILABLE';
    end if;

    -- A nickname is permanent across Classic and Daily. The existing unique
    -- index/immutability trigger protects different authenticated players.
    insert into public.player_profiles (user_id, nickname)
    values (p_user_id, p_nickname) on conflict (user_id) do nothing;
    select nickname into v_nickname from public.player_profiles
    where user_id = p_user_id for update;
    if v_nickname is distinct from p_nickname then
        raise exception 'NICKNAME_LOCKED';
    end if;

    update public.daily_run_sessions set
        submitted_at = now(), score = p_score,
        rings = p_rings, distance = p_distance
    where run_id = p_run_id and user_id = p_user_id
        and submitted_at is null;
    if not found then raise exception 'DAILY_RUN_UNAVAILABLE'; end if;

    insert into public.daily_best_scores as previous (
        challenge_date, user_id, run_id, course_version, score,
        rings, distance, achieved_at
    ) values (
        v_run.challenge_date, p_user_id, p_run_id, v_run.course_version,
        p_score, p_rings, p_distance, now()
    )
    on conflict (challenge_date, user_id) do update set
        run_id = excluded.run_id,
        course_version = excluded.course_version,
        score = excluded.score,
        rings = excluded.rings,
        distance = excluded.distance,
        achieved_at = excluded.achieved_at
    where excluded.score > previous.score
    returning score into v_updated_score;

    select best.score into v_best from public.daily_best_scores as best
    where best.user_id = p_user_id and best.challenge_date = v_run.challenge_date;

    return query select true, (v_updated_score is not null), v_best;
end;
$daily$;

revoke all on function public.accept_daily_challenge_result(
    uuid, uuid, text, integer, integer, numeric
) from public, anon, authenticated;
grant execute on function public.accept_daily_challenge_result(
    uuid, uuid, text, integer, integer, numeric
) to service_role;

-- Keep the same-day competition lean on the free tier. Only historical daily
-- attempts and bests older than 90 days are removed. Classic data is untouched.
select cron.schedule(
    'skyracer-daily-90d-retention',
    '45 3 * * *',
    $retention$
        delete from public.daily_best_scores
        where challenge_date < (now() at time zone 'UTC')::date - 90;
        delete from public.daily_run_sessions
        where challenge_date < (now() at time zone 'UTC')::date - 90;
    $retention$
);
