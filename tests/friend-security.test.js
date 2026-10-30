import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const edge = readFileSync(new URL('../supabase/functions/friend-challenge/index.ts', import.meta.url), 'utf8');
const schema = readFileSync(new URL('../supabase/migrations/20261030040700_friend_challenge_atomic_security.sql', import.meta.url), 'utf8');

test('friend challenge Edge Function requires verified user JWT and atomic server RPCs', () => {
  assert.match(edge, /withSupabase\(\{ auth: 'user' \}/);
  assert.match(edge, /\.rpc\('issue_friend_challenge'/);
  assert.match(edge, /\.rpc\('register_friend_attempt'/);
  assert.match(edge, /\.rpc\('accept_friend_result'/);
  assert.doesNotMatch(edge, /\.from\('friend_runs'\)\s*\.update\(/);
  assert.doesNotMatch(edge, /\.from\('friend_challenges'\)\s*\.insert\(/);
});

test('friend challenge SQL forbids client execution, enforces ownership and guards replay', () => {
  for (const name of ['issue_friend_challenge','register_friend_attempt','accept_friend_result']) {
    assert.match(schema, new RegExp('FUNCTION public\\.' + name));
    assert.match(schema, new RegExp('GRANT EXECUTE ON FUNCTION public\\.' + name));
  }
  assert.match(schema, /SECURITY INVOKER/g);
  assert.doesNotMatch(schema, /SECURITY DEFINER/);
  assert.match(schema, /FROM PUBLIC,anon,authenticated/);
  assert.match(schema, /FOR UPDATE OF r/);
  assert.match(schema, /r\.submitted_at IS NULL/);
  assert.match(schema, /FRIEND_RUN_UNAVAILABLE/);
  assert.match(schema, /FRIEND_SELF_CHALLENGE/);
  assert.match(schema, /FRIEND_RATE_LIMIT/);
  assert.match(schema, /p_score>v_target/);
  assert.match(schema, /friend_challenges_unique_source_idx/);
  assert.match(schema, /friend_challenge_source_run_fk/);
});
