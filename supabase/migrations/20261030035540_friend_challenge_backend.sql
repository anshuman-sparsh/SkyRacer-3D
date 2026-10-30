-- M4-B: independent friend challenges, no writes to Classic/Daily records.
create table if not exists public.friend_challenges (
  id uuid primary key default gen_random_uuid(),
  creator_user_id uuid not null references auth.users(id) on delete cascade,
  source_run_id uuid not null,
  target_score integer not null check (target_score > 0),
  creator_nickname text not null check (creator_nickname ~ '^[A-Za-z0-9_]{3,16}$'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 days'),
  constraint friend_challenge_expiration_check check (expires_at > created_at)
);
create index if not exists friend_challenges_owner_recent_idx on public.friend_challenges (creator_user_id, created_at desc);
create index if not exists friend_challenges_expires_idx on public.friend_challenges (expires_at);
create table if not exists public.friend_runs (
  run_id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.friend_challenges(id) on delete cascade,
  challenger_user_id uuid not null references auth.users(id) on delete cascade,
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  score integer check (score is null or score >= 0),
  rings integer check (rings is null or rings >= 0),
  distance numeric check (distance is null or distance >= 0),
  won boolean,
  constraint friend_run_submitted_fields_check check (
    (submitted_at is null and score is null and rings is null and distance is null and won is null)
    or (submitted_at is not null and score is not null and rings is not null and distance is not null and won is not null)
  )
);
create index if not exists friend_runs_challenger_recent_idx on public.friend_runs (challenger_user_id, started_at desc);
create index if not exists friend_runs_challenge_idx on public.friend_runs (challenge_id, submitted_at desc);
create index if not exists friend_runs_expired_cleanup_idx on public.friend_runs (started_at);
alter table public.friend_challenges enable row level security;
alter table public.friend_runs enable row level security;
revoke all on public.friend_challenges from public, anon, authenticated;
revoke all on public.friend_runs from public, anon, authenticated;
grant select, insert, update, delete on public.friend_challenges to service_role;
grant select, insert, update, delete on public.friend_runs to service_role;
