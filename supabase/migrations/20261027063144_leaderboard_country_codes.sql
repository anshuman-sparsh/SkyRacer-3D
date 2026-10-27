-- Country is derived from the player's IP by a Vercel Function, signed with
-- LEADERBOARD_GEO_SECRET, and verified in the Supabase leaderboard Edge Function.
-- Never accept an unsigned country from browser-controlled data.
-- Store only the two-letter country code attached to the accepted personal best.
-- Historical scores have no verified IP record, so they remain NULL.
alter table public.best_scores
  add column if not exists country_code text
  check (country_code is null or country_code ~ '^[A-Z]{2}$');
