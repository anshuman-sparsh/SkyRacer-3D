-- M1: Anonymous-session gameplay telemetry (no nicknames, IPs, or URLs).
-- Client events are not authoritative for game scores or achievements.
-- Only the authenticated Edge Function's service-role client can write.
create table public.gameplay_events (
    event_id uuid primary key,
    user_id uuid not null references auth.users(id) on delete cascade,
    session_id uuid not null,
    event_name text not null check (event_name in (
        'game_start', 'game_over', 'second_run',
        'challenge_shared', 'daily_challenge_played'
    )),
    mode text not null check (mode in ('classic', 'practice', 'daily', 'friend')),
    score integer,
    rings integer,
    distance double precision,
    duration_seconds double precision,
    reason text,
    received_at timestamptz not null default now(),
    constraint gameplay_events_metrics_check check (
        (event_name = 'game_over'
            and score is not null and rings is not null
            and distance is not null and duration_seconds is not null
            and reason is not null
            and score between 0 and 2147483647
            and rings between 0 and 100000
            and distance between 0 and 100000000
            and duration_seconds between 0 and 21600
            and reason in ('collision', 'ring-timeout', 'completed'))
        or (event_name <> 'game_over'
            and score is null and rings is null and distance is null
            and duration_seconds is null and reason is null)
    ),
    constraint gameplay_events_event_mode_check check (
        (event_name <> 'daily_challenge_played' or mode = 'daily')
        and (event_name <> 'challenge_shared' or mode <> 'practice')
    )
);

create index gameplay_events_user_received_idx
    on public.gameplay_events (user_id, received_at desc);
create index gameplay_events_received_idx
    on public.gameplay_events (received_at desc);
create index gameplay_events_day_name_idx
    on public.gameplay_events (received_at, event_name);

alter table public.gameplay_events enable row level security;
revoke all on table public.gameplay_events from public, anon, authenticated;
grant select, insert, delete on table public.gameplay_events to service_role;

-- Do rate checks atomically. Service-role only; the user ID is obtained from
-- a verified JWT by the Edge Function, never from the request payload.
create or replace function public.record_gameplay_event(
    p_user_id uuid,
    p_event_id uuid,
    p_session_id uuid,
    p_event_name text,
    p_mode text,
    p_score integer default null,
    p_rings integer default null,
    p_distance double precision default null,
    p_duration_seconds double precision default null,
    p_reason text default null
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $analytics$
declare
    v_now timestamptz := pg_catalog.clock_timestamp();
begin
    if p_user_id is null or p_event_id is null or p_session_id is null then
        raise exception 'ANALYTICS_INVALID_EVENT';
    end if;

    -- Serialize ingestion per anonymous Supabase user. Otherwise concurrent
    -- requests can race past an application-level count before insert.
    perform pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(p_user_id::text, 0)
    );

    -- Replays never double-count and do not burn the user's rate quota.
    if exists (select 1 from public.gameplay_events where event_id = p_event_id) then
        return false;
    end if;

    if (select count(*) from public.gameplay_events
        where user_id = p_user_id and received_at > v_now - interval '1 minute') >= 30
        or (select count(*) from public.gameplay_events
        where user_id = p_user_id and received_at > v_now - interval '24 hours') >= 500 then
        raise exception 'ANALYTICS_RATE_LIMIT' using errcode = 'P0001';
    end if;

    insert into public.gameplay_events (
        event_id, user_id, session_id, event_name, mode,
        score, rings, distance, duration_seconds, reason, received_at
    ) values (
        p_event_id, p_user_id, p_session_id, p_event_name, p_mode,
        p_score, p_rings, p_distance, p_duration_seconds, p_reason, v_now
    );
    return true;
end;
$analytics$;

revoke all on function public.record_gameplay_event(
    uuid, uuid, uuid, text, text, integer, integer, double precision, double precision, text
) from public, anon, authenticated;
grant execute on function public.record_gameplay_event(
    uuid, uuid, uuid, text, text, integer, integer, double precision, double precision, text
) to service_role;

-- Server-only aggregate report for the most recent 30 days. No public data
-- endpoint or player-identifying rows are exposed through this view.
create view public.gameplay_analytics_daily
with (security_invoker = true)
as
select
    (received_at at time zone 'UTC')::date as utc_day,
    count(*) filter (where event_name = 'game_start') as game_starts,
    count(distinct session_id) filter (where event_name = 'game_start') as active_sessions,
    count(*) filter (where event_name = 'second_run') as second_runs,
    count(*) filter (where event_name = 'game_over') as game_overs,
    count(*) filter (where event_name = 'challenge_shared') as challenges_shared,
    count(*) filter (where event_name = 'daily_challenge_played') as daily_challenge_plays,
    round(avg(score) filter (where event_name = 'game_over'), 1) as average_score,
    round(avg(rings) filter (where event_name = 'game_over'), 1) as average_rings,
    round((avg(distance) filter (where event_name = 'game_over'))::numeric, 1) as average_distance,
    round(
        count(*) filter (where event_name = 'game_start')::numeric
            / nullif(count(distinct session_id) filter (where event_name = 'game_start'), 0),
        2
    ) as average_runs_per_session
from public.gameplay_events
where received_at >= now() - interval '30 days'
group by 1;

revoke all on public.gameplay_analytics_daily from public, anon, authenticated;
grant select on public.gameplay_analytics_daily to service_role;

-- Free-tier-friendly daily retention without external infrastructure.
-- The extension is supported by Supabase Cron. The job deletes only old
-- telemetry, never leaderboard, auth, or gameplay progression tables.
create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule(
    'skyracer-analytics-30d-retention',
    '30 3 * * *',
    $cron$delete from public.gameplay_events
          where received_at < now() - interval '30 days'$cron$
);
