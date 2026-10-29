-- The black hazard ring changes the seeded Daily course layout.
-- Version 2 gets its own leaderboard per UTC day, preserving all v1 records.
-- Never mutate the previously applied M3 migrations or the Classic tables.
alter table public.daily_run_sessions
    drop constraint daily_run_sessions_course_version_check;
alter table public.daily_run_sessions
    add constraint daily_run_sessions_course_version_check
    check (course_version in (1, 2));
alter table public.daily_run_sessions
    alter column course_version set default 2;

alter table public.daily_best_scores
    drop constraint daily_best_scores_course_version_check;
alter table public.daily_best_scores
    add constraint daily_best_scores_course_version_check
    check (course_version in (1, 2));
alter table public.daily_best_scores
    alter column course_version set default 2;

-- Separate rankings by both UTC date and course revision. Earlier v1 records
-- remain intact rather than being overwritten by incomparable v2 attempts.
alter table public.daily_best_scores
    drop constraint daily_best_scores_pkey;
alter table public.daily_best_scores
    add constraint daily_best_scores_pkey
    primary key (challenge_date, user_id, course_version);
create index daily_best_scores_course_rank_idx
    on public.daily_best_scores (
        challenge_date, course_version, score desc, achieved_at asc
    );

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
    if not found or v_run.submitted_at is not null or v_run.course_version not in (1, 2) then
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
    on conflict (challenge_date, user_id, course_version) do update set
        run_id = excluded.run_id,
        course_version = excluded.course_version,
        score = excluded.score,
        rings = excluded.rings,
        distance = excluded.distance,
        achieved_at = excluded.achieved_at
    where excluded.score > previous.score
    returning score into v_updated_score;

    select best.score into v_best from public.daily_best_scores as best
    where best.user_id = p_user_id and best.challenge_date = v_run.challenge_date
        and best.course_version = v_run.course_version;

    return query select true, (v_updated_score is not null), v_best;
end;
$daily$;

-- RPC signature did not change. Retain service-only access to the new body.
revoke all on function public.accept_daily_challenge_result(
    uuid, uuid, text, integer, integer, numeric
) from public, anon, authenticated;
grant execute on function public.accept_daily_challenge_result(
    uuid, uuid, text, integer, integer, numeric
) to service_role;
