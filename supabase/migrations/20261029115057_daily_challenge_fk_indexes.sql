-- Index both Daily best-score foreign keys for deletion and lookup performance.
-- Additive migration. Neither Classic ranking nor daily scores are modified.
create index daily_best_scores_user_fk_idx on public.daily_best_scores (user_id);
create index daily_best_scores_run_fk_idx on public.daily_best_scores (run_id);
